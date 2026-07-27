-- ============================================================================
-- Motor de Autoridade — 0011_lgpd_consent  (ASSESSOR 24H)
-- Registro do consentimento LGPD (Lei nº 13.709/2018) exigido pela SEÇÃO 6 do
-- formulário "Assessor 24h - Anamnese". A anamnese não é aceita sem marcar o
-- termo — este timestamp é a prova de quando o vereador autorizou o uso dos
-- dados.
-- ============================================================================

alter table client_profiles
  add column if not exists lgpd_consent_at timestamptz;

comment on column client_profiles.lgpd_consent_at is
  'Momento em que o titular marcou o termo de consentimento LGPD na anamnese.';
