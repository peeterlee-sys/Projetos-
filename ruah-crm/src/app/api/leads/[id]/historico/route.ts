import { NextRequest, NextResponse } from "next/server";
import { registrarHistorico } from "@/lib/leads";
import { criarHistoricoSchema } from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = criarHistoricoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const registro = await registrarHistorico(id, parsed.data.tipo, parsed.data.conteudo, parsed.data.autor);
  return NextResponse.json(registro, { status: 201 });
}
