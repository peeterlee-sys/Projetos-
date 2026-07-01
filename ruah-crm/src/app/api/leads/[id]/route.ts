import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { ESTAGIO_LABELS, leads } from "@/db/schema";
import { buscarLeadComRelacoes, registrarHistorico } from "@/lib/leads";
import { atualizarLeadSchema } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lead = await buscarLeadComRelacoes(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead nao encontrado" }, { status: 404 });
  }
  return NextResponse.json(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = atualizarLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [leadAtual] = await db.select().from(leads).where(eq(leads.id, id));
  if (!leadAtual) {
    return NextResponse.json({ error: "Lead nao encontrado" }, { status: 404 });
  }

  const { email, ...resto } = parsed.data;
  const [leadAtualizado] = await db
    .update(leads)
    .set({ ...resto, ...(email !== undefined ? { email: email || null } : {}), updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();

  if (parsed.data.estagio && parsed.data.estagio !== leadAtual.estagio) {
    await registrarHistorico(
      id,
      "mudanca_estagio",
      `Estagio alterado de "${ESTAGIO_LABELS[leadAtual.estagio]}" para "${ESTAGIO_LABELS[parsed.data.estagio]}".`,
    );
  }

  return NextResponse.json(leadAtualizado);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(leads).where(eq(leads.id, id));
  return NextResponse.json({ ok: true });
}
