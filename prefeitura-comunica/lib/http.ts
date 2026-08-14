import { NextResponse } from "next/server";

export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const unauthorized = () =>
  NextResponse.json({ error: "Não autenticado" }, { status: 401 });
export const forbidden = () =>
  NextResponse.json({ error: "Sem permissão" }, { status: 403 });
export const notFound = (m = "Não encontrado") =>
  NextResponse.json({ error: m }, { status: 404 });
export const badRequest = (m: string) =>
  NextResponse.json({ error: m }, { status: 400 });

/** Normaliza telefone para o formato 5547999999999 (com DDI). */
export function normTel(t: string): string {
  const d = String(t ?? "").replace(/\D/g, "");
  if (d.length === 11) return "55" + d;
  return d;
}

export function newId(): string {
  return crypto.randomUUID();
}
