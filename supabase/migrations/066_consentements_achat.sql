-- 066 — Preuve du consentement avant paiement (droit de rétractation).
-- Écrite uniquement par le serveur (service role, lib/consentements-serveur.ts) ; chaque
-- utilisateur peut lire les siennes. Aucune modification ni suppression par l'utilisateur.

create table if not exists consentements_achat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type_achat text not null check (type_achat in (
    'abonnement_pro', 'abonnement_agency', 'abonnement_expert', 'recharge_expert',
    'formation_courte', 'formation_longue', 'formation_bundle'
  )),
  texte_case_1 text not null,
  texte_case_2 text not null,
  langue text not null default 'fr',
  adresse_ip text,
  created_at timestamptz not null default now()
);

create index if not exists consentements_achat_user_idx on consentements_achat (user_id, created_at desc);

alter table consentements_achat enable row level security;

drop policy if exists "select_own" on consentements_achat;
create policy "select_own" on consentements_achat
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- Aucune policy d'écriture : seul le service role écrit.
