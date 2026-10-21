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

alter table aliexpress_tokens enable row level security;

drop policy if exists "select_own" on aliexpress_tokens;
drop policy if exists "update_own" on aliexpress_tokens;

create policy "select_own" on aliexpress_tokens for select using (auth.uid() = user_id);
create policy "update_own" on aliexpress_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
