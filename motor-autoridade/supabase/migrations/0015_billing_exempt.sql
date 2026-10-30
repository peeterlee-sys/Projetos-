-- ============================================================================
-- Motor de Autoridade — 0015_billing_exempt  (ASSESSOR 24H)
-- Conta interna: fica fora da régua de cobrança. Serve para a conta do dono e
-- para contas de demonstração usadas em apresentação — elas nunca entram em
-- 'past_due' por trial vencido nem por fatura em aberto, então o WhatsApp
-- segue atendendo mesmo sem assinatura paga.
-- ============================================================================

alter table client_profiles
  add column if not exists billing_exempt boolean not null default false;

comment on column client_profiles.billing_exempt is
  'true = conta interna (dono/demonstração): nunca é bloqueada por cobrança.';

create index if not exists ix_client_profiles_billing_exempt
  on client_profiles(billing_exempt) where billing_exempt;

-- Conta do dono fora da régua, já destravada.
update client_profiles
set billing_exempt = true,
    subscription_status = 'active',
    subscription_updated_at = now()
where user_id in (select id from users where email = 'peeterlee@gmail.com');
