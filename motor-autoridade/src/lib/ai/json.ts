/**
 * Extrai o objeto JSON de uma resposta de IA, tolerando cercas de código
 * (```json ... ```) e texto antes/depois do objeto.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Remove cercas de markdown.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Recorta do primeiro { ao último } como fallback.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("Resposta da IA não contém JSON válido.");
  }
}
