#!/usr/bin/env python3
"""Gera o blueprint v35 a partir do que estiver ao vivo no cenário 5669439.

O cenário ao vivo ainda é o v33 — o v34 nunca chegou a ser importado. Este
script aplica de uma vez as correções do v34 e a correção nova, para uma
importação só.

--- Do v34: a regra do destinatário ---
O v33 truncava o documento no aviso e chutava o gênero de quem não estava no
cadastro. Os dois defeitos vinham da redação da regra: "encerre a mensagem com
esta linha" foi lido como ponto de parada, e a estrutura exigia escolher entre
"Ao Excelentíssimo Senhor" e "À Excelentíssima Senhora" logo depois de proibir
inventar tratamento.

--- Novo no v35: quem divide o documento ---
A IA vinha dividindo o texto por conta própria, contando caracteres de cabeça,
a cada 3.500 — e um ofício chegou picotado em quatro mensagens no WhatsApp.

Quem divide agora é o app, que já fazia isso direito e não era usado: o
save_document devolve `partes` prontas em `dividirParaWhatsApp`, com o limite
real de 4.096, documento que cabe voltando inteiro numa parte só e corte
respeitando parágrafo. Ele roda antes do envio, então as partes já estão à mão.

O `split(...; "---CORTE---")` fica como plano B, para o caso de a API não
responder ou de a chamada ser uma repetição (idempotência devolve `duplicate`,
sem partes). Nesse caminho a divisão da IA ainda é o que existe — por isso a
marca continua sendo entendida, mesmo não sendo mais pedida.
"""
import json, sys

SRC = "bp-live.txt"
OUT = "assessor24h-v35.json"

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


def must(mid):
    m = find(bp, mid)
    if m is None:
        sys.exit(f"ERRO: modulo {mid} nao encontrado")
    return m


def trocar(texto, velho, novo, onde):
    if velho not in texto:
        sys.exit(f"ERRO: ancora nao encontrada ({onde})")
    return texto.replace(velho, novo, 1)


mudancas = []

# ════════════════════════════════════════════════════════════════════════════
# 1. Regra do destinatário (mods 12 e 17) — o que era o v34
# ════════════════════════════════════════════════════════════════════════════

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
Essa linha é um acréscimo ao final. Ela NUNCA substitui nem antecipa o fim de nada. Não escreva traço, linha divisória nem separador antes dela."""

ENDER_VELHO = """  "Ao Excelentíssimo Senhor" (ou "À Excelentíssima Senhora", conforme o gênero)"""
ENDER_NOVO = """  Primeira linha, escolhida entre estas três formas — copie a forma inteira, NUNCA monte uma mistura:
    homem na lista oficial ....... "Ao Excelentíssimo Senhor"
    mulher na lista oficial ...... "À Excelentíssima Senhora"
    fora da lista oficial ........ "Ao(À) Excelentíssimo(a) Senhor(a)"
  A preposição acompanha o gênero: "Ao" anda com "Excelentíssimo Senhor", "À" anda com "Excelentíssima Senhora". "À Excelentíssimo Senhor" está errado e nunca deve ser escrito."""

VOC_VELHO = """- Vocativo isolado, conforme o cargo e o gênero: "Excelentíssimo Senhor Presidente," / "Excelentíssima Senhora Secretária,\""""
VOC_NOVO = """- Vocativo isolado, conforme o cargo e o gênero: "Excelentíssimo Senhor Presidente," / "Excelentíssima Senhora Secretária," — ou "Excelentíssimo(a) Senhor(a) Presidente," se o destinatário não estiver na lista oficial"""

ANCORA_FECHO = "\n\nSeja completo e detalhado — NUNCA resuma nem abrevie documentos legislativos."
FECHO_EXTRA = """

O ofício só termina na assinatura, e a assinatura traz a sigla do partido sempre que ela existir — vale igual para destinatário da lista e de fora dela. Nunca pare antes da assinatura, seja qual for a dúvida sobre o destinatário."""

# ════════════════════════════════════════════════════════════════════════════
# 2. Quem divide o documento (mods 12, 17 e 21)
# ════════════════════════════════════════════════════════════════════════════

TAMANHO_NOVO = (
    "REGRA DE TAMANHO (WhatsApp): não se preocupe com o tamanho da resposta e "
    "NUNCA divida o texto você mesmo. Não insira a marca ---CORTE---, nem traço, "
    "nem linha divisória, nem qualquer outro separador. A divisão em mensagens é "
    "feita depois, fora daqui, respeitando parágrafo e o limite real do WhatsApp. "
    "Escreva o documento inteiro, de uma vez, do começo ao fim."
)

for mid in (12, 17):
    m = must(mid)
    bruto = m["mapper"]["dataStructureBodyContent"]
    era_texto = isinstance(bruto, str)
    corpo = json.loads(bruto) if era_texto else bruto

    s = corpo["system"]
    s = trocar(s, REGRA_VELHA, REGRA_NOVA, f"mod {mid}: regra do destinatario")
    s = trocar(s, ENDER_VELHO, ENDER_NOVO, f"mod {mid}: enderecamento")
    s = trocar(s, VOC_VELHO, VOC_NOVO, f"mod {mid}: vocativo")
    s = trocar(s, ANCORA_FECHO, FECHO_EXTRA + ANCORA_FECHO, f"mod {mid}: fecho")

    corte = s.find("REGRA DE TAMANHO (WhatsApp):")
    if corte < 0:
        sys.exit(f"ERRO: mod {mid}: regra de tamanho nao encontrada")
    s = s[:corte] + TAMANHO_NOVO

    corpo["system"] = s
    m["mapper"]["dataStructureBodyContent"] = (
        json.dumps(corpo, ensure_ascii=False, indent=2) if era_texto else corpo
    )
    mudancas.append(f"mod {mid}: regra do destinatario + a IA nao divide mais")

# Mod 21 (PDF -> matéria) guarda o corpo como string JSON crua.
m21 = must(21)
s21 = m21["mapper"]["jsonStringBodyContent"]
TAMANHO_21_VELHO = (
    "REGRA DE TAMANHO (WhatsApp): se a resposta passar de 3.500 caracteres, divida-a "
    "inserindo a marca ---CORTE--- sozinha em uma linha, sempre em quebra natural entre "
    "parágrafos, de modo que nenhum trecho entre marcas passe de 3.500 caracteres. Nunca "
    "comente nem mencione essa marca. Se couber em 3.500 caracteres, não use a marca."
)
m21["mapper"]["jsonStringBodyContent"] = trocar(
    s21, TAMANHO_21_VELHO, TAMANHO_NOVO, "mod 21: regra de tamanho"
)
mudancas.append("mod 21: a IA nao divide mais")

# ════════════════════════════════════════════════════════════════════════════
# 3. Os feeders passam a usar as partes que o app devolve
# ════════════════════════════════════════════════════════════════════════════
# ifempty cobre os dois casos em que `partes` não vem: API fora do ar e chamada
# repetida (a idempotência responde "duplicate", sem partes). Aí vale o plano B.

FEEDERS = {950: (200, 12), 951: (202, 17), 952: (201, 21)}
for feeder, (save, ia) in FEEDERS.items():
    m = must(feeder)
    velho = f'{{{{split({ia}.data.content[1].text; "---CORTE---")}}}}'
    novo = (
        f'{{{{ifempty({save}.data.partes; '
        f'split({ia}.data.content[1].text; "---CORTE---"))}}}}'
    )
    m["mapper"]["array"] = trocar(m["mapper"]["array"], velho, novo, f"feeder {feeder}")
    mudancas.append(f"feeder {feeder}: usa {save}.data.partes, com {ia} como plano B")

# ════════════════════════════════════════════════════════════════════════════
# 4. O envio para de cortar a 4.000
# ════════════════════════════════════════════════════════════════════════════
# O app monta partes de até 4.096 (limite real do WhatsApp, marcador incluído).
# Cortar a 4.000 no envio comeria o fim da parte mais cheia, em silêncio.

for envio, feeder in ((7, 951), (13, 950), (22, 952)):
    m = must(envio)
    velho = f"{{{{substring(trim({feeder}.value); 0; 4000)}}}}"
    novo = f"{{{{substring(trim({feeder}.value); 0; 4096)}}}}"
    m["mapper"]["text"]["body"] = trocar(
        m["mapper"]["text"]["body"], velho, novo, f"envio {envio}"
    )
    mudancas.append(f"envio {envio}: 4.000 -> 4.096")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(bp, f, ensure_ascii=False, indent=2)

print("v35 gerado em", OUT)
for c in mudancas:
    print(" -", c)
