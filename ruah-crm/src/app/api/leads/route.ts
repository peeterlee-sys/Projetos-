import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { listarLeadsComRelacoes, registrarHistorico } from "@/lib/leads";
import { criarLeadSchema } from "@/lib/validation";

export async function GET() {
  const dados = await listarLeadsComRelacoes();
  return NextResponse.json(dados);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = criarLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, ...resto } = parsed.data;
  const [lead] = await db
    .insert(leads)
    .values({ ...resto, email: email || null })
    .returning();

  await registrarHistorico(lead.id, "sistema", "Lead criado no pipeline.");

  return NextResponse.json(lead, { status: 201 });
}
