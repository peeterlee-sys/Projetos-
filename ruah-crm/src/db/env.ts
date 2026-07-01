/**
 * Tokens de acesso do Turso sao JWT (base64url + pontos), entao qualquer
 * caractere fora desse conjunto so pode ter entrado por acidente (espaco,
 * quebra de linha, ou algum caractere invisivel inserido por gerenciador de
 * senha/autofill do navegador ao colar em um campo mascarado). Removemos
 * esse lixo para evitar falhas obscuras no cliente HTTP do libSQL.
 */
export function limparTokenDb(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const limpo = token.trim().replace(/[^A-Za-z0-9\-_.]/g, "");
  return limpo || undefined;
}
