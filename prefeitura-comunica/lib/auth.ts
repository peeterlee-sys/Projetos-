import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, prefeituras, type Prefeitura } from "./db/schema";

const SECRET = process.env.AUTH_SECRET ?? "dev-insecure-secret-troque-em-producao";
const COOKIE = "pv_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function createToken(uid: string): string {
  const body = Buffer.from(
    JSON.stringify({ uid, exp: Date.now() + MAX_AGE * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(token?: string): { uid: string } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || sign(body) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.uid || !data.exp || data.exp < Date.now()) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export type SessionUser = {
  id: string;
  nome: string;
  email: string;
  papel: "admin" | "comunicacao";
  prefeituraId: string | null;
  prefeitura: Prefeitura | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const data = readToken(store.get(COOKIE)?.value);
  if (!data) return null;

  const [u] = await db.select().from(users).where(eq(users.id, data.uid)).limit(1);
  if (!u || !u.ativo) return null;

  let pref: Prefeitura | null = null;
  if (u.prefeituraId) {
    const [p] = await db
      .select()
      .from(prefeituras)
      .where(eq(prefeituras.id, u.prefeituraId))
      .limit(1);
    pref = p ?? null;
  }

  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    prefeituraId: u.prefeituraId,
    prefeitura: pref,
  };
}
