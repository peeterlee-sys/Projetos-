// Helpers do "Gerar card" — cor da secretaria e iniciais da cidade.

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Cada área da secretaria ganha uma cor própria (só a tag, não o card todo). */
const MAPA: { kw: string[]; cor: string }[] = [
  { kw: ["obras", "infraestrutura", "infra", "urbanismo", "pavimenta", "servicos urbanos"], cor: "#1e6fd9" }, // azul
  { kw: ["saude"], cor: "#0a8f5b" }, // verde
  { kw: ["cultura"], cor: "#e03131" }, // vermelho
  { kw: ["educacao", "ensino"], cor: "#e8590c" }, // laranja
  { kw: ["planejamento", "financa", "fazenda", "orcamento", "tributacao"], cor: "#f08c00" }, // âmbar
  { kw: ["assistencia", "social", "cidadania", "mulher"], cor: "#7048e8" }, // roxo
  { kw: ["meio ambiente", "ambiente", "ambiental", "sustentab"], cor: "#099268" }, // verde-azulado
  { kw: ["esporte", "lazer", "juventude"], cor: "#1098ad" }, // ciano
  { kw: ["turismo"], cor: "#0ca678" }, // turquesa
  { kw: ["agricultura", "rural", "pesca", "abastecimento"], cor: "#5c940d" }, // verde-oliva
  { kw: ["seguranca", "transito", "mobilidade", "defesa civil", "guarda"], cor: "#364fc7" }, // azul-escuro
  { kw: ["comunicacao", "imprensa"], cor: "#862e9c" }, // púrpura
  { kw: ["administracao", "gestao", "governo", "gabinete", "recursos humanos"], cor: "#495057" }, // cinza
  { kw: ["habitacao", "moradia"], cor: "#d6336c" }, // rosa
  { kw: ["saneamento", "agua", "aguas"], cor: "#1971c2" }, // azul-água
];

const PALETA = ["#1e6fd9", "#0a8f5b", "#e03131", "#e8590c", "#f08c00", "#7048e8", "#099268", "#1098ad", "#862e9c", "#2f9e44", "#c2255c"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Devolve a cor da secretaria. Áreas conhecidas têm cor fixa; o resto recebe
 *  uma cor estável (sempre a mesma para a mesma secretaria). */
export function corDaSecretaria(secretaria: string): string {
  const s = norm(secretaria);
  if (!s) return "#495057";
  for (const m of MAPA) {
    if (m.kw.some((k) => s.includes(k))) return m.cor;
  }
  return PALETA[hash(s) % PALETA.length];
}

/** Iniciais da cidade para o "logo" circular (ex.: "Balneário Piçarras" → "BP"). */
export function iniciaisCidade(municipio?: string | null, nome?: string | null): string {
  const base = (municipio || (nome || "").replace(/prefeitura\s+(de|da|do)\s+/i, "") || "").trim();
  const palavras = base.split(/\s+/).filter((p) => p && !/^(de|da|do|dos|das|e)$/i.test(p));
  const ini = palavras.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return ini || "PV";
}
