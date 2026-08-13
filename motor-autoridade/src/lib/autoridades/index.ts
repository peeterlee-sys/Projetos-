import { z } from "zod";

/**
 * Autoridades da cidade — a lista de nomes que os documentos oficiais podem
 * citar. É o admin quem mantém, uma vez por cidade, junto do contexto.
 *
 * A regra que dá razão a este arquivo: o assistente só escreve o nome de uma
 * autoridade se ela estiver AQUI. Pedido que cite alguém de fora da lista sai
 * exatamente como o vereador escreveu, sem tratamento inventado e com aviso de
 * conferência antes de protocolar.
 */
export const autoridadeSchema = z.object({
  /** Já escrito no gênero correto pelo admin: "Prefeita", "Secretário de Obras". */
  cargo: z.string().trim().min(2, "Informe o cargo da autoridade."),
  nome: z.string().trim().min(2, "Informe o nome da autoridade."),
  /** Resolve só o pronome de tratamento — o cargo já vem flexionado. */
  genero: z.enum(["f", "m"]),
  /** Órgão/secretaria, quando faz diferença no endereçamento. */
  orgao: z.string().trim().optional().default(""),
});

export type Autoridade = z.infer<typeof autoridadeSchema>;

export const autoridadesSchema = z.array(autoridadeSchema).max(40);

/**
 * Lê o que veio do banco sem confiar no formato: a coluna é jsonb e pode
 * carregar registro antigo, meio preenchido ou escrito à mão no SQL. O que não
 * casar com o schema é descartado em silêncio — melhor uma autoridade a menos
 * do que um nome quebrado dentro de um ofício protocolado.
 */
export function parseAutoridades(raw: unknown): Autoridade[] {
  if (!Array.isArray(raw)) return [];
  const out: Autoridade[] = [];
  for (const item of raw) {
    const parsed = autoridadeSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** "Excelentíssima Senhora" / "Excelentíssimo Senhor". */
export function tratamentoDe(a: Autoridade): string {
  return a.genero === "f" ? "Excelentíssima Senhora" : "Excelentíssimo Senhor";
}

/** Vocativo pronto: "Excelentíssima Senhora Prefeita Maria Souza". */
export function vocativoDe(a: Autoridade): string {
  return `${tratamentoDe(a)} ${a.cargo} ${a.nome}`.replace(/\s+/g, " ").trim();
}

/**
 * Bloco de texto que vai inteiro para o prompt do Make, no mesmo espírito do
 * `perfil_texto`: uma variável só, já formatada, em vez de o cenário ter que
 * percorrer array — laço dentro do Make é justamente o tipo de módulo que já
 * travou a fila deste cenário antes.
 *
 * Devolve string vazia quando a cidade não tem autoridade cadastrada, e é essa
 * string vazia que o prompt lê como "não há nome nenhum autorizado aqui".
 */
export function autoridadesTexto(autoridades: Autoridade[]): string {
  if (autoridades.length === 0) return "";
  const linhas = autoridades.map((a) => {
    const orgao = a.orgao ? ` — ${a.orgao}` : "";
    return `- ${a.cargo}: ${a.nome}${orgao}\n  Vocativo exato: ${vocativoDe(a)}`;
  });
  return linhas.join("\n");
}
