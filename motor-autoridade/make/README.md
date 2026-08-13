# Cenário do WhatsApp — Assessor 24h

Cenário **"Assessor 24h — Oficial"** (ID `5669439`) no Make.

O blueprint **não fica versionado aqui**: ele carrega o `x-motor-secret` e as
chaves de API embutidas nos módulos HTTP, em dez pontos diferentes. Commitar o
arquivo publicaria esses segredos no histórico do git, de onde não saem mais.

O que fica versionado é o **script que produz cada versão nova a partir da
anterior** — o que dá o mesmo resultado sem guardar segredo nenhum, e ainda
deixa registrado exatamente o que mudou entre uma versão e outra.

## Como gerar uma versão nova

```bash
# 1. Busque o blueprint ao vivo do cenário e salve como bp-raw.txt
#    (Make MCP: scenarios_get, ou Exportar Blueprint pela interface)
# 2. Rode o script da versão desejada
python3 build_v33.py
```

O script falha alto se qualquer âncora que ele espera não estiver mais no
blueprint — é proposital. Se o cenário mudou desde a última vez, é melhor o
script parar do que produzir um arquivo meio editado.

## v33 — Criar Ofício (opção 8)

Nove edições, nenhum módulo novo (os IDs seguem idênticos ao v32):

| Módulo | Mudança |
| --- | --- |
| 23 | `8️⃣ Criar um Ofício` no menu |
| 25 | resposta da opção 8, pedindo destinatário e assunto |
| 40 | `"23467"` → `"234678"`, para a opção 8 ser lembrada no turno seguinte |
| rota 5 | passa a aceitar `^8\W*$` |
| rota 6 | `^[1-7]$` → `^[1-8]$`, para o "8" não cair no texto livre |
| 200, 202 | `save_document` grava `tipo: "oficio"` |
| 12, 17 | caso G (ofício) + lista oficial de autoridades no prompt |

O ofício segue o modelo da Câmara: cabeçalho, epígrafe `OFÍCIO VEREADOR
Nº ___/ANO`, endereçamento em três linhas, vocativo, corpo com transcrição de
dispositivos quando citados, fecho de cortesia, `Respeitosamente,`, local e
data, e assinatura `Ver. Nome (Partido)`.

### A regra que dá sentido ao resto

Os nomes de autoridade vêm de `city_contexts.autoridades`, mantido pelo admin
em `/admin/cidades` e entregue pronto ao prompt em `autoridades_texto`, com o
vocativo já flexionado no gênero certo.

Nome que não está nessa lista o assistente **não escreve por conta própria**:
sai exatamente como o vereador digitou, sem cargo nem tratamento completados, e
a mensagem termina com o aviso para conferir antes de protocolar.

## v34 — conserto da regra do destinatário

O v33 produziu, num ofício real de Balneário Camboriú para um nome fora do
cadastro, este documento:

```
À Excelentíssima Senhora
RODRIGO CARDOSO
Presidente do PL de Balneário Camboriú

Excelentíssima Senhora Presidente,

_Confira o nome e o cargo do destinatário antes de protocolar — ..._
```

Dois defeitos, ambos da redação da regra, não do modelo:

1. **O documento parava no aviso.** "Encerre a mensagem com esta linha" foi
   lido como instrução de parada: sumiram abertura, corpo, fecho, data e
   assinatura.
2. **O gênero era chutado.** A regra mandava não inventar tratamento e a
   estrutura, logo abaixo, obrigava a escolher entre "Ao Excelentíssimo Senhor"
   e "À Excelentíssima Senhora". Sem saída, o modelo escolhia.

O v34 reescreve a regra em dois casos explícitos. Fora da lista, o tratamento
vai na forma dupla — `Ao(À) Excelentíssimo(a) Senhor(a)` — o documento sai
inteiro do mesmo jeito, e o aviso é acréscimo depois da assinatura.

As três formas de endereçamento viraram tabela depois que a redação corrida
produziu `À Excelentíssimo Senhor` — preposição feminina com tratamento
masculino — no teste de regressão.

### Testar antes de importar

```bash
python3 testar_prompt.py assessor24h-v34.json
```

Resolve as variáveis do Make, chama a API com o prompt real e imprime o
documento. Rode sempre os dois casos: destinatário na lista e fora dela. Os
dois defeitos acima teriam aparecido na primeira execução.

## Ordem de implantação (importa)

1. **Migration `0015` no Supabase, primeiro.** Ela cria o tipo `oficio` e a
   coluna `autoridades`.
2. **Deploy do app** com o `get_vereador` que devolve `autoridades_texto`.
3. **Import do blueprint no Make**, por último.

Invertida, a ordem produz uma falha silenciosa: o Make manda `tipo: "oficio"`,
a API rejeita, e o vereador recebe o ofício pelo WhatsApp normalmente — porque
a mensagem é montada do texto da IA, não da resposta da API — enquanto nada
fica registrado no painel. Foi exatamente assim que todas as indicações se
perderam até agora.

## Depois de importar, sempre

Toda importação reseta o agendamento para **indefinitely**. Volte para
**immediately**, ou o cenário para de responder.
