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

/**
 * Variações plausíveis de um número BR (com e sem o "9" do celular).
 * A API oficial da Meta costuma entregar o número SEM o nono dígito
 * (554764291220), enquanto o cadastro guarda COM (5547964291220).
 * Retornamos as duas formas para casar na busca do secretário.
 */
export function telVariants(t: string): string[] {
  let d = String(t ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d; // sem DDI
  const out = new Set<string>([d]);
  if (d.startsWith("55") && d.length === 12) {
    // 55 + DD + 8 dígitos → insere o 9
    out.add("55" + d.slice(2, 4) + "9" + d.slice(4));
  }
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") {
    // 55 + DD + 9 + 8 dígitos → remove o 9
    out.add("55" + d.slice(2, 4) + d.slice(5));
  }
  return [...out];
}

export function newId(): string {
  return crypto.randomUUID();
}
