-- ============================================================================
-- Motor de Autoridade — 0016_video_jobs  (ASSESSOR 24H)
-- Fila de edição de vídeo do vereador.
--
-- Antes disso a edição acontecia dentro da requisição: o vereador escolhia o
-- vídeo e tinha que ficar de app aberto por minutos até o fim. Se trocasse de
-- tela ou recebesse uma ligação, perdia tudo e não sobrava rastro nenhum.
--
-- Com a fila o trabalho vira um registro: o envio termina, o pedido fica aqui
-- e o processamento segue no servidor. O vereador fecha o app e encontra o
-- vídeo pronto quando voltar.
--
-- Tabela separada de edit_requests de propósito: aquela é do Take, aponta para
-- content_items e não guarda nada do corte de pausas.
-- ============================================================================

do $$ begin
  create type video_job_status as enum (
    'pendente', 'cortando', 'legendando', 'pronto', 'falhou'
  );
exception when duplicate_object then null; end $$;

create table if not exists video_jobs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,

  nome_origem      text not null,        -- nome do arquivo escolhido na galeria
  source_path      text not null,        -- caminho do original no bucket 'recordings'
  cortar           boolean not null default true,
  legendar         boolean not null default false,

  status           video_job_status not null default 'pendente',
  output_path      text,                 -- vídeo final no bucket
  erro             text,

  -- O que o corte fez, para a tela poder mostrar ao vereador.
  duracao_original int,
  duracao_final    int,
  cortes           int,
  excede_whatsapp  boolean not null default false,

  -- Render de legenda no ZapCap, que é assíncrono e pode passar da requisição.
  zapcap_video_id  text,
  zapcap_task_id   text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ix_video_jobs_user on video_jobs(user_id, created_at desc);
create index if not exists ix_video_jobs_tenant on video_jobs(tenant_id, created_at desc);

-- O cron varre o que ficou no meio do caminho; sem este índice ele faria
-- varredura cheia da tabela a cada passada.
create index if not exists ix_video_jobs_abertos on video_jobs(status, created_at)
  where status in ('pendente', 'cortando', 'legendando');

drop trigger if exists trg_video_jobs_updated on video_jobs;
create trigger trg_video_jobs_updated before update on video_jobs
  for each row execute function set_updated_at();

-- RLS: dono + admin do tenant + super, mesmo padrão das demais tabelas pessoais.
alter table video_jobs enable row level security;
alter table video_jobs force row level security;

drop policy if exists p_video_jobs_rw on video_jobs;
create policy p_video_jobs_rw on video_jobs
  for all
  using (
    app_is_super()
    or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
  )
  with check (
    app_is_super()
    or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
  );
