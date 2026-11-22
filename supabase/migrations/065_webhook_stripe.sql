-- 065 — Webhook Stripe : idempotence et résiliation programmée.
--
-- 1. stripe_evenements : un même event.id reçu deux fois n'est appliqué qu'une fois
--    (lib/stripe-webhook.ts). Écrite uniquement par le serveur (service role).
-- 2. profils.annulation_fin_periode : abonnement résilié à la fin de la période en cours
--    (cancel_at_period_end côté Stripe), affiché sur /abonnement, /parametres et /resiliation.
-- 3. proteger_colonnes_facturation protège aussi cette nouvelle colonne contre une
--    modification par l'utilisateur.

create table if not exists stripe_evenements (
  id text primary key,
  type text not null,
  traite_le timestamptz not null default now()
);

alter table stripe_evenements enable row level security;
-- Aucune policy : table réservée au service role.

alter table profils add column if not exists annulation_fin_periode boolean not null default false;

create or replace function public.proteger_colonnes_facturation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := null;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.abonnement_statut := null;
      new.essai_fin := null;
      new.periode_fin := null;
      new.essai_utilise := false;
      new.annulation_fin_periode := false;
    else
      new.plan := old.plan;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.abonnement_statut := old.abonnement_statut;
      new.essai_fin := old.essai_fin;
      new.periode_fin := old.periode_fin;
      new.essai_utilise := old.essai_utilise;
      new.annulation_fin_periode := old.annulation_fin_periode;
    end if;
  end if;
  return new;
end;
$function$;
