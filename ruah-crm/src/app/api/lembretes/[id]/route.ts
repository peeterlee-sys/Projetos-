import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { lembretes } from "@/db/schema";
import { atualizarLembreteSchema } from "@/lib/validation";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = atualizarLembreteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [lembrete] = await db
    .update(lembretes)
    .set(parsed.data)
    .where(eq(lembretes.id, id))
    .returning();

  if (!lembrete) {
    return NextResponse.json({ error: "Lembrete nao encontrado" }, { status: 404 });
  }

  return NextResponse.json(lembrete);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await db.delete(lembretes).where(eq(lembretes.id, id));
  return NextResponse.json({ ok: true });
}
