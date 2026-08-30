import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI, { toFile } from "openai";
import { z } from "zod";
import type { Contexto, Secretario } from "@/lib/db/schema";

/**
 * Camada de IA do painel — "o painel faz o trabalho".
 * O Make só entrega a mensagem crua; aqui a gente transcreve o áudio
 * (Whisper) e escreve o release no tom da prefeitura (Claude).
 */

// Modelo do Claude. Sonnet 5 escreve muito bem e é barato pro volume de
// uma prefeitura; dá pra subir pra claude-opus-5 pela env se quiser.
const CLAUDE_MODEL = process.env.AI_MODEL ?? "claude-sonnet-5";

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY não configurada");
    }
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY não configurada");
    }
    _openai = new OpenAI();
  }
  return _openai;
}

/** Transcreve um áudio (URL vinda do WhatsApp/Make) usando o Whisper. */
export async function transcribe(audioUrl: string): Promise<string> {
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`falha ao baixar áudio (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const nome = audioUrl.split("?")[0].split("/").pop() || "audio.ogg";
  const file = await toFile(buf, nome);
  const out = await openai().audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "pt",
  });
  return out.text.trim();
}

const ReleaseSchema = z.object({
  headline: z
    .string()
    .describe(
      "Título jornalístico ativo e direto, SEM ponto final. Começa pela secretaria ou pela prefeitura.",
    ),
  release: z
    .string()
    .describe(
      "Release para imprensa em 3 parágrafos (lide com atribuição; detalhes operacionais; citação do secretário). Texto corrido, sem markdown.",
    ),
  instagram: z
    .string()
    .describe(
      "Legenda para Instagram: leve, com emojis pertinentes e hashtags oficiais + do tema no final.",
    ),
});

export type ReleaseGerado = z.infer<typeof ReleaseSchema>;

/** Monta o contexto (anamnese + modelos) que ensina a IA a escrever no tom certo. */
function composeContext(ctx: Contexto | null, sec: Secretario): string {
  const linhas: string[] = [];
  if (ctx?.prefeito) linhas.push(`Prefeito(a): ${ctx.prefeito}`);
  if (ctx?.vice) linhas.push(`Vice-prefeito(a): ${ctx.vice}`);
  if (ctx?.mandato) linhas.push(`Mandato: ${ctx.mandato}`);
  if (ctx?.lema) linhas.push(`Lema da gestão: ${ctx.lema}`);
  if (ctx?.programa) linhas.push(`Programa de governo: ${ctx.programa}`);
  if (ctx?.tom) linhas.push(`Tom de comunicação desejado: ${ctx.tom}`);
  if (ctx?.bairros) linhas.push(`Bairros/localidades: ${ctx.bairros}`);
  if (ctx?.programas) linhas.push(`Programas e projetos em destaque: ${ctx.programas}`);
  if (ctx?.hashtags) linhas.push(`Hashtags oficiais: ${ctx.hashtags}`);
  if (ctx?.contexto) linhas.push(`Contexto geral da cidade: ${ctx.contexto}`);

  const secLinha = [sec.nome, sec.cargo, sec.secretaria]
    .filter(Boolean)
    .join(" — ");
  linhas.push(`Autor da mensagem: ${secLinha}`);

  const modelos = (ctx?.modelos ?? []).filter(Boolean);
  let bloco = linhas.join("\n");
  if (modelos.length) {
    bloco +=
      "\n\nMODELOS DE RELEASE (use como referência de estilo, estrutura e tom — NÃO copie o conteúdo):\n" +
      modelos.map((m, i) => `--- Modelo ${i + 1} ---\n${m}`).join("\n\n");
  }
  return bloco;
}

/**
 * Gera headline + release + legenda de Instagram a partir da mensagem do
 * secretário, usando o contexto da prefeitura. `imagemBase64` é opcional
 * (foto anexada) para a IA descrever/aproveitar a imagem.
 */
export async function generate(opts: {
  ctx: Contexto | null;
  secretario: Secretario;
  mensagem: string;
  imagem?: { base64: string; mediaType: string } | null;
}): Promise<ReleaseGerado> {
  const { ctx, secretario, mensagem, imagem } = opts;

  const system = `Você é assessor(a) de imprensa institucional de uma prefeitura brasileira. Transforma o relato de um secretário (áudio transcrito, texto ou foto) em material de imprensa pronto para publicar.

PADRÃO EDITORIAL — siga rigorosamente:

TÍTULO (headline): ativo, direto, SEM ponto final. Começa pelo nome da secretaria ou pela "Prefeitura de <município>". Exemplos de estilo:
- "Secretaria de Obras conclui pavimentação da Rua das Flores no Centro"
- "Prefeitura amplia horário de atendimento da UBS da Meia Praia"

RELEASE (3 parágrafos):
1) LIDE: contextualiza + descreve a ação + atribui à secretaria responsável. Fórmula: "A Prefeitura de <município>, por meio da Secretaria de <área>, <verbo> <ação> com o objetivo de <finalidade>." (ou começando pelo contexto/situação).
2) DETALHES OPERACIONAIS: como funciona, quem é atendido, quando, onde, critérios, números — apenas o que estiver no relato ou no contexto.
3) CITAÇÃO: uma frase entre aspas atribuída ao(à) secretário(a) pelo nome e cargo completos. Se o relato não trouxer uma citação, crie uma coerente e sinalize ao final do parágrafo com "[CITAÇÃO SUGERIDA — validar com o(a) secretário(a)]".

TOM: terceira pessoa, institucional, positivo e sóbrio. Sem exclamações, sem superlativos vazios, sem jargão. Respeite o tom pedido pela gestão (abaixo).

REGRAS DURAS:
- Português do Brasil, correção jornalística impecável.
- NÃO invente números, datas, nomes, locais ou fatos que não estejam no relato ou no contexto. Na dúvida, escreva de forma mais geral em vez de inventar.
- Texto corrido, SEM markdown (nada de #, *, listas) no título e no release.

INSTAGRAM: mais leve e direto, com 1–3 emojis pertinentes ao tema. Termine com hashtags: as oficiais da gestão (quando houver no contexto) + do município + do tema. Sem inventar dados.

CONTEXTO DA PREFEITURA E DA GESTÃO (fonte de nomes, cargos, bairros, programas e tom):
${composeContext(ctx, secretario)}`;

  const content: Anthropic.ContentBlockParam[] = [];
  if (imagem) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: imagem.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: imagem.base64,
      },
    });
  }
  content.push({
    type: "text",
    text: `Relato do secretário:\n"""${mensagem}"""\n\nEscreva o material com base nesse relato.`,
  });

  const response = await anthropic().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ReleaseSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("IA não retornou o release no formato esperado");
  return parsed;
}
