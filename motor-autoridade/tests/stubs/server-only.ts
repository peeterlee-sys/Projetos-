/**
 * Substituto de `server-only` nos testes.
 *
 * O pacote real é fornecido pelo Next e existe só para quebrar o build se um
 * módulo de servidor for importado no cliente. Fora do Next ele não resolve,
 * e sem este substituto não dá para testar nada que tenha essa guarda.
 */
export {};
