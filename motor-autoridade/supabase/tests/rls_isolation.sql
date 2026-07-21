-- ============================================================================
-- Teste de isolamento multicliente (MÓDULO 20 — o teste mais crítico).
-- Verifica que nenhum cliente vê/escreve dados de outro, e que o admin só
-- enxerga o próprio tenant. Roda numa transação e faz ROLLBACK ao final.
--
-- Como rodar (contra o seu Supabase, como usuário admin/postgres):
--   psql "$DATABASE_URL" -f supabase/tests/rls_isolation.sql
--   -- ou: supabase db execute --file supabase/tests/rls_isolation.sql
-- Sucesso = nenhuma exceção. Qualquer falha de isolamento aborta com erro.
-- ============================================================================

begin;

-- IDs fixos para o teste.
\set t1 '11111111-1111-1111-1111-111111111111'
\set t2 '22222222-2222-2222-2222-222222222222'
\set uA 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set uB 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set uAdmin 'dddddddd-dddd-dddd-dddd-dddddddddddd'

-- Seed como superusuário (bypassa RLS).
insert into tenants (id, name, slug) values (:'t1', 'Tenant 1', 't1-test'), (:'t2', 'Tenant 2', 't2-test');
insert into users (id, tenant_id, email, role, onboarded_at) values
  (:'uA', :'t1', 'a-test@x.com', 'client', now()),
  (:'uB', :'t2', 'b-test@x.com', 'client', now()),
  (:'uAdmin', :'t1', 'admin-test@x.com', 'admin', now());
insert into content_items (tenant_id, user_id, title, status) values
  (:'t1', :'uA', 'Conteúdo de A', 'published'),
  (:'t2', :'uB', 'Conteúdo de B', 'published');

-- ── Como CLIENTE A (tenant 1) ───────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'uA', 'role', 'authenticated')::text, true);

do $$
begin
  if (select count(*) from content_items) <> 1 then
    raise exception 'FALHA: cliente A deveria ver exatamente 1 conteúdo (o seu)';
  end if;
  if exists (select 1 from content_items where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'VAZAMENTO: cliente A conseguiu ver conteúdo de B';
  end if;
end $$;

-- A não pode escrever conteúdo para B (with check da RLS).
do $$
begin
  begin
    insert into content_items (tenant_id, user_id, title)
    values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'invasao');
    raise exception 'FALHA: cliente A conseguiu inserir conteúdo para B';
  exception when insufficient_privilege then
    null; -- esperado: RLS bloqueou
  end;
end $$;

-- ── Como ADMIN do tenant 1 ──────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'role', 'authenticated')::text, true);

do $$
begin
  -- Admin vê o conteúdo do próprio tenant (A), mas não o do outro tenant (B).
  if exists (select 1 from content_items where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'VAZAMENTO: admin do tenant 1 viu conteúdo do tenant 2';
  end if;
  if (select count(*) from content_items) <> 1 then
    raise exception 'FALHA: admin do tenant 1 deveria ver apenas o conteúdo do seu tenant';
  end if;
end $$;

reset role;

do $$ begin raise notice 'OK: isolamento multicliente/RLS verificado com sucesso.'; end $$;

rollback;
