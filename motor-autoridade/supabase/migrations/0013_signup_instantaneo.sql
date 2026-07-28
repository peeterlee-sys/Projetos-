-- ============================================================================
-- Motor de Autoridade — 0013_signup_instantaneo  (ASSESSOR 24H)
-- A aprovação manual de cadastro (0007_signup_approval) existia pra evitar
-- que qualquer estranho gastasse IA de graça antes de ser aprovado. Agora que
-- existe o trial de 7 dias + corte automático por assinatura (Asaas), essa
-- trava manual só atrapalha o cadastro self-service — o vereador entra e já
-- começa o trial na hora, sem esperar aprovação.
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
    true -- cadastro instantâneo: o trial de 7 dias e a assinatura são o gate real agora.
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Libera quem já estava pendente de aprovação (ex.: cadastros de teste).
update public.users set is_active = true where is_active = false and role = 'client';
