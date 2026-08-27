-- 019_shopify_incidents.sql
-- Remboursements/retours/litiges remontés automatiquement depuis Shopify (webhooks +
-- réconciliation périodique, voir app/api/webhooks/shopify et app/api/cron/shopify-reconcile).

create table if not exists shopify_incidents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  shopify_order_id   bigint not null,
  -- Identifiant de l'objet Shopify source (refund_id / dispute_id, ou order_id pour le
  -- signal de fallback "return" tiré d'orders/updated) — combiné à (user_id, type) pour
  -- l'idempotence : un webhook rejoué ou une réconciliation qui repasse dessus met à jour
  -- la même ligne au lieu d'en créer une en double.
  shopify_object_id  bigint not null,
  type               text not null check (type in ('refund', 'return', 'dispute')),
  statut             text,
  montant            numeric,
  devise             text,
  source             text not null default 'shopify_sync',
  -- Volontairement dépourvu de toute donnée personnelle client (nom, email, adresse) —
  -- uniquement identifiants de commande et montants/statuts financiers. Ce choix limite
  -- fortement la portée des webhooks GDPR customers/data_request et customers/redact
  -- (rien à fournir ni à supprimer par client), voir app/api/webhooks/shopify/gdpr/.
  raw_payload        jsonb not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, type, shopify_object_id)
);

create index if not exists shopify_incidents_user_idx on shopify_incidents(user_id, created_at desc);

-- Même pattern que shopify_connections (015_shopify_integration.sql) : RLS activée SANS
-- aucune policy anon/authenticated — seul le service role (webhooks, cron de réconciliation,
-- route /api/shopify/status) accède à cette table, exclusivement depuis nos routes serveur.
alter table shopify_incidents enable row level security;
