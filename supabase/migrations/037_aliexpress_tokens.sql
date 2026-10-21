-- 037_aliexpress_tokens.sql
-- Connexion OAuth AliExpress par utilisateur (API Dropshipping aliexpress.ds.*, qui exige un
-- access_token). Une ligne par utilisateur Dropvio. Les deux tokens sont chiffrés
-- (AES-256-GCM, lib/crypto.ts — TOKEN_ENCRYPTION_KEY) : jamais de token en clair en base.
-- Écritures (callback OAuth, rafraîchissement) via le service role uniquement, voir
-- lib/aliexpress-oauth.ts.

create table if not exists aliexpress_tokens (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  access_token_chiffre  text,
  refresh_token_chiffre text,
  expire_le             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- RLS activée SANS aucune policy (même pattern que shopify_connections, voir
-- 015_shopify_integration.sql) : ni anon ni authenticated ne peuvent lire ou écrire cette
-- table, pas même leur propre ligne. Seul le service role (createSupabaseAdminClient, qui
-- contourne RLS) y accède, exclusivement depuis le serveur : lib/aliexpress-oauth.ts,
-- /api/aliexpress/status et /api/aliexpress/disconnect.
alter table aliexpress_tokens enable row level security;

-- Nettoyage si une version précédente de cette migration (avec policies) a déjà été exécutée.
drop policy if exists "select_own" on aliexpress_tokens;
drop policy if exists "update_own" on aliexpress_tokens;
