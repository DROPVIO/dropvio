-- 015_shopify_integration.sql
-- Remplace le guide manuel "copie-colle le HTML dans Shopify" par une vraie intégration
-- OAuth + Admin API : connexion de boutique liée au compte dropvio, push produits/
-- collections, et réplication best-effort du design généré comme section de thème.

create table if not exists shopify_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  shop_domain   text not null,
  shop_name     text,
  access_token  text not null,
  scope         text,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists shopify_connections_shop_idx on shopify_connections(shop_domain);

-- RLS activée SANS aucune policy : ni anon ni authenticated ne peuvent lire/écrire cette
-- table, même leur propre ligne (access_token = secret qui ne doit jamais transiter par
-- la clé anon, même en lecture). Seul le service role (createSupabaseAdminClient, qui
-- bypass RLS) y accède, exclusivement depuis nos routes serveur — même pattern que
-- 010_secure_produits_rls.sql pour fermer un accès par simple absence de policy.
alter table shopify_connections enable row level security;

-- Idempotence des push : on mémorise l'id Shopify créé pour mettre à jour la même
-- ressource au prochain push au lieu d'en recréer une en double à chaque appel.
alter table boutique_produits add column if not exists shopify_product_id bigint;
alter table boutique_categories add column if not exists shopify_collection_id bigint;

alter table boutiques add column if not exists shopify_last_push_at timestamptz;
alter table boutiques add column if not exists shopify_last_push_status text;
alter table boutiques add column if not exists shopify_last_push_error text;

alter table sites_generes add column if not exists shopify_page_id bigint;
alter table sites_generes add column if not exists shopify_theme_id bigint;
alter table sites_generes add column if not exists shopify_section_key text;
