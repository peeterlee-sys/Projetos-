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
  -- não pode alterar role nem tenant_id.
  if not app_is_admin() and new.id = auth.uid() then
    if new.role is distinct from old.role
       or new.tenant_id is distinct from old.tenant_id then
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
