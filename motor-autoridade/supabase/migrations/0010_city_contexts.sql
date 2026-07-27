-- ============================================================================
-- Motor de Autoridade — 0010_city_contexts  (ASSESSOR 24H)
-- Contexto da cidade deixa de ser preenchido pelo vereador na anamnese (campo
-- removido do wizard) e passa a ser mantido pelo admin, uma vez por cidade —
-- vários vereadores da mesma cidade compartilham o mesmo contexto.
-- ============================================================================

create table if not exists city_contexts (
  id            uuid primary key default gen_random_uuid(),
  city          text not null,
  state         text not null,              -- UF, 2 letras
  context       text not null default '',
  updated_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (city, state)
);
create index if not exists ix_city_contexts_state on city_contexts(state);

drop trigger if exists trg_city_contexts_updated on city_contexts;
create trigger trg_city_contexts_updated before update on city_contexts
  for each row execute function set_updated_at();

-- Leitura por qualquer usuário autenticado (a anamnese consulta ao enviar,
-- com a sessão do próprio vereador); escrita restrita a admin/super.
alter table city_contexts enable row level security;
alter table city_contexts force row level security;

drop policy if exists p_city_contexts_read on city_contexts;
create policy p_city_contexts_read on city_contexts
  for select using (auth.uid() is not null);

drop policy if exists p_city_contexts_write on city_contexts;
create policy p_city_contexts_write on city_contexts
  for all
  using (app_is_admin())
  with check (app_is_admin());

-- ── Popula city_contexts a partir do que já existir em client_profiles ──────
-- (registros antigos que tinham local_context preenchido pelo vereador na
-- versão anterior do wizard viram o ponto de partida da biblioteca do admin).
insert into city_contexts (city, state, context)
select distinct on (lower(city), upper(state)) city, upper(state), local_context
from client_profiles
where city is not null and state is not null
  and local_context is not null and length(trim(local_context)) > 0
on conflict (city, state) do nothing;
