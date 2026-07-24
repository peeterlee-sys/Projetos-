-- ============================================================================
-- Motor de Autoridade — 0005_brand
-- Identidade visual do cliente (cores + logo) no perfil editorial.
-- Colunas idempotentes: seguras para rodar em bancos já existentes.
-- ============================================================================

alter table client_profiles add column if not exists brand_primary   text;
alter table client_profiles add column if not exists brand_secondary text;
alter table client_profiles add column if not exists brand_accent    text;
alter table client_profiles add column if not exists logo_url        text;
