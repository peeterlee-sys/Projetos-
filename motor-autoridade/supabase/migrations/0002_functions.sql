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
