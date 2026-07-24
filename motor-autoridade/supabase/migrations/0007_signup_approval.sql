-- ============================================================================
-- Take — 0007_signup_approval
-- Novos cadastros de cliente nascem PENDENTES (is_active = false) e só acessam
-- o app após aprovação de um admin/super_admin. Admins criados por SQL/painel
-- continuam ativos.
-- ============================================================================

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'client');
begin
  insert into public.users (id, email, full_name, role, tenant_id, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    v_role,
    nullif(new.raw_user_meta_data->>'tenant_id','')::uuid,
    -- Cliente novo = pendente de aprovação. Demais papéis já entram ativos.
    case when v_role = 'client' then false else true end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Garante que contas já existentes permaneçam ativas (não retroage a pendência).
update public.users set is_active = true where is_active is null;
