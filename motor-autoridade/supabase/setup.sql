-- ============================================================================
-- Motor de Autoridade — setup completo (as 4 migrações, na ordem correta).
-- Cole tudo no SQL Editor do Supabase e rode de uma vez.
-- ============================================================================


-- ==================== migrations/0001_schema.sql ====================

-- ============================================================================
-- Motor de Autoridade — 0001_schema
-- Esquema completo (MÓDULO 15 + 16). Multi-tenant por tenant_id.
-- Postgres / Supabase. RLS é habilitado em 0003_rls.sql.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;      -- e-mails case-insensitive

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('super_admin', 'admin', 'client', 'collaborator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tenant_status as enum ('trial', 'active', 'suspended', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type client_health as enum ('healthy', 'attention', 'risk');
exception when duplicate_object then null; end $$;

do $$ begin
  create type format_type as enum ('video', 'carousel', 'post', 'story', 'linkedin');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Ciclo de vida do conteúdo. Métrica principal = 'published'.
  create type content_status as enum (
    'suggested', 'saved', 'opened', 'read', 'in_production',
    'recorded', 'published', 'postponed', 'rejected', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type opportunity_status as enum (
    'pending', 'delivered', 'opened', 'chosen', 'dismissed', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  -- Eventos comportamentais (MÓDULO 7), em linguagem de domínio.
  create type behavior_event_type as enum (
    'conteudo_entregue', 'conteudo_aberto', 'conteudo_lido', 'formato_escolhido',
    'teleprompter_aberto', 'gravacao_iniciada', 'gravacao_concluida', 'conteudo_baixado',
    'conteudo_publicado', 'conteudo_adiado', 'conteudo_rejeitado', 'bloqueio_informado',
    'lembrete_solicitado', 'notificacao_aberta'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'content_ready', 'urgent_topic', 'reminder', 'progress',
    'achievement', 'weekly_report', 'processing_failure'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_intensity as enum ('light', 'balanced', 'intense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type delivery_channel as enum ('web_push', 'email', 'whatsapp', 'in_app');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sentiment as enum ('positive', 'negative', 'neutral');
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_scenario as enum ('classification', 'generation', 'adjustment', 'report', 'decision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type template_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

-- ── Núcleo multicliente ─────────────────────────────────────────────────────
create table tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext unique not null,
  status        tenant_status not null default 'trial',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Espelha auth.users (id = auth.users.id) com papel e tenant.
create table users (
  id            uuid primary key,             -- = auth.users.id
  tenant_id     uuid references tenants(id) on delete cascade,
  email         citext unique not null,
  full_name     text,
  role          user_role not null default 'client',
  onboarded_at  timestamptz,                  -- null = onboarding obrigatório pendente
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index ix_users_tenant on users(tenant_id) where deleted_at is null;
create index ix_users_role on users(tenant_id, role);

-- Perfil editorial do cliente (resultado do onboarding, MÓDULO 2).
create table client_profiles (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  display_name        text,                   -- nome profissional
  profession          text,
  company             text,
  field_of_work       text,                   -- área de atuação
  specialties         text[] not null default '{}',
  city                text,
  target_audience     text,
  audience_pains      text,
  goals               text,
  main_themes         text[] not null default '{}',
  forbidden_themes    text[] not null default '{}',
  tone_of_voice       text,
  channels            text[] not null default '{}',
  main_block          text,                   -- maior bloqueio
  main_motivation     text,
  follow_up_level     notification_intensity not null default 'balanced',
  -- Identidade visual do cliente (usada nos carrosséis/posts).
  brand_primary       text,
  brand_secondary     text,
  brand_accent        text,
  logo_url            text,
  -- contexto_mestre consolidado, consumido pela camada de IA em toda geração.
  contexto_mestre     jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (user_id)
);
create index ix_client_profiles_tenant on client_profiles(tenant_id);

-- Preferências operacionais (duração de vídeo, formatos, agenda, meta).
create table client_preferences (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  video_duration_sec  integer not null default 60 check (video_duration_sec between 10 and 600),
  preferred_formats   format_type[] not null default '{video}',
  weekly_goal         integer not null default 3 check (weekly_goal between 1 and 21),
  preferred_days      integer[] not null default '{1,3,5}',  -- 0=domingo .. 6=sábado
  preferred_times     text[] not null default '{}',          -- "08:00"
  notification_level  notification_intensity not null default 'balanced',
  quiet_hours_start   text,                                  -- "22:00"
  quiet_hours_end     text,                                  -- "07:00"
  daily_notif_limit   integer not null default 3 check (daily_notif_limit between 0 and 20),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id)
);
create index ix_client_preferences_tenant on client_preferences(tenant_id);

-- ── Radar de tendências / curadoria ─────────────────────────────────────────
create table sources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade, -- null = fonte global
  name          text not null,
  kind          text not null default 'rss',   -- rss | news | social | manual | radio
  url           text,
  config        jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index ix_sources_tenant on sources(tenant_id) where is_active;

create table monitored_contents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade,
  source_id     uuid references sources(id) on delete set null,
  external_id   text,
  title         text,
  url           text,
  raw_text      text,
  published_at  timestamptz,
  dedup_hash    text,
  created_at    timestamptz not null default now()
);
create index ix_monitored_tenant_pub on monitored_contents(tenant_id, published_at desc);
create unique index ux_monitored_dedup on monitored_contents(tenant_id, dedup_hash) where dedup_hash is not null;

create table content_analyses (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  monitored_id      uuid references monitored_contents(id) on delete cascade,
  is_relevant       boolean not null,
  theme             text,
  angle             text,                      -- ângulo editorial
  sentiment         sentiment,
  urgency           urgency,
  relevance_score   real check (relevance_score between 0 and 1),
  summary           text,
  reason            text,                      -- motivo da recomendação
  client_connection text,                      -- conexão com a área do cliente
  raw_response      jsonb,
  created_at        timestamptz not null default now()
);
create index ix_analyses_tenant on content_analyses(tenant_id, created_at desc);

-- Oportunidade do dia entregue ao cliente (base da tela "Hoje").
create table daily_opportunities (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  analysis_id         uuid references content_analyses(id) on delete set null,
  opportunity_date    date not null default (now() at time zone 'utc')::date,
  title               text not null,
  theme               text,
  reason              text,
  client_connection   text,
  editorial_angle     text,
  relevance_score     real check (relevance_score between 0 and 1),
  estimated_duration  integer,                 -- segundos
  estimated_effort    text,                    -- baixo | médio | alto
  recommended_format  format_type not null default 'video',
  sources             jsonb not null default '[]'::jsonb,
  status              opportunity_status not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index ix_opps_user_date on daily_opportunities(user_id, opportunity_date desc);
create index ix_opps_tenant_status on daily_opportunities(tenant_id, status);

-- ── Conteúdo e formatos ─────────────────────────────────────────────────────
create table content_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  opportunity_id  uuid references daily_opportunities(id) on delete set null,
  title           text not null,
  theme           text,
  status          content_status not null default 'suggested',
  recorded_at     timestamptz,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index ix_items_user_status on content_items(user_id, status);
create index ix_items_tenant_pub on content_items(tenant_id, published_at desc);

-- Uma linha por formato gerado a partir do mesmo tema.
create table content_formats (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_item_id uuid not null references content_items(id) on delete cascade,
  format          format_type not null,
  caption         text,                        -- legenda
  cta             text,
  payload         jsonb not null default '{}'::jsonb, -- estrutura específica do formato
  status          content_status not null default 'suggested',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (content_item_id, format)
);
create index ix_formats_tenant on content_formats(tenant_id);

create table scripts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_format_id uuid not null references content_formats(id) on delete cascade,
  title             text,
  cover_text        text,                      -- texto de capa
  hook              text,                      -- gancho
  body              text not null,             -- roteiro
  cta               text,
  recording_tips    text,                      -- orientação de gravação
  duration_sec      integer,
  is_recorded       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ix_scripts_tenant on scripts(tenant_id);

create table carousel_slides (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_format_id uuid not null references content_formats(id) on delete cascade,
  position          integer not null,
  is_cover          boolean not null default false,
  headline          text,
  phrase            text,
  created_at        timestamptz not null default now(),
  unique (content_format_id, position)
);
create index ix_slides_tenant on carousel_slides(tenant_id);

create table static_posts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_format_id uuid not null references content_formats(id) on delete cascade,
  main_text         text,
  visual_call       text,                      -- chamada visual
  caption           text,
  cta               text,
  image_suggestion  text,
  created_at        timestamptz not null default now()
);
create index ix_posts_tenant on static_posts(tenant_id);

create table stories (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_format_id uuid not null references content_formats(id) on delete cascade,
  sequence          jsonb not null default '[]'::jsonb, -- [{text, type}]
  poll              jsonb,                     -- {question, options[]}
  question_box      text,
  cta               text,
  created_at        timestamptz not null default now()
);
create index ix_stories_tenant on stories(tenant_id);

create table linkedin_posts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_format_id uuid not null references content_formats(id) on delete cascade,
  title             text,
  intro             text,
  body              text,                      -- desenvolvimento
  conclusion        text,
  cta               text,
  created_at        timestamptz not null default now()
);
create index ix_linkedin_tenant on linkedin_posts(tenant_id);

-- Versões (ajustes/regenerações) de um formato.
create table content_versions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_format_id uuid not null references content_formats(id) on delete cascade,
  version           integer not null default 1,
  reason            text,                      -- ajuste solicitado
  snapshot          jsonb not null,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index ix_versions_format on content_versions(content_format_id, version desc);

-- ── Comportamento, metas e relatórios ───────────────────────────────────────
create table behavior_events (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_id        uuid references content_items(id) on delete set null,
  script_id         uuid references scripts(id) on delete set null,
  event_type        behavior_event_type not null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index ix_events_user_type_date on behavior_events(user_id, event_type, created_at desc);
create index ix_events_tenant_date on behavior_events(tenant_id, created_at desc);

create table weekly_goals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  week_start        date not null,             -- segunda-feira da semana
  target            integer not null default 3,
  delivered_count   integer not null default 0,
  read_count        integer not null default 0,
  produced_count    integer not null default 0,
  published_count   integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, week_start)
);
create index ix_goals_tenant on weekly_goals(tenant_id, week_start desc);

create table weekly_reports (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  week_start        date not null,
  opportunities     integer not null default 0,
  read_count        integer not null default 0,
  produced_count    integer not null default 0,
  videos_recorded   integer not null default 0,
  posts_created     integer not null default 0,
  published_count   integer not null default 0,
  execution_rate    real,                      -- publicados / entregues
  comparison        jsonb not null default '{}'::jsonb,
  achievement       text,                      -- conquista
  attention_point   text,                      -- ponto de atenção
  recommendation    text,
  next_week_goal    integer,
  narrative         text,                      -- texto gerado (voz da marca)
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, week_start)
);
create index ix_reports_tenant on weekly_reports(tenant_id, week_start desc);

-- ── Entregas, feedback, histórico ───────────────────────────────────────────
create table deliveries (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  opportunity_id    uuid references daily_opportunities(id) on delete set null,
  channel           delivery_channel not null default 'in_app',
  delivered_at      timestamptz not null default now(),
  opened_at         timestamptz,
  metadata          jsonb not null default '{}'::jsonb
);
create index ix_deliveries_user on deliveries(user_id, delivered_at desc);

create table feedbacks (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_item_id   uuid references content_items(id) on delete set null,
  rating            integer check (rating between 1 and 5),
  reason            text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index ix_feedbacks_tenant on feedbacks(tenant_id, created_at desc);

create table content_history (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_item_id   uuid references content_items(id) on delete cascade,
  from_status       content_status,
  to_status         content_status not null,
  note              text,
  actor_id          uuid references users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index ix_history_item on content_history(content_item_id, created_at desc);

-- ── Notificações ────────────────────────────────────────────────────────────
create table notification_devices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  platform          text not null default 'web',   -- web | expo | fcm | apns (futuro)
  endpoint          text not null,
  p256dh            text,
  auth              text,
  user_agent        text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  unique (user_id, endpoint)
);
create index ix_devices_user on notification_devices(user_id) where is_active;

create table notifications (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  type              notification_type not null,
  title             text not null,
  body              text,
  data              jsonb not null default '{}'::jsonb,
  channel           delivery_channel not null default 'web_push',
  scheduled_for     timestamptz,
  sent_at           timestamptz,
  read_at           timestamptz,
  created_at        timestamptz not null default now()
);
create index ix_notifications_user on notifications(user_id, created_at desc);

-- ── Conteúdo visual / templates (MÓDULO 16) ─────────────────────────────────
create table content_templates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,  -- null = global
  name              text not null,
  format            format_type not null,
  dimensions        text not null default '1080x1350',
  font_family       text not null default 'Instrument Sans',
  colors            jsonb not null default '{}'::jsonb,   -- {bg, fg, accent}
  text_positions    jsonb not null default '{}'::jsonb,
  background        jsonb not null default '{}'::jsonb,   -- {type, value}
  logo_url          text,
  status            template_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index ix_templates_tenant on content_templates(tenant_id, format) where deleted_at is null;

-- ── Operações: logs, custos, erros, auditoria ───────────────────────────────
-- Idempotência e rastreio de execuções (webhooks Make, jobs).
create table execution_logs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  source            text not null,             -- make | cron | api | ai
  operation         text not null,
  idempotency_key   text,
  request           jsonb,
  response          jsonb,
  status            text not null default 'received', -- received|processing|done|error|duplicate
  duration_ms       integer,
  created_at        timestamptz not null default now()
);
create unique index ux_exec_idempotency on execution_logs(idempotency_key) where idempotency_key is not null;
create index ix_exec_tenant on execution_logs(tenant_id, created_at desc);

create table cost_logs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  user_id           uuid references users(id) on delete set null,
  content_id        uuid references content_items(id) on delete set null,
  provider          text not null,             -- anthropic | openai
  model             text not null,
  scenario          ai_scenario not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cost_usd          numeric(12,6) not null default 0,
  created_at        timestamptz not null default now()
);
create index ix_costs_tenant_date on cost_logs(tenant_id, created_at desc);

create table system_errors (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  scope             text not null,             -- ai | make | push | camera | job | api
  message           text not null,
  context           jsonb not null default '{}'::jsonb,
  stack             text,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index ix_errors_tenant_date on system_errors(tenant_id, created_at desc);

-- Auditoria de ações administrativas (MÓDULO 17).
create table audit_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade,
  actor_id          uuid references users(id) on delete set null,
  action            text not null,
  entity            text,
  entity_id         uuid,
  changes           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index ix_audit_tenant_date on audit_log(tenant_id, created_at desc);

-- ==================== migrations/0002_functions.sql ====================

-- ============================================================================
-- Motor de Autoridade — 0002_functions
-- Funções auxiliares, triggers de updated_at, sincronização de auth e
-- helpers de RLS (usados pelas políticas em 0003_rls.sql).
-- ============================================================================

-- ── updated_at automático ───────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'tenants','users','client_profiles','client_preferences','sources',
    'daily_opportunities','content_items','content_formats','scripts',
    'weekly_goals','content_templates'
  ]
  loop
    execute format(
      'drop trigger if exists trg_%1$s_updated on %1$s;
       create trigger trg_%1$s_updated before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── Helpers de RLS ──────────────────────────────────────────────────────────
-- SECURITY DEFINER para ler public.users sem recursão de política.
create or replace function app_current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function app_current_tenant()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid();
$$;

create or replace function app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_current_role() in ('admin','super_admin'), false);
$$;

create or replace function app_is_super()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_current_role() = 'super_admin', false);
$$;

-- Regra base: super_admin vê tudo; demais veem apenas o próprio tenant.
create or replace function app_can_see_tenant(row_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_super() or row_tenant = app_current_tenant();
$$;

-- ── Sincronização auth.users → public.users ─────────────────────────────────
-- Cria a linha de perfil ao registrar. tenant_id/role podem vir de metadata.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role, tenant_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'client'),
    nullif(new.raw_user_meta_data->>'tenant_id','')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ── Criação do tenant no onboarding ─────────────────────────────────────────
-- Cliente solo cria o próprio tenant no onboarding. Como a RLS de tenants só
-- permite escrita a super_admin (e a leitura do RETURNING exige já ser membro),
-- a criação passa por esta função SECURITY DEFINER: identifica o usuário por
-- auth.uid(), cria o tenant e o vincula. Idempotente.
create or replace function create_my_tenant(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  select tenant_id into v_tenant_id from public.users where id = v_uid;
  if v_tenant_id is not null then
    return v_tenant_id;
  end if;

  insert into public.tenants (name, slug, status)
    values (p_name, p_slug, 'trial')
    returning id into v_tenant_id;

  update public.users set tenant_id = v_tenant_id where id = v_uid;

  return v_tenant_id;
end;
$$;

revoke all on function create_my_tenant(text, text) from public;
grant execute on function create_my_tenant(text, text) to authenticated;

-- ── contexto_mestre ─────────────────────────────────────────────────────────
-- Consolida perfil + preferências no JSON usado pela IA. Chamada ao final do
-- onboarding (e sempre que o perfil muda).
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
      'cidade', p.city
    ),
    'publico', jsonb_build_object(
      'alvo', p.target_audience,
      'dores', p.audience_pains
    ),
    'editorial', jsonb_build_object(
      'objetivos', p.goals,
      'temas', p.main_themes,
      'temas_proibidos', p.forbidden_themes,
      'tom_de_voz', p.tone_of_voice,
      'canais', p.channels
    ),
    'operacao', jsonb_build_object(
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
    )
  )
  into ctx
  from users u
  left join client_profiles p on p.user_id = u.id
  left join client_preferences pr on pr.user_id = u.id
  where u.id = p_user_id;

  return coalesce(ctx, '{}'::jsonb);
end;
$$;

-- ==================== migrations/0003_rls.sql ====================

-- ============================================================================
-- Motor de Autoridade — 0003_rls
-- Row Level Security. Regra central: nenhum cliente vê dados de outro cliente;
-- nenhum tenant vê dados de outro tenant. super_admin enxerga tudo.
-- (service_role do Supabase ignora RLS — usado apenas no servidor.)
-- ============================================================================

-- ── Guard: impedir auto-escalonamento de papel/tenant ───────────────────────
create or replace function guard_user_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Se quem edita não é admin/super e está mexendo no próprio registro,
  -- não pode alterar role, nem TROCAR um tenant já definido. A primeira
  -- atribuição de tenant (null → valor) é permitida — necessária no onboarding.
  if not app_is_admin() and new.id = auth.uid() then
    if new.role is distinct from old.role
       or (old.tenant_id is not null and new.tenant_id is distinct from old.tenant_id) then
      raise exception 'não é permitido alterar papel ou tenant do próprio usuário';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_user_self on users;
create trigger trg_guard_user_self
  before update on users
  for each row execute function guard_user_self_update();

-- ── Habilitar RLS em todas as tabelas ───────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','users','client_profiles','client_preferences','sources',
    'monitored_contents','content_analyses','daily_opportunities','content_items',
    'content_formats','scripts','carousel_slides','static_posts','stories',
    'linkedin_posts','content_versions','behavior_events','weekly_goals',
    'weekly_reports','deliveries','feedbacks','content_history','notifications',
    'notification_devices','content_templates','execution_logs','cost_logs',
    'system_errors','audit_log'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
  end loop;
end $$;

-- ── Tabelas "pessoais" (têm user_id): dono + admin do tenant + super ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'client_profiles','client_preferences','daily_opportunities','content_items',
    'content_formats','scripts','carousel_slides','static_posts','stories',
    'linkedin_posts','content_versions','behavior_events','weekly_goals',
    'weekly_reports','deliveries','feedbacks','content_history','notifications',
    'notification_devices'
  ]
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

-- ── Tabelas compartilhadas por tenant (leitura por membros; escrita por admin) ─
do $$
declare t text;
begin
  foreach t in array array['sources','monitored_contents','content_analyses']
  loop
    execute format('drop policy if exists p_%1$s_read on %1$s;', t);
    execute format($f$
      create policy p_%1$s_read on %1$s
      for select
      using (app_is_super() or tenant_id is null or tenant_id = app_current_tenant());
    $f$, t);
    execute format('drop policy if exists p_%1$s_write on %1$s;', t);
    execute format($f$
      create policy p_%1$s_write on %1$s
      for all
      using (app_is_super() or (app_is_admin() and tenant_id = app_current_tenant()))
      with check (app_is_super() or (app_is_admin() and tenant_id = app_current_tenant()));
    $f$, t);
  end loop;
end $$;

-- ── content_templates: globais (tenant_id null) legíveis por todos; edição admin ─
drop policy if exists p_templates_read on content_templates;
create policy p_templates_read on content_templates
  for select
  using (tenant_id is null or app_is_super() or tenant_id = app_current_tenant());

drop policy if exists p_templates_write on content_templates;
create policy p_templates_write on content_templates
  for all
  using (app_is_super() or (app_is_admin() and tenant_id = app_current_tenant()))
  with check (app_is_super() or (app_is_admin() and tenant_id = app_current_tenant()));

-- ── Tabelas de operação: apenas admin do tenant / super ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['execution_logs','cost_logs','system_errors','audit_log']
  loop
    execute format('drop policy if exists p_%1$s_admin on %1$s;', t);
    execute format($f$
      create policy p_%1$s_admin on %1$s
      for all
      using (app_is_super() or (app_is_admin() and (tenant_id is null or tenant_id = app_current_tenant())))
      with check (app_is_super() or (app_is_admin() and (tenant_id is null or tenant_id = app_current_tenant())));
    $f$, t);
  end loop;
end $$;

-- ── users ───────────────────────────────────────────────────────────────────
drop policy if exists p_users_select on users;
create policy p_users_select on users
  for select
  using (
    app_is_super()
    or id = auth.uid()
    or (app_is_admin() and tenant_id = app_current_tenant())
  );

drop policy if exists p_users_update on users;
create policy p_users_update on users
  for update
  using (
    app_is_super()
    or id = auth.uid()
    or (app_is_admin() and tenant_id = app_current_tenant())
  )
  with check (
    app_is_super()
    or id = auth.uid()
    or (app_is_admin() and tenant_id = app_current_tenant())
  );

drop policy if exists p_users_admin_write on users;
create policy p_users_admin_write on users
  for insert
  with check (app_is_super() or (app_is_admin() and tenant_id = app_current_tenant()));

drop policy if exists p_users_admin_delete on users;
create policy p_users_admin_delete on users
  for delete
  using (app_is_super() or (app_is_admin() and tenant_id = app_current_tenant()));

-- ── tenants ─────────────────────────────────────────────────────────────────
drop policy if exists p_tenants_select on tenants;
create policy p_tenants_select on tenants
  for select
  using (app_is_super() or id = app_current_tenant());

drop policy if exists p_tenants_update on tenants;
create policy p_tenants_update on tenants
  for update
  using (app_is_super() or (app_is_admin() and id = app_current_tenant()))
  with check (app_is_super() or (app_is_admin() and id = app_current_tenant()));

drop policy if exists p_tenants_super_write on tenants;
create policy p_tenants_super_write on tenants
  for insert with check (app_is_super());

drop policy if exists p_tenants_super_delete on tenants;
create policy p_tenants_super_delete on tenants
  for delete using (app_is_super());

-- ==================== migrations/0004_seed_templates.sql ====================

-- ============================================================================
-- Motor de Autoridade — 0004_seed_templates
-- Dados de referência (não simulados): templates visuais globais do design
-- system. Não cria clientes/usuários fictícios.
-- ============================================================================

insert into content_templates (tenant_id, name, format, dimensions, font_family, colors, text_positions, background, status)
values
  (null, 'Carrossel · Editorial Creme', 'carousel', '1080x1350', 'Instrument Sans',
   '{"bg":"#faf7f2","fg":"#1c1a16","accent":"#a87b2f"}',
   '{"headline":{"x":80,"y":140,"align":"left"},"phrase":{"x":80,"y":420,"align":"left"}}',
   '{"type":"solid","value":"#faf7f2"}', 'active'),

  (null, 'Carrossel · Floresta', 'carousel', '1080x1350', 'Newsreader',
   '{"bg":"#143627","fg":"#faf7f2","accent":"#e9c87b"}',
   '{"headline":{"x":80,"y":160,"align":"left"},"phrase":{"x":80,"y":460,"align":"left"}}',
   '{"type":"solid","value":"#143627"}', 'active'),

  (null, 'Post · Autoridade', 'post', '1080x1080', 'Newsreader',
   '{"bg":"#e7e1d6","fg":"#1c1a16","accent":"#a87b2f"}',
   '{"main_text":{"x":90,"y":360,"align":"center"}}',
   '{"type":"solid","value":"#e7e1d6"}', 'active'),

  (null, 'Story · Vertical Creme', 'story', '1080x1920', 'Instrument Sans',
   '{"bg":"#faf7f2","fg":"#1c1a16","accent":"#c9a94e"}',
   '{"text":{"x":80,"y":700,"align":"left"}}',
   '{"type":"solid","value":"#faf7f2"}', 'active')
on conflict do nothing;
