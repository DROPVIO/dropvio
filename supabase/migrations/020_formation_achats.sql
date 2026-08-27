-- 020_formation_achats.sql
-- Remplace le modèle "add-on abonnement" (profils.formation_active, migration 016) par un
-- achat unique à vie par formation. L'accès n'est plus lié au plan (free/pro/agency) : un
-- utilisateur possède ou non chaque collection ('courte'/'longue'), indépendamment.
-- unique(user_id, collection) sert aussi de garde-fou d'idempotence pour le webhook Stripe
-- (checkout.session.completed peut être livré plusieurs fois pour le même paiement).
create table if not exists formation_achats (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  collection                  text not null check (collection in ('courte','longue')),
  prix_paye_centimes          integer not null default 0,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  -- 'unitaire' = achat direct de cette collection, 'bundle' = achetée via l'offre groupée
  -- (une ligne par collection, même session Stripe), 'manuel' = octroi support sans paiement
  -- (voir scripts/formation-grant.ts), en dehors de Stripe.
  achete_via                  text not null default 'unitaire' check (achete_via in ('unitaire','bundle','manuel')),
  created_at                  timestamptz not null default now(),
  unique (user_id, collection)
);

alter table formation_achats enable row level security;

-- Lecture seule pour l'utilisateur sur ses propres achats. Aucune policy insert/update/
-- delete : l'écriture ne passe que par le service role (webhook Stripe, script d'octroi
-- manuel), jamais directement depuis le client.
create policy "select_own" on formation_achats for select using (auth.uid() = user_id);

alter table profils drop column if exists formation_active;
