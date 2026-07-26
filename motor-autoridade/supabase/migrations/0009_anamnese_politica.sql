-- ============================================================================
-- Motor de Autoridade — 0009_anamnese_politica  (ASSESSOR 24H)
-- Anamnese política do vereador: identidade de mandato, posicionamento,
-- estilo verbal, limites (tabus/adversários), imprensa local e telefone —
-- a chave que o assistente do WhatsApp usa para achar o cliente.
--
-- Substitui as duas planilhas do fluxo antigo:
--   • "Planilha de Nomes"            → client_profiles (+ legacy_vereadores)
--   • "Respostas do Formulário"      → campos estruturados de client_profiles
-- ============================================================================

-- ── Espectro político ───────────────────────────────────────────────────────
do $$ begin
  create type political_spectrum as enum (
    'esquerda', 'centro_esquerda', 'centro', 'centro_direita', 'direita', 'nao_declarado'
  );
exception when duplicate_object then null; end $$;

-- ── Anamnese política: novos campos do perfil ───────────────────────────────
alter table client_profiles
  -- Trilha da anamnese usada: 'generic' (profissionais) | 'political' (mandato).
  add column if not exists profile_track       text not null default 'generic'
    check (profile_track in ('generic', 'political')),
  -- 1. Identificação
  add column if not exists phone               text,               -- WhatsApp em E.164 sem '+': 5547999999999
  add column if not exists political_name      text,               -- nome de urna
  add column if not exists party               text,
  add column if not exists mandate             text,               -- "2º mandato (2025–2028)"
  add column if not exists positions           text[] not null default '{}',  -- cargos/comissões
  -- 2. Posicionamento
  add column if not exists political_spectrum  political_spectrum,
  add column if not exists flags               text[] not null default '{}',  -- bandeiras do mandato
  add column if not exists electoral_base      text,               -- bairros/regiões/grupos onde tem votos
  add column if not exists voter_profile       text,               -- perfil do eleitorado
  -- 3. Tom e estilo
  add column if not exists slang_expressions   text[] not null default '{}',  -- gírias e expressões próprias
  add column if not exists emojis              text[] not null default '{}',
  add column if not exists how_to_refer        text,               -- "vereador Zé", "Zé do Bairro"
  add column if not exists catchphrase         text,               -- bordão
  -- 4. Limites
  add column if not exists adversaries         text[] not null default '{}',  -- nomes que NÃO devem ser citados
  add column if not exists mayor_relation      text,               -- relação com o prefeito (situação/oposição/independente)
  add column if not exists history_to_avoid    text,               -- episódios do histórico a não trazer à tona
  -- 5. Referências
  add column if not exists instagram_url       text,
  add column if not exists website_url         text,
  add column if not exists reference_publications text[] not null default '{}',  -- publicações que representam bem o mandato
  add column if not exists local_press         text[] not null default '{}',     -- imprensa local que cobre a cidade
  -- Contexto da cidade (vinha da coluna E da "Planilha de Nomes")
  add column if not exists local_context       text,
  -- 7. Preferências
  add column if not exists audience_segments   text[] not null default '{}',  -- segmentação (bairros, categorias, grupos)
  add column if not exists last_generation_at  timestamptz;

comment on column client_profiles.phone is
  'WhatsApp canônico (só dígitos, com DDI 55). Chave de busca do get_vereador.';

-- Um telefone pertence a um único perfil (a busca do assistente exige unicidade).
create unique index if not exists ux_client_profiles_phone
  on client_profiles(phone) where phone is not null;
create index if not exists ix_client_profiles_track on client_profiles(profile_track);

-- ── Staging da importação das planilhas ─────────────────────────────────────
-- Os vereadores das planilhas antigas ainda não têm conta no app. Esta tabela
-- guarda os dados importados para que o assistente do WhatsApp continue
-- respondendo por telefone enquanto cada um não conclui a anamnese web.
-- Quando o vereador faz a anamnese, o registro é vinculado (linked_user_id) e
-- o get_vereador passa a responder pelo perfil vivo do app.
create table if not exists legacy_vereadores (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null,                       -- canônico, só dígitos com DDI
  name             text,
  political_name   text,
  party            text,
  city             text,
  state            text,
  local_context    text,                                -- coluna E da planilha de nomes
  profile_text     text,                                -- coluna F: anamnese em texto livre
  form_answers     jsonb not null default '{}'::jsonb,  -- respostas do Google Form, cru
  editorial_dna    jsonb not null default '{}'::jsonb,  -- DNA consolidado (quando gerado)
  linked_user_id   uuid references users(id) on delete set null,
  source           text not null default 'planilha',    -- origem do registro
  notes            text,
  imported_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (phone)
);
create index if not exists ix_legacy_vereadores_linked on legacy_vereadores(linked_user_id);

drop trigger if exists trg_legacy_vereadores_updated on legacy_vereadores;
create trigger trg_legacy_vereadores_updated before update on legacy_vereadores
  for each row execute function set_updated_at();

-- RLS: dado operacional de bastidor — só admin/super enxergam pelo app.
-- O service_role (usado pela /api/make) ignora RLS.
alter table legacy_vereadores enable row level security;
alter table legacy_vereadores force row level security;

drop policy if exists p_legacy_vereadores_admin on legacy_vereadores;
create policy p_legacy_vereadores_admin on legacy_vereadores
  for all
  using (app_is_super() or app_is_admin())
  with check (app_is_super() or app_is_admin());

-- ── contexto_mestre v3: inclui o bloco de mandato ───────────────────────────
create or replace function build_contexto_mestre(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ctx jsonb;
begin
  select jsonb_build_object(
    'identidade', jsonb_build_object(
      'nome', u.full_name,
      'nome_profissional', p.display_name,
      'profissao', p.profession,
      'empresa', p.company,
      'area', p.field_of_work,
      'especialidades', p.specialties,
      'cidade', p.city,
      'estado', p.state,
      'tempo_experiencia', p.years_experience,
      'historia', p.bio_summary,
      'diferenciais', p.differentials,
      'segmento', p.segment,
      'trilha', p.profile_track
    ),
    'mandato', case when p.profile_track = 'political' then jsonb_build_object(
      'nome_politico', p.political_name,
      'partido', p.party,
      'mandato', p.mandate,
      'cargos', p.positions,
      'espectro', p.political_spectrum,
      'bandeiras', p.flags,
      'base_eleitoral', p.electoral_base,
      'perfil_eleitorado', p.voter_profile,
      'contexto_da_cidade', p.local_context,
      'relacao_com_prefeito', p.mayor_relation,
      'adversarios_nao_citar', p.adversaries,
      'historico_a_evitar', p.history_to_avoid,
      'imprensa_local', p.local_press,
      'publicacoes_referencia', p.reference_publications,
      'instagram', p.instagram_url,
      'site', p.website_url,
      'segmentacao', p.audience_segments,
      'telefone', p.phone
    ) else null end,
    'objetivos', jsonb_build_object(
      'lista', p.objectives,
      'outro', p.objective_other,
      'descricao', p.goals
    ),
    'publico', jsonb_build_object(
      'alvo', p.target_audience,
      'idade', p.audience_age,
      'cidade', p.audience_city,
      'classe_social', p.audience_class,
      'profissao', p.audience_profession,
      'dores', p.audience_pains,
      'duvidas', p.audience_doubts,
      'objecoes', p.audience_objections
    ),
    'posicionamento', jsonb_build_object(
      'reconhecimento_desejado', p.positioning_recognition,
      'assuntos_dominar', p.main_themes,
      'assuntos_proibidos', p.forbidden_themes,
      'valores_inegociaveis', p.core_values,
      'descricao_desejada', p.desired_description
    ),
    'editorial', jsonb_build_object(
      'tom_de_voz', p.tone_of_voice,
      'perfil_de_tom', p.tone_profile,
      'canais', p.channels,
      'girias_expressoes', p.slang_expressions,
      'emojis', p.emojis,
      'como_referir', p.how_to_refer,
      'bordao', p.catchphrase
    ),
    'producao', jsonb_build_object(
      'dias_por_semana', p.publish_days_per_week,
      'tempo_por_dia', p.time_per_day,
      'gosta_de_video', p.likes_video,
      'grava_sozinho', p.records_alone,
      'tem_equipe', p.has_team,
      'duracao_video_seg', pr.video_duration_sec,
      'formatos_preferidos', pr.preferred_formats,
      'meta_semanal', pr.weekly_goal,
      'dias', pr.preferred_days,
      'horarios', pr.preferred_times
    ),
    'comportamento', jsonb_build_object(
      'maior_bloqueio', p.main_block,
      'motivacao', p.main_motivation,
      'nivel_acompanhamento', p.follow_up_level
    ),
    'fontes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', s.kind, 'nome', s.label, 'url', s.url,
        'prioridade', s.priority, 'bloqueada', s.is_blocked
      ) order by s.is_blocked, s.priority)
      from influence_sources s where s.user_id = p_user_id
    ), '[]'::jsonb),
    'referencias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tipo', r.kind, 'nome', r.name, 'url', r.url, 'analise_estilo', r.style_analysis
      ))
      from inspiration_refs r where r.user_id = p_user_id
    ), '[]'::jsonb),
    'dna_editorial', p.editorial_dna
  )
  into ctx
  from users u
  left join client_profiles p on p.user_id = u.id
  left join client_preferences pr on pr.user_id = u.id
  where u.id = p_user_id;

  return coalesce(ctx, '{}'::jsonb);
end;
$$;

-- ── Matriz de fontes: imprensa e institucional para mandatos municipais ─────
insert into segment_sources (segment, name, url, kind, priority) values
  ('vereadores', 'Agência Câmara',              'https://www.camara.leg.br/noticias',        'institutional', 'medium'),
  ('vereadores', 'Portal do Município (IBGE)',  'https://cidades.ibge.gov.br',               'institutional', 'medium'),
  ('vereadores', 'CNM — Confederação Nacional de Municípios', 'https://cnm.org.br/comunicacao/noticias', 'institutional', 'high'),
  ('vereadores', 'Interesse Público / Poder360','https://www.poder360.com.br',               'news', 'medium'),
  ('vereadores', 'G1 — Editorias regionais',    'https://g1.globo.com',                      'news', 'high'),
  ('vereadores', 'Diário Oficial do Município', null,                                        'institutional', 'high'),
  ('vereadores', 'Rádio local (programa de notícias)', null,                                 'news', 'high')
on conflict (segment, name) do nothing;
