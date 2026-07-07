# Prompt-mestre — Landing Page do Porta Voz

> Cole todo o bloco abaixo no Claude Designer (Fable 5). Ele já está completo:
> copy, paleta, fontes, animações e instruções técnicas.

---

Você vai construir uma landing page completa, moderna e responsiva para o
**PORTA VOZ** — um sistema que usa inteligência artificial para multiplicar a
produção de conteúdo das secretarias de comunicação das prefeituras. Entregue
como **HTML único com CSS embutido**, pronto para abrir no navegador, sem
dependências externas além das fontes do Google Fonts (ícones em SVG inline).

## Contexto do produto (para você entender o que está vendendo)

A maioria das secretarias de comunicação municipais tem 2 ou 3 pessoas para dar
conta de 10, 15 secretarias (Saúde, Obras, Educação, Assistência Social...).
Falta jornalista, e boa parte das ações do governo nunca é divulgada.

O Porta Voz resolve isso: cada secretário tem acesso a um número central de
WhatsApp. Ele grava um áudio contando o que está acontecendo ("estou na
conferência municipal de educação, mais de 1.500 professores presentes...") e
envia. O sistema identifica de qual secretaria veio, transcreve o áudio e uma
IA — atuando como um assessor de imprensa sênior — escreve, no padrão editorial
da própria prefeitura: uma headline, um release jornalístico completo e um post
pronto para o Instagram. Tudo cai na Secretaria de Comunicação, que apenas
revisa e publica. Mais conteúdo, com a mesma equipe.

---

## Copy da página

### Hero
- **Selo/tag:** Comunicação pública com Inteligência Artificial
- **Headline:** Um áudio no WhatsApp vira um release pronto para publicar.
- **Subheadline:** O Porta Voz transforma a fala de cada secretário em texto
  jornalístico no padrão da sua prefeitura — e entrega tudo pronto na mão da
  Secretaria de Comunicação. Mais publicações, com a equipe que você já tem.
- **CTA principal:** Agendar demonstração
- **CTA secundário:** Ver como funciona

### Barra de prova / confiança
"Da fala do secretário à publicação, em minutos · Release + Instagram gerados
de uma só vez · No padrão editorial da sua gestão"

### O problema
- **Título:** Duas pessoas. Quinze secretarias. Impossível dar conta.
- **Texto:** Saúde, Obras, Educação, Assistência Social, Saneamento — cada
  secretaria gera notícia todos os dias. Mas a comunicação da prefeitura tem
  duas ou três pessoas para cobrir tudo. Falta jornalista, e ação boa do
  governo acaba não sendo divulgada. O que não é publicado, para o cidadão, é
  como se não tivesse acontecido.

### Como funciona (4 passos)
1. **O secretário grava um áudio** — Direto no WhatsApp, ele conta o que está
   acontecendo: a reunião, a obra entregue, o programa lançado. Sem precisar de
   um jornalista ao lado.
2. **O Porta Voz identifica a origem** — Pelo número cadastrado, o sistema sabe
   exatamente de qual secretaria e de qual secretário veio a mensagem.
3. **A IA escreve como um jornalista sênior** — O áudio é transcrito e
   transformado em texto no padrão editorial da sua prefeitura: título ativo,
   lead, citação do secretário e tom institucional.
4. **Tudo cai na Comunicação, pronto** — Headline, release completo e post de
   Instagram chegam para a equipe apenas revisar, aprovar e publicar.

### Benefícios
- **Multiplique a produção sem contratar** — cada secretaria vira fonte de conteúdo.
- **No seu padrão editorial** — títulos, lead e tom institucional da sua prefeitura.
- **Release + Instagram de uma vez** — texto para o site e post para as redes juntos.
- **Da fala à publicação em minutos** — sem gargalo, sem áudio parado na fila.
- **A Comunicação mantém o controle** — nada é publicado sem a revisão da equipe.
- **Simples para o secretário** — se ele sabe mandar um áudio no WhatsApp, sabe usar.

### Para quem
- **Título:** Feito para prefeituras que querem comunicar mais do que conseguem hoje.
- **Texto:** Secretarias de comunicação e assessorias de imprensa municipais que
  precisam divulgar as ações de todas as pastas — sem ter uma redação inteira
  para isso.

### CTA final
- **Título:** Sua prefeitura tem muito o que mostrar. Falta quem escreva.
- **Subtítulo:** Veja em uma demonstração como o Porta Voz transforma áudios de
  WhatsApp em conteúdo pronto para publicar.
- **Botão:** Agendar demonstração

### Rodapé
Porta Voz — Inteligência artificial a serviço da comunicação pública municipal.
Links: Como funciona · Benefícios · Contato
© 2026 Porta Voz. Todos os direitos reservados.

---

## Estilo visual

Paleta (defina como CSS variables):

```css
--bg: #ffffff;
--text: #14202e;
--muted: #5b6b7c;
--deep: #0a2540;        /* azul institucional profundo */
--accent: #1e6fd9;      /* azul vibrante — destaques / links */
--green: #22c964;       /* CTA — remete a WhatsApp / confiança */
--border-soft: rgba(0, 0, 0, 0.08);
```

- **Fontes** (Google Fonts, com preconnect a `fonts.googleapis.com` e
  `fonts.gstatic.com`): **Inter** (400, 500, 600, 700) para o corpo; **Sora**
  (400, 600, 700) para títulos.
- **Tom:** moderno + confiável — institucional, clean e tecnológico. Nada
  burocrático. Letter-spacing levemente negativo nos títulos (-0.03em a
  -0.05em). Cantos arredondados, bastante respiro, ícones de linha.

---

## Animação — aplicar no HERO

Reproduza estas mecânicas, adaptando as cores à paleta acima:

**1) Linhas curvas pulsando** (decorativas, ladeando o hero)
- 20 linhas do lado esquerdo e 20 do lado direito, posicionadas de forma absoluta.
- Cada linha é um retângulo alto com `border-radius` de um lado só (80%) e borda
  `2.5px solid` na cor `--accent` com opacidade baixa (`rgba(30,111,217,.5)`).
- Linhas da esquerda: sem borda esquerda, raio à direita. Da direita: sem borda
  direita, raio à esquerda.
- `animationDelay` escalonado: `i * 0.25s`. Larguras a partir de 60px, +10px por linha.
- Animação: `line-pulse` 5s ease-in-out infinite.
- Mobile (<810px): esconder as linhas laterais; mostrar linhas horizontais no
  topo (mesma animação, orientação horizontal, raio na base).

**2) Ticker em marquee** (max-width 500px, altura 36px, acima do título)
- Marquee horizontal rolando para a esquerda em 30s, linear, infinito.
- Itens (pílulas): "Release pronto", "Headline", "Post de Instagram", "Saúde",
  "Obras", "Educação", "Assistência Social".
- Cada item: 13px, weight 500, cor `--muted`, padding `6px 14px`, rounded-full,
  fundo `rgb(248,250,252)`.
- Máscara de fade nas bordas:
  `linear-gradient(90deg, transparent 0%, black 12%, black 88%, transparent 100%)`.
- Duplicar as linhas 4x para loop sem emenda.

**3) Entrada do hero:** elementos surgindo com fade-in + leve deslize de baixo
para cima ao carregar.

Keyframes (use exatamente estes):

```css
@keyframes marquee-left {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes line-pulse {
  0%   { opacity: 0;   transform: scale(1); }
  15%  { opacity: 0.9; }
  70%  { opacity: 0.4; }
  100% { opacity: 0;   transform: scale(0.85); }
}
```

---

## Instruções finais

- Entregue como **HTML único com CSS embutido**, pronto para abrir no navegador.
- Aplique as animações acima na seção **Hero**.
- Totalmente **responsivo para celular** (breakpoints em 1200px e 810px).
- Use as cores e fontes indicadas em **todos** os elementos, de forma consistente.
- O **botão de CTA** ("Agendar demonstração") deve ter destaque visual claro:
  fundo `--green`, texto branco, tamanho generoso, rounded-full, e leve elevação
  no hover (`translateY(-1px)` + `box-shadow: 0 4px 20px rgba(0,0,0,0.12)`).
- Estrutura da página, nesta ordem: **Hero → Problema → Como funciona →
  Benefícios → Para quem → CTA final → Rodapé**.
- Ilustre "Como funciona" com 4 cards ou passos numerados.
- Onde fizer sentido, use o visual de uma **bolha de áudio de WhatsApp** se
  "transformando" em um texto de release, reforçando o fluxo do produto.

Entregue o arquivo completo, pronto para abrir no navegador.
