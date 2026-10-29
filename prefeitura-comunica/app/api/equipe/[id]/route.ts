import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, pushSubscriptions } from "@/lib/db/schema";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { ok, unauthorized, forbidden, notFound, badRequest } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

/** Busca um membro da equipe (papel comunicacao) dentro da prefeitura do usuário. */
async function membroDaPrefeitura(id: string, prefId: string) {
  const [m] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.id, id), eq(users.prefeituraId, prefId), eq(users.papel, "comunicacao")),
    )
    .limit(1);
  return m ?? null;
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();
  const { id } = await params;

  const m = await membroDaPrefeitura(id, user.prefeituraId);
  if (!m) return notFound("Membro não encontrado");

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (typeof b.ativo === "boolean") {
    if (m.id === user.id && b.ativo === false) {
      return badRequest("Você não pode desativar o seu próprio acesso");
    }
    patch.ativo = b.ativo;
  }
  if (typeof b.nome === "string" && b.nome.trim()) patch.nome = b.nome.trim();
  if (typeof b.senha === "string" && b.senha) {
    if (b.senha.length < 6) return badRequest("A senha precisa ter ao menos 6 caracteres");
    patch.senhaHash = await hashPassword(b.senha);
  }

  if (!Object.keys(patch).length) return badRequest("Nada para atualizar");
  await db.update(users).set(patch).where(eq(users.id, m.id));
  return ok();
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!user.prefeituraId) return forbidden();
  const { id } = await params;

  const m = await membroDaPrefeitura(id, user.prefeituraId);
  if (!m) return notFound("Membro não encontrado");
  if (m.id === user.id) return badRequest("Você não pode remover o seu próprio acesso");

  // Tira também as inscrições de push dos aparelhos dele.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, m.id));
  await db.delete(users).where(eq(users.id, m.id));
  return ok();
}
