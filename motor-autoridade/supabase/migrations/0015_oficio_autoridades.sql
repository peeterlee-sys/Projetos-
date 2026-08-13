-- ============================================================================
-- Motor de Autoridade — 0015_oficio_autoridades  (ASSESSOR 24H)
--
-- Duas coisas, ambas a serviço do novo "Criar Ofício" (opção 8 do menu):
--
-- 1) O tipo 'oficio' no histórico de atividades. Sem ele, o save_document que
--    o Make chama depois de gerar o documento rejeitaria o payload e o ofício
--    sumiria do painel (o vereador recebe pelo WhatsApp de qualquer jeito, mas
--    nada fica registrado).
--
-- 2) As autoridades da cidade como dado estruturado, e não mais só como texto
--    solto dentro de city_contexts.context. O ofício é endereçado a uma pessoa
--    específica — secretário, diretor, presidente — e o nome precisa sair certo
--    e com o gênero certo. Adivinhar isso de dentro de um texto corrido é o que
--    hoje produz "Excelentíssimo Senhor Prefeita".
-- ============================================================================

-- ── 1. Tipos de documento ───────────────────────────────────────────────────
-- 'indicacao' entra junto por correção: o Make já manda esse tipo desde a
-- opção 4 do menu, mas o enum nunca teve o valor — toda indicação gerada até
-- hoje falhou ao gravar e não aparece no painel de ninguém.
alter type atividade_tipo add value if not exists 'indicacao';
alter type atividade_tipo add value if not exists 'oficio';

-- ── 2. Autoridades da cidade ────────────────────────────────────────────────
-- Formato de cada item:
--   { "cargo": "Prefeita", "nome": "Maria Souza", "genero": "f",
--     "orgao": "Prefeitura Municipal de Tijucas" }
-- O cargo é escrito já no gênero certo pelo admin; o "genero" resolve só o
-- pronome de tratamento (Excelentíssim[o/a] Senhor[a]), que é onde a IA errava.
alter table city_contexts
  add column if not exists autoridades jsonb not null default '[]'::jsonb;

comment on column city_contexts.autoridades is
  'Autoridades oficiais da cidade para endereçamento de ofícios e indicações. '
  'Lista de objetos {cargo, nome, genero, orgao}. Fonte única de nomes: o que '
  'não estiver aqui a IA não inventa.';
