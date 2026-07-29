/**
 * Decodifica o texto que o Make manda em base64.
 *
 * O documento gerado (requerimento, discurso) vem cheio de aspas e quebras de
 * linha, que quebrariam o corpo JSON se fossem injetadas cruas — por isso o
 * Make manda `base64(...)`, cuja saída é sempre segura dentro do JSON.
 *
 * A função base64 do Make não documenta a codificação de origem. Se o texto
 * vier em UTF-8 (o esperado), a decodificação direta resolve. Se vier em
 * latin1, o UTF-8 produz U+FFFD nos acentos — comuns em português ("ção",
 * "atenção") — e aí refazemos como latin1.
 */
export function decodeBase64Text(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  const utf8 = bytes.toString("utf8");
  return utf8.includes("�") ? bytes.toString("latin1") : utf8;
}
