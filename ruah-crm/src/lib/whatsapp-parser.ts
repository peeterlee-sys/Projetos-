export interface LeadExtraido {
  nome?: string;
  telefone?: string;
  segmento?: string;
  canalOrigem?: string;
  valor?: number;
}

function capturarCampo(texto: string, rotulos: string[]): string | undefined {
  const alternativas = rotulos.join("|");
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${alternativas})\\s*[:\\-]\\s*(.+)`, "i");
  const match = texto.match(regex);
  return match?.[1]?.trim() || undefined;
}

/**
 * Converte valores monetarios em formato brasileiro (ex: "R$ 15.000,50", "15000", "15,5 mil")
 * para um numero. Retorna undefined se nao conseguir interpretar.
 */
export function parseValorMonetario(bruto: string | undefined): number | undefined {
  if (!bruto) return undefined;
  let texto = bruto
    .toLowerCase()
    .replace(/r\$/g, "")
    .trim();

  const multiplicadorMil = /\bmil\b/.test(texto);
  texto = texto.replace(/\bmil\b/g, "").trim();

  const somenteNumero = texto.replace(/[^\d.,]/g, "");
  if (!somenteNumero) return undefined;

  let normalizado: string;
  if (somenteNumero.includes(",") && somenteNumero.includes(".")) {
    // formato BR: 1.234,56 -> ponto e separador de milhar, virgula e decimal
    normalizado = somenteNumero.replace(/\./g, "").replace(",", ".");
  } else if (somenteNumero.includes(",")) {
    normalizado = somenteNumero.replace(",", ".");
  } else if (somenteNumero.includes(".")) {
    // sem virgula: um ponto seguido de 3 digitos (ex: 22.500) e milhar;
    // seguido de 1-2 digitos (ex: 22.50) e decimal.
    const partes = somenteNumero.split(".");
    const ultimaParte = partes[partes.length - 1];
    normalizado = ultimaParte.length === 3 ? partes.join("") : somenteNumero;
  } else {
    normalizado = somenteNumero;
  }

  const numero = Number.parseFloat(normalizado);
  if (Number.isNaN(numero)) return undefined;
  return multiplicadorMil ? numero * 1000 : numero;
}

/**
 * Extrai dados de lead de uma mensagem de WhatsApp em texto livre.
 * Reconhece rotulos como "Nome:", "Contato:"/"Telefone:", "Segmento:",
 * "Canal:"/"Origem:" e "Valor:"/"Proposta:", em qualquer ordem e caixa.
 */
export function extrairLeadDeMensagem(texto: string): LeadExtraido {
  const nome = capturarCampo(texto, ["nome(?: do contato)?", "cliente"]);
  const telefoneBruto = capturarCampo(texto, ["contato", "telefone", "whatsapp", "fone", "celular"]);
  const segmento = capturarCampo(texto, ["segmento", "setor"]);
  const canalOrigem = capturarCampo(texto, ["canal(?: de origem)?", "origem"]);
  const valorBruto = capturarCampo(texto, ["valor(?: em negocia\\w*)?", "proposta", "orcamento"]);

  const telefone = telefoneBruto?.replace(/[^\d+]/g, "") || undefined;

  return {
    nome,
    telefone,
    segmento,
    canalOrigem,
    valor: parseValorMonetario(valorBruto),
  };
}

export function pareceNovoLead(texto: string, extraido: LeadExtraido): boolean {
  return /novo\s+lead/i.test(texto) || Boolean(extraido.nome);
}
