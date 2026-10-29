import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, pushSubscriptions } from "@/lib/db/schema";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { unauthorized, forbidden, badRequest, newId } from "@/lib/http";
import { ensurePushTable } from "@/lib/push";

/**
 * Equipe de comunicação de uma prefeitura.
 * São os usuários de login (papel "comunicacao") daquela prefeitura — cada um
 * instala o app e ativa as notificações no próprio aparelho para receber o
 * aviso de "release novo". Aqui a própria equipe cadastra e gerencia os colegas.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();

  await ensurePushTable();

  const membros = await db
    .select()
    .from(users)
    .where(and(eq(users.prefeituraId, user.prefeituraId), eq(users.papel, "comunicacao")))
    .orderBy(asc(users.nome));

  // Quantos aparelhos (inscrições push) cada membro tem ativos.
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.prefeituraId, user.prefeituraId));
  const porUser = new Map<string, number>();
  let semDono = 0;
  for (const s of subs) {
    if (s.userId) porUser.set(s.userId, (porUser.get(s.userId) ?? 0) + 1);
    else semDono++;
  }

  return NextResponse.json({
    membros: membros.map((m) => ({
      id: m.id,
      nome: m.nome,
      email: m.email,
      ativo: m.ativo,
      aparelhos: porUser.get(m.id) ?? 0,
      eu: m.id === user.id,
    })),
    aparelhosTotal: subs.length,
    aparelhosSemDono: semDono,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();

  const b = await req.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const senha = String(b.senha ?? "");
  if (!nome) return badRequest("Informe o nome do membro");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest("E-mail inválido");
  if (senha.length < 6) return badRequest("A senha precisa ter ao menos 6 caracteres");

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return badRequest("Já existe um usuário com esse e-mail");

  const id = newId();
  await db.insert(users).values({
    id,
    prefeituraId: user.prefeituraId,
    nome,
    email,
    senhaHash: await hashPassword(senha),
    papel: "comunicacao",
    ativo: true,
  });
  return NextResponse.json({ ok: true, id });
}
