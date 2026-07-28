-- ============================================================================
-- Motor de Autoridade — 0014_atividades_whatsapp  (ASSESSOR 24H)
-- Histórico do que o vereador (ou o assessor, com a mesma senha) gerou pelo
-- WhatsApp: requerimento, projeto de lei, discurso, matéria etc. Hoje o Make
-- gera o texto e entrega direto no WhatsApp sem deixar rastro nenhum no banco
-- — esta tabela é o registro que falta pro dashboard do vereador ter dado real
-- pra mostrar (em vez de métricas do Take, que não se aplicam aqui).
-- ============================================================================

do $$ begin
  create type atividade_tipo as enum (
    'requerimento', 'projeto_lei', 'discurso', 'materia', 'outro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type atividade_canal as enum ('audio', 'texto');
exception when duplicate_object then null; end $$;

create table atividades_whatsapp (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  tipo          atividade_tipo not null default 'outro',
  canal         atividade_canal not null default 'texto',
  titulo        text not null,
  resumo        text,
  conteudo      text not null,
  created_at    timestamptz not null default now()
);
create index ix_atividades_user on atividades_whatsapp(user_id, created_at desc);
create index ix_atividades_tenant on atividades_whatsapp(tenant_id, created_at desc);

alter table atividades_whatsapp enable row level security;
alter table atividades_whatsapp force row level security;

-- Mesma regra das demais tabelas "pessoais": dono + admin do tenant + super.
create policy p_atividades_whatsapp_rw on atividades_whatsapp
  for all
  using (
    app_is_super()
    or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
  )
  with check (
    app_is_super()
    or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
  );
