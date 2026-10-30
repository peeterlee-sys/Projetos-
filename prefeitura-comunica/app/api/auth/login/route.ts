import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { ensureSchema } from "@/lib/db/ensure";
import { ok, badRequest } from "@/lib/http";
import { NextResponse } from "next/server";

const MAX_FALHAS = 5; // tentativas antes do bloqueio
const BLOQUEIO_SEG = 15 * 60; // 15 minutos

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

  await ensureSchema();
  const agora = Math.floor(Date.now() / 1000);

  // Rate-limit: bloqueia o e-mail por um tempo após muitas senhas erradas.
  const tr = await db.run(
    sql`SELECT fails, locked_until FROM auth_throttle WHERE email = ${email}`,
  );
  const row = tr.rows?.[0] as { fails?: number; locked_until?: number } | undefined;
  if (row && Number(row.locked_until) > agora) {
    const mins = Math.max(1, Math.ceil((Number(row.locked_until) - agora) / 60));
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ~${mins} min.` },
      { status: 429 },
    );
  }

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const senhaOk = u && u.ativo && (await verifyPassword(senha, u.senhaHash));

  if (!senhaOk) {
    const fails = (row ? Number(row.fails) : 0) + 1;
    const locked = fails >= MAX_FALHAS ? agora + BLOQUEIO_SEG : 0;
    await db.run(
      sql`INSERT INTO auth_throttle (email, fails, locked_until, atualizado_em)
          VALUES (${email}, ${fails}, ${locked}, ${agora})
          ON CONFLICT(email) DO UPDATE SET fails = ${fails}, locked_until = ${locked}, atualizado_em = ${agora}`,
    );
    return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  }

  // Sucesso: zera o contador de tentativas.
  if (row) await db.run(sql`DELETE FROM auth_throttle WHERE email = ${email}`);

  await setSessionCookie(u.id);
  return ok({ ok: true, redirect: u.papel === "admin" ? "/admin" : "/app" });
}
