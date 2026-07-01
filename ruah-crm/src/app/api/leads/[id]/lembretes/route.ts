import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { lembretes } from "@/db/schema";
import { registrarHistorico } from "@/lib/leads";
import { criarLembreteSchema } from "@/lib/validation";
import { formatarDataHora } from "@/lib/format";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = criarLembreteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [lembrete] = await db
    .insert(lembretes)
    .values({ leadId: id, ...parsed.data })
    .returning();

  await registrarHistorico(
    id,
    "sistema",
    `Lembrete criado: "${lembrete.titulo}" em ${formatarDataHora(lembrete.dataHora)}.`,
  );

  return NextResponse.json(lembrete, { status: 201 });
}
