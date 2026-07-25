-- ============================================================================
-- Take — 0008_edit_requests
-- Edição de vídeo com legenda (ZapCap), disparada pelo cliente APÓS aprovar o
-- próprio vídeo. O vídeo gravado é enviado ao Supabase Storage (bucket
-- 'recordings'); o servidor manda a URL assinada ao ZapCap e acompanha o
-- render, gravando o resultado aqui.
-- ============================================================================

do $$ begin
  create type edit_request_status as enum ('pending', 'processing', 'ready', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists edit_requests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  content_item_id   uuid references content_items(id) on delete set null,
  provider          text not null default 'zapcap',
  template_id       text,
  language          text not null default 'pt',
  source_url        text,                 -- URL assinada do vídeo enviado
  external_video_id text,                 -- id do vídeo no provedor
  external_task_id  text,                 -- id da task de render no provedor
  status            edit_request_status not null default 'pending',
  output_url        text,                 -- vídeo final legendado
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ix_edit_requests_user on edit_requests(user_id, created_at desc);
create index if not exists ix_edit_requests_tenant on edit_requests(tenant_id, created_at desc);

drop trigger if exists trg_edit_requests_updated on edit_requests;
create trigger trg_edit_requests_updated before update on edit_requests
  for each row execute function set_updated_at();

-- RLS: dono + admin do tenant + super (mesmo padrão das tabelas pessoais).
alter table edit_requests enable row level security;
alter table edit_requests force row level security;
drop policy if exists p_edit_requests_rw on edit_requests;
create policy p_edit_requests_rw on edit_requests
  for all
  using (
    app_is_super()
    or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
  )
  with check (
    app_is_super()
    or (tenant_id = app_current_tenant() and (app_is_admin() or user_id = auth.uid()))
  );

-- ── Storage: bucket privado 'recordings' ────────────────────────────────────
-- Cada usuário sobe apenas na própria pasta (prefixo = auth.uid()).
insert into storage.buckets (id, name, public)
  values ('recordings', 'recordings', false)
  on conflict (id) do nothing;

drop policy if exists p_recordings_insert on storage.objects;
create policy p_recordings_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists p_recordings_select on storage.objects;
create policy p_recordings_select on storage.objects
  for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists p_recordings_delete on storage.objects;
create policy p_recordings_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
