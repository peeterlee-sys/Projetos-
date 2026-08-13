/**
 * Identidade visual de cada tipo de documento.
 *
 * Cores em hexadecimal, aplicadas por `style` em vez de classe do Tailwind: a
 * lista é montada em tempo de execução a partir do banco, e classe montada por
 * concatenação não sobrevive à varredura do Tailwind.
 */
export type TipoDoc =
  | "requerimento"
  | "projeto_lei"
  | "indicacao"
  | "oficio"
  | "discurso"
  | "materia"
  | "outro";

export type EstiloTipo = {
  label: string;
  /** Cor forte: borda do cartão e texto da etiqueta. */
  cor: string;
  /** Fundo suave da etiqueta. */
  fundo: string;
};

export const TIPOS: Record<TipoDoc, EstiloTipo> = {
  requerimento: { label: "Requerimento", cor: "#1d4ed8", fundo: "#e6edfe" },
  projeto_lei: { label: "Projeto de lei", cor: "#6d28d9", fundo: "#efe9fd" },
  indicacao: { label: "Indicação", cor: "#0369a1", fundo: "#e0f2fe" },
  oficio: { label: "Ofício", cor: "#9f1239", fundo: "#ffe4e9" },
  discurso: { label: "Discurso", cor: "#b45309", fundo: "#fdf0dc" },
  materia: { label: "Matéria", cor: "#0f766e", fundo: "#dcf2ef" },
  outro: { label: "Outro", cor: "#5a6478", fundo: "#eceff4" },
};

export function estiloDe(tipo: string): EstiloTipo {
  return TIPOS[tipo as TipoDoc] ?? TIPOS.outro;
}

/** Ordem dos filtros na tela — do mais legislativo ao mais solto. */
export const ORDEM_TIPOS: TipoDoc[] = [
  "requerimento",
  "projeto_lei",
  "indicacao",
  "oficio",
  "discurso",
  "materia",
  "outro",
];
