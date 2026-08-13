#!/usr/bin/env python3
"""Roda o prompt do modulo 17 contra o caso que falhou em producao.

Substitui as variaveis do Make pelos valores de um mandato de Balneario
Camboriu e pede um oficio para RODRIGO CARDOSO, que NAO esta na lista de
autoridades — exatamente o cenario que produziu o documento truncado e com
genero errado.
"""
import json, re, sys, urllib.request

BP = sys.argv[1] if len(sys.argv) > 1 else "assessor24h-v34.json"

bp = json.load(open(BP, encoding="utf-8"))


def find(n, mid):
    if isinstance(n, dict):
        if n.get("id") == mid and "module" in n:
            return n
        for v in n.values():
            r = find(v, mid)
            if r is not None:
                return r
    elif isinstance(n, list):
        for v in n:
            r = find(v, mid)
            if r is not None:
                return r


m17 = find(bp, 17)
key = next(h["value"] for h in m17["mapper"]["headers"] if h["name"] == "x-api-key")
bruto = m17["mapper"]["dataStructureBodyContent"]
corpo = json.loads(bruto) if isinstance(bruto, str) else bruto

# Autoridades reais cadastradas — Rodrigo Cardoso NAO esta aqui, de proposito.
AUTORIDADES = """- Prefeito: Fabrício Oliveira — Prefeitura Municipal de Balneário Camboriú
  Vocativo exato: Excelentíssimo Senhor Prefeito Fabrício Oliveira
- Presidente da Câmara: Fernando Sepolh — Câmara Municipal de Balneário Camboriú
  Vocativo exato: Excelentíssimo Senhor Presidente Fernando Sepolh"""

VALORES = {
    "{{if(16.`__ROW_NUMBER__`; 16.`1`; 100.data.vereador.political_name)}}": "Carlos Menezes",
    "{{if(16.`__ROW_NUMBER__`; 16.`3`; 100.data.vereador.city)}}": "Balneário Camboriú",
    "{{if(16.`__ROW_NUMBER__`; 16.`4`; 100.data.vereador.local_context)}}": "Município litorâneo de Santa Catarina, cerca de 150 mil habitantes.",
    "{{if(16.`__ROW_NUMBER__`; 16.`5`; 100.data.vereador.perfil_texto)}}": "Tom de voz: direto e cordial.\nComo se referir a ele(a): Vereador Carlos.",
    "{{100.data.vereador.autoridades_texto}}": AUTORIDADES,
    "{{100.data.vereador.party}}": "PSD",
    '{{formatDate(now; "DD/MM/YYYY")}}': "13/08/2026",
    "{{41.opcao}}": "8",
}


def resolver(t):
    for k, v in VALORES.items():
        t = t.replace(k, v)
        # Tolera variacao de crases/escapes na mesma expressao.
        t = t.replace(k.replace("`", ""), v)
    sobrou = re.findall(r"\{\{[^}]*\}\}", t)
    if sobrou:
        print("AVISO — variaveis nao resolvidas:", set(sobrou), file=sys.stderr)
    return t


system = resolver(corpo["system"])
user = resolver(corpo["messages"][0]["content"]).replace(
    "{{1.entry[1].changes[1].value.messages[1].text.body}}",
    "preciso de um ofício para o Rodrigo Cardoso, presidente do PL aqui da cidade, "
    "convidando ele para a audiência pública sobre mobilidade urbana no dia 28 deste mês, "
    "às 19h, no plenário da Câmara",
)

req = urllib.request.Request(
    "https://api.anthropic.com/v1/messages",
    data=json.dumps(
        {"model": corpo["model"], "system": system, "messages": [{"role": "user", "content": user}], "max_tokens": corpo["max_tokens"]}
    ).encode(),
    headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
)
with urllib.request.urlopen(req, timeout=180) as r:
    resp = json.load(r)

print(resp["content"][0]["text"])
