-- 045_abonnements.sql
-- Abonnements Stripe : plus de plan gratuit permanent. Un compte sans abonnement actif ou en
-- essai garde plan = 'free', qui signifie désormais « aucun accès aux outils » (voir
-- lib/plan-limits.ts et middleware.ts) ; seul le webhook Stripe fait passer un compte en
-- 'pro' ou 'agency' (lib/abonnement.ts).

alter table profils
  add column if not exists stripe_customer_id     text unique,
  add column if not exists stripe_subscription_id text,
  -- Statut Stripe brut de l'abonnement (trialing, active, past_due, canceled, unpaid,
  -- incomplete, incomplete_expired, paused) ; null = jamais abonné.
  add column if not exists abonnement_statut      text,
  add column if not exists essai_fin              timestamptz,
  add column if not exists periode_fin            timestamptz,
  -- Un seul essai par compte : passe à true dès qu'un abonnement avec période d'essai est créé,
  -- et n'est jamais remis à false (une seconde souscription démarre sans essai).
  add column if not exists essai_utilise          boolean not null default false;

-- La policy update_own (003) laisse un utilisateur modifier sa propre ligne depuis le
-- navigateur (préférences, onboarding) — donc aussi, jusqu'ici, sa colonne plan. Ce trigger
-- verrouille le plan et toutes les colonnes de facturation pour les rôles exposés via
-- PostgREST (anon, authenticated) : à l'insertion elles prennent leurs valeurs par défaut, à
-- la mise à jour elles gardent leur valeur précédente. Le webhook (service_role) et les
-- migrations (postgres) ne sont pas concernés.
create or replace function public.proteger_colonnes_facturation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.abonnement_statut := null;
      new.essai_fin := null;
      new.periode_fin := null;
      new.essai_utilise := false;
    else
      new.plan := old.plan;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.abonnement_statut := old.abonnement_statut;
      new.essai_fin := old.essai_fin;
      new.periode_fin := old.periode_fin;
      new.essai_utilise := old.essai_utilise;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profils_proteger_facturation on profils;

create trigger profils_proteger_facturation
  before insert or update on profils
  for each row execute function public.proteger_colonnes_facturation();
