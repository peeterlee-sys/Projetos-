# Clipping web — mapa de fontes RSS de SC (para acoplar ao Radar Público)

> Objetivo: monitorar portais de notícia de Santa Catarina que citem AEGEA (e depois
> outros clientes), reaproveitando o pipeline do rádio (filtro → Claude → roteamento
> por cidade/marca → dedup → alerta WhatsApp). Sem Whisper, custo muito menor.

> ⚠️ As URLs de feed abaixo **precisam ser confirmadas** com o comando da seção 3
> (rodar no droplet, que tem internet normal). Não foi possível verificar do ambiente
> de desenvolvimento. O método do Google News (seção 1) é o único garantido.

---

## 1. Espinha dorsal: Google News RSS (garantido, cobre quase tudo)

O Google News já agrega a maioria dos portais de SC. Você consulta por termo e recebe
um RSS limpo, sem precisar de feed de cada site. **Comece por aqui** — cobre 80% do valor
com quase zero manutenção.

Formato da URL (troque só o `q=`):

```
https://news.google.com/rss/search?q=<CONSULTA>&hl=pt-BR&gl=BR&ceid=BR:pt-419
```

Exemplos de consulta (`q=`), já com codificação de espaço = `+` e aspas = `%22`:

| Objetivo | q= |
|---|---|
| AEGEA em SC | `%22AEGEA%22+Santa+Catarina` |
| Marca local da AEGEA | `%22Águas+de+Itapema%22` (trocar pelo nome real da concessionária) |
| Concorrente (Casan) | `%22Casan%22+saneamento` |
| Tema por cidade | `saneamento+OR+%22falta+de+água%22+Itapema` |
| Restrito a um portal | `AEGEA+site:ndmais.com.br` |

Dicas de operador no `q=`: `%22frase exata%22`, `OR`, `-palavra` (excluir), `site:dominio`.
Uma boa estratégia: **um feed do Google News por marca monitorada** (AEGEA + cada concorrente)
e **um por cidade+tema**. Dedup por URL evita repetição entre eles.

Limitações honestas: o Google News entrega **título + link + fonte + data** (não o corpo
inteiro); costuma trazer itens de horas atrás (não segundos); e é amostra do que o Google
indexa. Para o alerta ("AEGEA citada em matéria do ND+ sobre falta de água em Itapema")
isso já basta.

---

## 2. Feeds diretos dos portais (confirmar com a seção 3)

A maioria dos portais brasileiros roda WordPress, cujo RSS padrão é a URL + `/feed/`.
Também funciona por categoria: `dominio/categoria/economia/feed/`.

### Abrangência estadual (SC)
| Portal | Domínio | Feed provável |
|---|---|---|
| NSC Total (Grupo NSC, ex-RBS) | nsctotal.com.br | `https://www.nsctotal.com.br/feed` |
| ND+ / Notícias do Dia | ndmais.com.br | `https://ndmais.com.br/feed/` |
| CBN Diário | *(confirmar domínio)* | `.../feed/` |
| Portal Catarinas | catarinas.info | `https://catarinas.info/feed/` |

### Litoral Norte / Vale — região de operação da AEGEA
| Portal | Domínio (confirmar) | Feed provável |
|---|---|---|
| O Sol Diário (Itajaí/BC, Grupo NSC) | osoldiario.com.br | `.../feed/` |
| O Município (Brusque) | omunicipio.com.br | `https://omunicipio.com.br/feed/` |
| Portais de Itapema / BC / Camboriú / Itajaí / Navegantes | *(levantar por cidade)* | `.../feed/` |
| Sites das próprias rádios já monitoradas | *(cada rádio)* | muitas têm blog WordPress com `/feed/` |

> Nota: portais com paywall (ND+/NSC podem ter) entregam título + resumo no feed, não o
> texto completo. Suficiente para alerta; insuficiente para análise profunda do corpo.

### Fontes oficiais (ótimas para "direito de resposta" e contexto)
| Fonte | Uso |
|---|---|
| Diário Oficial dos municípios | licitações, contratos de saneamento |
| Sites das prefeituras / câmaras | notas oficiais que contradizem ou confirmam a matéria |

---

## 3. Comando para confirmar cada feed (rodar no droplet)

```bash
# testa uma URL de feed e mostra se é RSS válido + itens recentes
check_feed() {
  code=$(curl -s -A "Mozilla/5.0" -o /tmp/feed.xml -w "%{http_code}" --max-time 20 "$1")
  echo "[$code] $1"
  if grep -qiE "<rss|<feed|<item|<entry" /tmp/feed.xml 2>/dev/null; then
    echo "   ✓ RSS válido — itens:"
    grep -oiE "<title>[^<]*</title>" /tmp/feed.xml | head -4 | sed 's/<[^>]*>//g;s/^/     - /'
  else
    echo "   ✗ não é RSS (erro, HTML ou paywall)"
  fi
}

# exemplos:
check_feed "https://news.google.com/rss/search?q=%22AEGEA%22+Santa+Catarina&hl=pt-BR&gl=BR&ceid=BR:pt-419"
check_feed "https://ndmais.com.br/feed/"
check_feed "https://www.nsctotal.com.br/feed"
check_feed "https://omunicipio.com.br/feed/"
```

Rode para cada candidato. Os que derem `✓ RSS válido` entram no monitoramento; os que
derem `✗` ficam via Google News (seção 1).

---

## 4. Como acopla ao Radar Público (reaproveitamento)

| Etapa | Rádio (hoje) | Portal (novo) | Reuso |
|---|---|---|---|
| Captação | `stream_capture` (ffmpeg) | **novo** `news_poller` (feedparser/httpx, a cada N min) | — |
| Fonte | `RadioStation` | **novo** `NewsSource` (portal + feed_url) | modelo espelhado |
| Transcrição | Whisper | **não precisa** (texto pronto) | economia |
| Filtro keyword | `keyword_filter` | igual | 100% |
| Análise | `claude_analyzer` | igual, com prompt de artigo | ~95% (só o prompt) |
| Roteamento cidade/marca | `city_router` | igual | 100% |
| Dedup | `deduplicator` | igual + dedup por URL | ~90% |
| Alerta WhatsApp | `whatsapp` / `formatter` | igual (sem áudio, com link da matéria) | ~95% |
| Relatório/comparativo | reports + dashboard | igual, canal "web" | 100% |

Peça nova principal: um poller que lê os feeds, deduplica por URL, e injeta cada matéria
nova no mesmo fluxo de análise. Esforço estimado: poucos dias, porque o miolo já existe.

---

## 5. Posicionamento (não esquecer)

Vender como **plus do rádio**, não como clipping avulso (aí seria concorrer com Google
Alerts grátis e com a Clipei no jogo dela). O diferencial é o **conjunto**: rádio em tempo
real (único) + web + cruzamento com concorrentes + entrega no WhatsApp, num painel só.
Estratégia com a AEGEA: entrar pelo rádio, adicionar o web como cortesia/plus, e ir
absorvendo o escopo que hoje é da Clipei por dentro.
