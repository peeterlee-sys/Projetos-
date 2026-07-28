-- ============================================================================
-- Motor de Autoridade — 0012_subscription  (ASSESSOR 24H)
-- Trial de 7 dias + assinatura paga (Asaas). Ao concluir a anamnese, o
-- vereador entra em 'trial'; passado trial_ends_at sem pagamento confirmado,
-- o WhatsApp deixa de atender até a assinatura ficar 'active' de novo (via
-- webhook do Asaas).
-- ============================================================================

alter table client_profiles
  add column if not exists subscription_status text not null default 'trial',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists plan_cycle text,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists subscription_updated_at timestamptz;

alter table client_profiles
  drop constraint if exists client_profiles_subscription_status_check;
alter table client_profiles
  add constraint client_profiles_subscription_status_check
  check (subscription_status in ('trial', 'active', 'past_due', 'canceled'));

alter table client_profiles
  drop constraint if exists client_profiles_plan_cycle_check;
alter table client_profiles
  add constraint client_profiles_plan_cycle_check
  check (plan_cycle is null or plan_cycle in ('monthly', 'yearly'));

create index if not exists ix_client_profiles_asaas_customer on client_profiles(asaas_customer_id);
create index if not exists ix_client_profiles_asaas_subscription on client_profiles(asaas_subscription_id);

comment on column client_profiles.subscription_status is
  'trial (7 dias grátis) | active (pago) | past_due (trial/pagamento vencido, WhatsApp bloqueado) | canceled.';
comment on column client_profiles.trial_ends_at is
  'Fim do período grátis de 7 dias, definido ao concluir a anamnese.';
