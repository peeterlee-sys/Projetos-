/**
 * Telefone brasileiro em forma canônica — a chave que liga o WhatsApp ao
 * perfil do vereador. Guardamos sempre só dígitos com DDI: 5547999999999.
 *
 * O 9º dígito é a armadilha do WhatsApp: o mesmo celular aparece ora como
 * 554799184838 (10 dígitos locais, formato antigo), ora como 5547991848380.
 * Por isso `phoneVariants` devolve as duas formas para a busca no banco.
 */

/** Só os dígitos, sem '+', espaços, parênteses ou traços. */
export function digitsOnly(raw: string): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/**
 * Forma canônica: 55 + DDD (2) + número (8 ou 9 dígitos).
 * Aceita entradas com ou sem DDI e com ou sem o 9º dígito.
 * Retorna null quando o número não tem cara de telefone brasileiro.
 */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = digitsOnly(raw);

  // Remove zeros de discagem nacional/internacional ("0 47…", "00 55…").
  d = d.replace(/^0+/, "");
  if (d.startsWith("055")) d = d.slice(1);

  // Sem DDI: 10 dígitos (fixo/antigo) ou 11 (celular com 9).
  if (d.length === 10 || d.length === 11) d = `55${d}`;

  if (!d.startsWith("55")) return null;
  // Com DDI: 12 (sem o 9º dígito) ou 13 (com o 9º dígito).
  if (d.length !== 12 && d.length !== 13) return null;

  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;

  return d;
}

/**
 * As formas equivalentes do mesmo número (com e sem o 9º dígito), para buscar
 * no banco com `.in("phone", variants)`. Fixos (que começam com 2–5) não
 * ganham variante — o 9º dígito só existe em celular.
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  const canonical = normalizePhoneBR(raw);
  if (!canonical) return [];

  const ddd = canonical.slice(2, 4);
  const local = canonical.slice(4);
  const out = new Set<string>([canonical]);

  if (local.length === 9 && local.startsWith("9")) {
    out.add(`55${ddd}${local.slice(1)}`);
  } else if (local.length === 8 && /^[6-9]/.test(local)) {
    out.add(`55${ddd}9${local}`);
  }

  return [...out];
}

/** Exibição amigável: (47) 99184-8380. Devolve o original se não normalizar. */
export function formatPhoneBR(raw: string | null | undefined): string {
  const canonical = normalizePhoneBR(raw);
  if (!canonical) return raw ?? "";
  const ddd = canonical.slice(2, 4);
  const local = canonical.slice(4);
  const half = local.length === 9 ? 5 : 4;
  return `(${ddd}) ${local.slice(0, half)}-${local.slice(half)}`;
}
