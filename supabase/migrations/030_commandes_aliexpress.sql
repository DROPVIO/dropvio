-- 030_commandes_aliexpress.sql
-- Préparation d'achat AliExpress à la commande Shopify (v1 "assist manuel", voir plan) :
-- une commande captée par webhook/réconciliation devient une fiche "à préparer" pour le
-- marchand (produit AliExpress source, quantité, infos variante, adresse client), qu'il
-- traite lui-même sur AliExpress.

create table if not exists commandes_a_preparer (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  shopify_order_id    bigint not null,
  shopify_order_name  text,
  statut              text not null default 'a_traiter'
                        check (statut in ('a_traiter', 'commandee', 'ignoree')),
  -- adresse_livraison/client_nom/client_telephone : de vraies données personnelles client,
  -- rupture assumée avec le principe "aucune PII stockée" de shopify_incidents (voir
  -- 019_shopify_incidents.sql) — nécessaire ici pour que le marchand puisse préparer son
  -- achat AliExpress. Peuvent être null si Shopify censure ces champs (app pas encore
  -- approuvée "Protected Customer Data") ou si customers/redact est passé par là.
  adresse_livraison   jsonb,
  client_nom          text,
  client_telephone    text,
  -- Tableau de lignes : [{shopify_product_id, boutique_produit_id, nom, quantite,
  -- variant_title, lien_aliexpress}] — lien_aliexpress peut être null si le produit n'a pas
  -- été poussé depuis le catalogue Dropvio (pas de source_produit_id à résoudre).
  lignes              jsonb not null default '[]',
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, shopify_order_id)
);

create index if not exists commandes_a_preparer_user_idx on commandes_a_preparer(user_id, statut, created_at desc);

-- Même pattern que shopify_connections/shopify_incidents : RLS activée SANS aucune policy
-- anon/authenticated — seul le service role (webhook, cron de réconciliation, routes
-- /api/shopify/commandes) accède à cette table, avec filtrage explicite par user_id côté
-- code plutôt que par policy, cohérent avec le reste de l'intégration Shopify.
alter table commandes_a_preparer enable row level security;
