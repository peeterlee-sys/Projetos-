#!/usr/bin/env python3
"""Gera o blueprint v33 do cenario 'Assessor 24h - Oficial' a partir do v32
buscado ao vivo. Acrescenta a opcao 8 do menu: Criar Oficio."""
import json, copy, sys

SRC = "bp-raw.txt"
OUT = "assessor24h-v33.json"

with open(SRC, encoding="utf-8") as f:
    scenario = json.load(f)
bp = scenario["blueprint"]


def find(node, mid):
    """Localiza o modulo pelo id em qualquer profundidade do blueprint."""
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


mudancas = []

# ── 1. MENU (mod 23) ────────────────────────────────────────────────────────
m23 = must(23)
body = m23["mapper"]["text"]["body"]
alvo = "\n\nResponda com o número da opção desejada"
assert alvo in body, "menu: ancora nao encontrada"
body = body.replace(alvo, "\n8️⃣ Criar um Ofício" + alvo, 1)
m23["mapper"]["text"]["body"] = body
mudancas.append("mod 23: opcao 8 no menu")

# ── 2. RESPOSTA DA OPCAO (mod 25) ───────────────────────────────────────────
RESP8 = (
    "Certo! Me diga em áudio ou texto para quem é o ofício (nome e cargo) e o que você "
    "precisa comunicar ou solicitar. Se for resposta a outro documento, me passe o número "
    "dele. Eu monto o ofício completo, no padrão da Câmara. ✉️"
)
m25 = must(25)
val = m25["mapper"]["value"]
fim = val.rfind('")}}')
assert fim > 0, "mod 25: fecho do switch nao encontrado"
m25["mapper"]["value"] = val[: fim + 1] + f'; "8"; "{RESP8}"' + val[fim + 1 :]
mudancas.append("mod 25: resposta da opcao 8")

# ── 3. GRAVA A OPCAO ESCOLHIDA (mod 40) ─────────────────────────────────────
m40 = must(40)
op = m40["mapper"]["data"]["opcao"]
assert '"23467"' in op, "mod 40: lista de opcoes nao encontrada"
m40["mapper"]["data"]["opcao"] = op.replace('"23467"', '"234678"', 1)
mudancas.append("mod 40: opcao 8 memorizada para o proximo turno")

# ── 4. ROTEADOR (mod 6): rotas 5 e 6 ────────────────────────────────────────
router = must(6)
rotas = router["routes"]

# Rota 5 — "Opcao do menu": clona os grupos do "7" trocando para "8".
f5 = rotas[5]["flow"][0]["filter"]
grupos7 = [
    g for g in f5["conditions"]
    if any(c.get("b") == "^7\\W*$" for c in g)
]
assert len(grupos7) == 2, f"rota 5: esperava 2 grupos do 7, achei {len(grupos7)}"
for g in grupos7:
    novo = copy.deepcopy(g)
    for c in novo:
        if c.get("b") == "^7\\W*$":
            c["b"] = "^8\\W*$"
    f5["conditions"].append(novo)
f5["name"] = f5["name"].replace("(1-7)", "(1-8)")
mudancas.append("rota 5: aceita o 8")

# Rota 6 — "Texto recebido": o texto livre nao pode capturar o "8".
f6 = rotas[6]["flow"][0]["filter"]
trocas = 0
for g in f6["conditions"]:
    for c in g:
        if isinstance(c.get("b"), str) and "^[1-7]$" in c["b"]:
            c["b"] = c["b"].replace("^[1-7]$", "^[1-8]$")
            trocas += 1
assert trocas == 2, f"rota 6: esperava 2 trocas, fiz {trocas}"
mudancas.append("rota 6: o 8 deixa de cair no texto livre")

# ── 5. SAVE_DOCUMENT (mods 200 e 202): tipo 'oficio' ────────────────────────
for mid in (200, 202):
    m = must(mid)
    d = m["mapper"]["data"]
    velho = '"7"; "materia"; "outro")'
    assert velho in d, f"mod {mid}: switch de tipo nao encontrado"
    m["mapper"]["data"] = d.replace(velho, '"7"; "materia"; "8"; "oficio"; "outro")', 1)
    mudancas.append(f"mod {mid}: tipo oficio")

# ── 6. PROMPT DA IA (mods 12 audio e 17 texto) ──────────────────────────────
CIDADE = "{{if(16.`__ROW_NUMBER__`; 16.`3`; 100.data.vereador.city)}}"
VEREADOR = "{{if(16.`__ROW_NUMBER__`; 16.`1`; 100.data.vereador.political_name)}}"
# O modelo de oficio assina com a sigla do partido; na planilha antiga nao ha
# coluna de partido, entao vem vazio e o proprio prompt manda omitir.
PARTIDO = "{{100.data.vereador.party}}"

BLOCO_AUTORIDADES = """
=== LISTA OFICIAL DE AUTORIDADES DESTA CIDADE ===
{{100.data.vereador.autoridades_texto}}

Esta lista é a ÚNICA fonte de nomes de autoridade autorizada. Se ela estiver vazia acima, e somente nesse caso, procure os nomes no bloco de contexto da cidade (seções PODER EXECUTIVO e CÂMARA DE VEREADORES).

REGRA DO DESTINATÁRIO — NUNCA INVENTE UM NOME:
- Se a autoridade pedida estiver na lista, use o nome, o cargo e o vocativo exatamente como estão escritos lá. O vocativo já vem pronto e com o gênero certo: copie, não recomponha.
- Se a autoridade pedida NÃO estiver na lista, não invente nada — nem nome, nem cargo, nem órgão, nem pronome de tratamento. Escreva exatamente o que o vereador escreveu, do jeito que ele escreveu, e deixe em branco o que ele não informou.
- Nesse caso, e só nesse caso, encerre a mensagem com esta linha, exatamente assim:
_Confira o nome e o cargo do destinatário antes de protocolar — não constam no cadastro da cidade._
"""

CASO_G = """

SE FOR G (OFÍCIO), gere o OFÍCIO formal COMPLETO, no modelo da Câmara. Aplique a REGRA DO DESTINATÁRIO acima. Estrutura exata, nesta ordem:
- Cabeçalho: *CÂMARA MUNICIPAL DE {CIDADE_UP}* — apenas o nome da Casa. NUNCA escreva endereço, CEP, telefone, site ou e-mail: isso é o papel timbrado, que o vereador já tem.
- Epígrafe: *OFÍCIO VEREADOR Nº ___/[ANO DA DATA DE HOJE]*
- Endereçamento em três linhas, uma embaixo da outra:
  "Ao Excelentíssimo Senhor" (ou "À Excelentíssima Senhora", conforme o gênero)
  NOME DO DESTINATÁRIO EM CAIXA ALTA
  Cargo do destinatário
- Vocativo isolado, conforme o cargo e o gênero: "Excelentíssimo Senhor Presidente," / "Excelentíssima Senhora Secretária,"
- Parágrafo de abertura identificando quem escreve: "Eu, [NOME DO VEREADOR EM CAIXA ALTA], Vereador, venho perante Vossa Excelência [em resposta ao Ofício nº ___, se o vereador citar algum] expor e requerer o que segue:"
- Corpo: de 3 a 6 parágrafos, em linguagem formal, encadeando o assunto — contexto, fundamento e pedido. Quando o vereador citar lei, artigo do Regimento Interno ou resolução, anuncie com "Vejamos:" e transcreva o dispositivo em bloco recuado, com o número do artigo, parágrafos e incisos. Se ele não citar nenhum dispositivo, não invente nenhum.
- Fecho de cortesia: "Sendo o que havia para o momento, aproveito o ensejo para renovar a mais alta e estima consideração."
- "Respeitosamente," em linha isolada
- Local e data: "{CIDADE}, [DATA DE HOJE por extenso]."
- Assinatura: "Ver. {VEREADOR} ({PARTIDO})" — se o partido vier vazio, escreva apenas "Ver. {VEREADOR}", sem os parênteses e sem inventar sigla.
""".replace("{CIDADE_UP}", CIDADE).replace("{CIDADE}", CIDADE).replace("{VEREADOR}", VEREADOR).replace("{PARTIDO}", PARTIDO)

for mid in (12, 17):
    m = must(mid)
    # O Make guarda esse corpo ora como objeto, ora como string JSON, conforme
    # o modulo. Preserva o formato original — trocar o tipo quebra a importacao.
    bruto = m["mapper"]["dataStructureBodyContent"]
    era_texto = isinstance(bruto, str)
    corpo = json.loads(bruto) if era_texto else copy.deepcopy(bruto)

    sistema = corpo["system"]

    # 6a. Lista de autoridades logo antes do bloco que fala de data e genero.
    ancora = "=== AUTORIDADES E DATA (LEIA ANTES DE ESCREVER QUALQUER DOCUMENTO) ==="
    assert ancora in sistema, f"mod {mid}: bloco de autoridades nao encontrado"
    sistema = sistema.replace(ancora, BLOCO_AUTORIDADES.strip() + "\n\n" + ancora, 1)

    # 6b. Oficio na lista de casos.
    anc_casos = "E) DISCURSO PROFERIDO EM TRIBUNA — quando indicado no início da mensagem"
    assert anc_casos in sistema, f"mod {mid}: lista de casos nao encontrada"
    sistema = sistema.replace(
        anc_casos,
        anc_casos + "\nG) OFÍCIO — quando pedir um ofício a uma autoridade, órgão ou secretaria, ou resposta formal a outro ofício",
        1,
    )

    # 6c. Formato do oficio, logo antes da regra de tamanho.
    anc_fim = "\n\nSeja completo e detalhado — NUNCA resuma nem abrevie documentos legislativos."
    assert anc_fim in sistema, f"mod {mid}: fecho do prompt nao encontrado"
    sistema = sistema.replace(anc_fim, CASO_G.rstrip() + anc_fim, 1)

    corpo["system"] = sistema

    # 6d. Mapa opcao -> caso, na mensagem do usuario.
    msg = corpo["messages"][0]["content"]
    anc_mapa = "6 = caso D; 7 = caso E."
    assert anc_mapa in msg, f"mod {mid}: mapa de opcoes nao encontrado"
    corpo["messages"][0]["content"] = msg.replace(
        anc_mapa, "6 = caso D; 7 = caso E; 8 = caso G.", 1
    )

    m["mapper"]["dataStructureBodyContent"] = (
        json.dumps(corpo, ensure_ascii=False, indent=2) if era_texto else corpo
    )
    mudancas.append(f"mod {mid}: caso G + lista de autoridades")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(bp, f, ensure_ascii=False, indent=2)

print("v33 gerado em", OUT)
for c in mudancas:
    print(" -", c)
