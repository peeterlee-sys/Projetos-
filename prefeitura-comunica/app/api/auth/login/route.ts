import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { ok, badRequest } from "@/lib/http";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let body: { email?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Requisição inválida");
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const senha = String(body.senha ?? "");
  if (!email || !senha) return badRequest("Informe e-mail e senha");

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u || !u.ativo || !(await verifyPassword(senha, u.senhaHash))) {
    return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  }

  await setSessionCookie(u.id);
  return ok({ ok: true, redirect: u.papel === "admin" ? "/admin" : "/app" });
}
