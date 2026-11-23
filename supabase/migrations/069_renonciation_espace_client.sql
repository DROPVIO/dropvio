-- 069 — Renonciation au contrat depuis l'espace client (bouton « Renoncer au contrat ici »).
-- Les demandes de rétractation (067) et de résiliation (068) gardent leurs tables. Celle des
-- rétractations reçoit les champs du parcours connecté : origine, motif facultatif,
-- abonnement Stripe concerné et trace du remboursement intégral lancé via Stripe.
-- Prérequis : migrations 067 et 068 appliquées.

alter table public.demandes_retractation
  add column if not exists origine text not null default 'formulaire',
  add column if not exists motif text,
  add column if not exists stripe_subscription_id text,
  add column if not exists montant_rembourse_centimes integer,
  add column if not exists devise text,
  add column if not exists stripe_refund_ids text[] not null default '{}',
  add column if not exists rembourse_le timestamptz;

alter table public.demandes_retractation
  drop constraint if exists demandes_retractation_origine_check;
alter table public.demandes_retractation
  add constraint demandes_retractation_origine_check check (origine in ('formulaire', 'espace_client'));

alter table public.demandes_retractation
  drop constraint if exists demandes_retractation_motif_check;
alter table public.demandes_retractation
  add constraint demandes_retractation_motif_check check (motif is null or char_length(motif) <= 1000);

-- Nouveau statut « remboursee » : remboursement intégral lancé automatiquement via Stripe.
alter table public.demandes_retractation
  drop constraint if exists demandes_retractation_statut_check;
alter table public.demandes_retractation
  add constraint demandes_retractation_statut_check check (statut in ('recue', 'remboursee', 'traitee'));

-- Une seule renonciation par abonnement Stripe.
create unique index if not exists demandes_retractation_subscription_idx
  on public.demandes_retractation (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists demandes_retractation_user_idx
  on public.demandes_retractation (user_id, created_at desc);

-- Chaque compte peut lire ses propres demandes ; l'écriture reste réservée au serveur.
drop policy if exists demandes_retractation_select_own on public.demandes_retractation;
create policy demandes_retractation_select_own on public.demandes_retractation
  for select to authenticated
  using ((select auth.uid()) = user_id);
