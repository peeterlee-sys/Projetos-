#!/usr/bin/env python3
"""Gera o blueprint v34 a partir do v33 buscado ao vivo.

Corrige dois defeitos do v33, os dois causados pela redacao da propria regra
do destinatario, observados num oficio real de Balneario Camboriu:

1) O documento parava no aviso. "Encerre a mensagem com esta linha" foi lido ao
   pe da letra: o modelo emitia cabecalho, enderecamento, vocativo e ja soltava
   o aviso, sem abertura, corpo, fecho, data nem assinatura.

2) O genero era chutado. A regra mandava nao inventar pronome de tratamento e,
   logo abaixo, a estrutura exigia escolher entre "Ao Excelentissimo Senhor" e
   "A Excelentissima Senhora". Sem saida, o modelo escolhia — e escolheu
   "Senhora" para RODRIGO CARDOSO.
"""
import json, sys

SRC = "bp-v33-live.txt"
OUT = "assessor24h-v34.json"

with open(SRC, encoding="utf-8") as f:
    bp = json.load(f)["blueprint"]


def find(node, mid):
    if isinstance(node, dict):
        if node.get("id") == mid and "module" in node:
            return node
        for v in node.values():
            r = find(v, mid)
            if r is not None:
                return r
    elif isinstance(node, list):
        for v in node:
            r = find(v, mid)
            if r is not None:
                return r
    return None


REGRA_VELHA = """REGRA DO DESTINATÁRIO — NUNCA INVENTE UM NOME:
- Se a autoridade pedida estiver na lista, use o nome, o cargo e o vocativo exatamente como estão escritos lá. O vocativo já vem pronto e com o gênero certo: copie, não recomponha.
- Se a autoridade pedida NÃO estiver na lista, não invente nada — nem nome, nem cargo, nem órgão, nem pronome de tratamento. Escreva exatamente o que o vereador escreveu, do jeito que ele escreveu, e deixe em branco o que ele não informou.
- Nesse caso, e só nesse caso, encerre a mensagem com esta linha, exatamente assim:
_Confira o nome e o cargo do destinatário antes de protocolar — não constam no cadastro da cidade._"""

REGRA_NOVA = """REGRA DO DESTINATÁRIO — dois casos, e só dois:

CASO 1 — a autoridade pedida ESTÁ na lista oficial acima:
Use o nome, o cargo e o vocativo exatamente como estão escritos lá. O vocativo já vem pronto e com o gênero certo: copie, não recomponha.

CASO 2 — a autoridade pedida NÃO está na lista oficial:
a) Escreva o nome e o cargo exatamente como o vereador escreveu. Não corrija, não complete, não acrescente órgão, cargo ou título que ele não tenha dito.
b) NUNCA deduza o gênero — nem pelo primeiro nome, nem pelo cargo, nem pelo resto da frase. Errar o gênero de uma autoridade é pior do que não flexionar. Use a forma dupla, exatamente assim:
   - linha de endereçamento: "Ao(À) Excelentíssimo(a) Senhor(a)"
   - vocativo: "Excelentíssimo(a) Senhor(a) [Cargo],"
   Exceção única: se o próprio vereador disse o gênero ("a secretária Maria", "o presidente Rodrigo"), use a forma que ELE usou.
c) Gere o documento COMPLETO do mesmo jeito — abertura, corpo, fecho de cortesia, local, data e assinatura, tudo. O nome não estar no cadastro NÃO interrompe, NÃO encurta e NÃO altera nenhuma outra parte do documento.
d) Só depois de terminar o documento inteiro, acrescente como ÚLTIMA linha, abaixo da assinatura, exatamente assim:
_Confira o nome e o cargo do destinatário antes de protocolar — não constam no cadastro da cidade._
Essa linha é um acréscimo ao final. Ela NUNCA substitui nem antecipa o fim de nada."""

ENDER_VELHO = """  "Ao Excelentíssimo Senhor" (ou "À Excelentíssima Senhora", conforme o gênero)"""
ENDER_NOVO = """  Primeira linha, escolhida entre estas três formas — copie a forma inteira, NUNCA monte uma mistura:
    homem na lista oficial ....... "Ao Excelentíssimo Senhor"
    mulher na lista oficial ...... "À Excelentíssima Senhora"
    fora da lista oficial ........ "Ao(À) Excelentíssimo(a) Senhor(a)"
  A preposição acompanha o gênero: "Ao" anda com "Excelentíssimo Senhor", "À" anda com "Excelentíssima Senhora". "À Excelentíssimo Senhor" está errado e nunca deve ser escrito."""

VOC_VELHO = """- Vocativo isolado, conforme o cargo e o gênero: "Excelentíssimo Senhor Presidente," / "Excelentíssima Senhora Secretária,\""""
VOC_NOVO = """- Vocativo isolado, conforme o cargo e o gênero: "Excelentíssimo Senhor Presidente," / "Excelentíssima Senhora Secretária," — ou "Excelentíssimo(a) Senhor(a) Presidente," se o destinatário não estiver na lista oficial"""

FIM_VELHO = """- Assinatura: "Ver. """
FIM_NOVO_SUFIXO = """

O ofício só termina na assinatura, e a assinatura traz a sigla do partido sempre que ela existir — vale igual para destinatário da lista e de fora dela. Nunca pare antes da assinatura, seja qual for a dúvida sobre o destinatário."""

mudancas = []

for mid in (12, 17):
    m = find(bp, mid)
    if m is None:
        sys.exit(f"ERRO: modulo {mid} nao encontrado")
    bruto = m["mapper"]["dataStructureBodyContent"]
    era_texto = isinstance(bruto, str)
    corpo = json.loads(bruto) if era_texto else bruto

    s = corpo["system"]
    for velho, novo, rotulo in (
        (REGRA_VELHA, REGRA_NOVA, "regra do destinatario"),
        (ENDER_VELHO, ENDER_NOVO, "linha de enderecamento"),
        (VOC_VELHO, VOC_NOVO, "vocativo"),
    ):
        if velho not in s:
            sys.exit(f"ERRO: modulo {mid}: ancora nao encontrada ({rotulo})")
        s = s.replace(velho, novo, 1)

    # Fecha o caso G reafirmando que o documento vai ate a assinatura.
    anc = "\n\nSeja completo e detalhado — NUNCA resuma nem abrevie documentos legislativos."
    if anc not in s:
        sys.exit(f"ERRO: modulo {mid}: fecho do prompt nao encontrado")
    s = s.replace(anc, FIM_NOVO_SUFIXO + anc, 1)

    corpo["system"] = s
    m["mapper"]["dataStructureBodyContent"] = (
        json.dumps(corpo, ensure_ascii=False, indent=2) if era_texto else corpo
    )
    mudancas.append(f"mod {mid}: regra do destinatario reescrita em dois casos")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(bp, f, ensure_ascii=False, indent=2)

print("v34 gerado em", OUT)
for c in mudancas:
    print(" -", c)
