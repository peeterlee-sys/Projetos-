-- ============================================================================
-- Motor de Autoridade — 0006_editorial_dna
-- Atualização estratégica: anamnese editorial completa, fontes de influência
-- por cliente, referências de inspiração, matriz de fontes por segmento e
-- DNA Editorial (documento consolidado usado em TODAS as gerações de IA).
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type source_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Tipos de fonte de influência informados na anamnese (etapa 7).
  create type influence_kind as enum (
    'site', 'blog', 'newsletter', 'podcast', 'youtube',
    'instagram', 'linkedin', 'journalist', 'expert', 'author', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Tipos de referência de inspiração (etapa 8).
  create type reference_kind as enum ('instagram', 'linkedin', 'youtube', 'site', 'blog');
exception when duplicate_object then null; end $$;

-- ── Anamnese: novos campos do perfil editorial ──────────────────────────────
alter table client_profiles
  add column if not exists state               text,              -- UF
  add column if not exists years_experience    text,              -- tempo de experiência
  add column if not exists bio_summary         text,              -- história resumida
  add column if not exists differentials       text,              -- diferenciais
  add column if not exists segment             text,              -- segmento p/ matriz de fontes (advogados, medicos…)
  -- Objetivo (múltipla escolha + campo livre)
  add column if not exists objectives          text[] not null default '{}',
  add column if not exists objective_other     text,
  -- Público detalhado
  add column if not exists audience_age        text,
  add column if not exists audience_city       text,
  add column if not exists audience_class      text,
  add column if not exists audience_profession text,
  add column if not exists audience_doubts     text,              -- principais dúvidas
  add column if not exists audience_objections text,              -- principais objeções
  -- Posicionamento
  add column if not exists positioning_recognition text,          -- como deseja ser reconhecido
  add column if not exists core_values         text,              -- valores inegociáveis
  add column if not exists desired_description text,              -- como gostaria de ser descrito
  -- Tom de comunicação (múltipla escolha)
  add column if not exists tone_profile        text[] not null default '{}',
  -- Produção
  add column if not exists publish_days_per_week integer check (publish_days_per_week between 1 and 7),
  add column if not exists time_per_day        text,              -- tempo disponível por dia
  add column if not exists likes_video         boolean,
  add column if not exists records_alone       boolean,
  add column if not exists has_team            boolean,
  -- DNA Editorial: documento estruturado gerado ao fim da anamnese e usado
  -- pela IA em toda geração (pauta, roteiro, carrossel, post, story, LinkedIn).
  add column if not exists editorial_dna       jsonb not null default '{}'::jsonb,
  add column if not exists dna_generated_at    timestamptz;

-- ── Fontes de influência do cliente (etapa 7 da anamnese) ───────────────────
-- Fontes que o cliente acompanha, com prioridade. is_blocked marca fontes que
-- o cliente NÃO quer que sejam usadas. Prioridade do cliente > matriz do
-- segmento > fontes globais.
create table if not exists influence_sources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  kind          influence_kind not null,
  label         text,                            -- nome (jornalista, autor, canal…)
  url           text,                            -- link, quando houver
  priority      source_priority not null default 'medium',
  is_blocked    boolean not null default false,  -- fonte proibida para este cliente
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ix_influence_user on influence_sources(user_id) where not is_blocked;
create index if not exists ix_influence_tenant on influence_sources(tenant_id);

-- ── Referências de inspiração (etapa 8 da anamnese) ─────────────────────────
-- Perfis/canais cuja comunicação inspira o cliente. A IA analisa estilo,
-- estrutura, profundidade, tom, linguagem e frequência — SEM copiar nada.
create table if not exists inspiration_refs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  kind            reference_kind not null,
  url             text not null,
  name            text,
  style_analysis  jsonb not null default '{}'::jsonb,  -- análise de estilo (gerada pela IA)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_inspiration_user on inspiration_refs(user_id);
create index if not exists ix_inspiration_tenant on inspiration_refs(tenant_id);

-- ── Matriz de fontes por segmento ───────────────────────────────────────────
-- Substitui a "lista única de sites": cada segmento tem suas próprias fontes.
-- As fontes escolhidas pelo cliente (influence_sources) têm prioridade maior.
create table if not exists segment_sources (
  id            uuid primary key default gen_random_uuid(),
  segment       text not null,                   -- advogados | medicos | politicos | …
  name          text not null,
  url           text,
  kind          text not null default 'news',    -- news | rss | institutional
  priority      source_priority not null default 'medium',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (segment, name)
);
create index if not exists ix_segment_sources on segment_sources(segment) where is_active;

-- updated_at automático nas novas tabelas
do $$
declare t text;
begin
  foreach t in array array['influence_sources','inspiration_refs']
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on %1$s;
       create trigger trg_%1$s_updated before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['influence_sources','inspiration_refs','segment_sources']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
  end loop;
end $$;

-- Tabelas pessoais: dono + admin do tenant + super (mesmo padrão de 0003).
do $$
declare t text;
begin
  foreach t in array array['influence_sources','inspiration_refs']
  loop
    execute format('drop policy if exists p_%1$s_rw on %1$s;', t);
    execute format($f$
      create policy p_%1$s_rw on %1$s
      for all
      using (
        app_is_super()
        or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
      )
      with check (
        app_is_super()
        or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
      );
    $f$, t);
  end loop;
end $$;

-- Matriz de segmento: leitura por qualquer usuário autenticado; escrita super.
drop policy if exists p_segment_sources_read on segment_sources;
create policy p_segment_sources_read on segment_sources
  for select using (auth.uid() is not null);

drop policy if exists p_segment_sources_write on segment_sources;
create policy p_segment_sources_write on segment_sources
  for all using (app_is_super()) with check (app_is_super());

-- ── contexto_mestre v2: inclui anamnese completa + DNA Editorial ────────────
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
      'segmento', p.segment
    ),
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
      'canais', p.channels
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

-- ── Seed: matriz de fontes por segmento ─────────────────────────────────────
insert into segment_sources (segment, name, url, kind, priority) values
  -- Advogados
  ('advogados',  'Conjur',                    'https://www.conjur.com.br',            'news', 'high'),
  ('advogados',  'Migalhas',                  'https://www.migalhas.com.br',          'news', 'high'),
  ('advogados',  'JOTA',                      'https://www.jota.info',                'news', 'medium'),
  ('advogados',  'Notícias do STF',           'https://portal.stf.jus.br/noticias',   'institutional', 'high'),
  ('advogados',  'Notícias do STJ',           'https://www.stj.jus.br/sites/portalp/Inicio', 'institutional', 'medium'),
  -- Médicos
  ('medicos',    'PEBMED',                    'https://pebmed.com.br',                'news', 'high'),
  ('medicos',    'Medscape Brasil',           'https://portugues.medscape.com',       'news', 'high'),
  ('medicos',    'Ministério da Saúde',       'https://www.gov.br/saude/pt-br',       'institutional', 'medium'),
  ('medicos',    'CFM Notícias',              'https://portal.cfm.org.br/noticias',   'institutional', 'medium'),
  -- Políticos
  ('politicos',  'Agência Câmara',            'https://www.camara.leg.br/noticias',   'institutional', 'high'),
  ('politicos',  'Agência Senado',            'https://www12.senado.leg.br/noticias', 'institutional', 'high'),
  ('politicos',  'Poder360',                  'https://www.poder360.com.br',          'news', 'medium'),
  ('politicos',  'G1 Política',               'https://g1.globo.com/politica',        'news', 'medium'),
  -- Pastores
  ('pastores',   'Gospel Prime',              'https://www.gospelprime.com.br',       'news', 'high'),
  ('pastores',   'Guiame',                    'https://guiame.com.br',                'news', 'medium'),
  -- Empresários
  ('empresarios','Exame',                     'https://exame.com',                    'news', 'high'),
  ('empresarios','InfoMoney',                 'https://www.infomoney.com.br',         'news', 'high'),
  ('empresarios','Valor Econômico',           'https://valor.globo.com',              'news', 'medium'),
  ('empresarios','Sebrae Notícias',           'https://sebrae.com.br',                'institutional', 'medium'),
  -- Corretores de imóveis
  ('corretores', 'Imobi Report',              'https://imobireport.com.br',           'news', 'high'),
  ('corretores', 'Secovi-SP',                 'https://www.secovi.com.br',            'institutional', 'medium'),
  ('corretores', 'InfoMoney Imóveis',         'https://www.infomoney.com.br/onde-investir/imoveis', 'news', 'medium'),
  -- Arquitetos
  ('arquitetos', 'ArchDaily Brasil',          'https://www.archdaily.com.br',         'news', 'high'),
  ('arquitetos', 'CasaCor',                   'https://casacor.abril.com.br',         'news', 'medium'),
  ('arquitetos', 'CAU/BR Notícias',           'https://caubr.gov.br/noticias',        'institutional', 'medium')
on conflict (segment, name) do nothing;
