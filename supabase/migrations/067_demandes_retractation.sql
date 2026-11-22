-- 067 — Demandes de rétractation déposées en ligne (/retractation).
-- Formulaire accessible sans connexion : user_id est renseigné seulement si la personne était
-- connectée. Écrite et lue uniquement par le serveur (service role) : aucune policy. Le
-- remboursement éventuel est traité à la main dans Stripe, puis statut passe à 'traitee'.

create table if not exists demandes_retractation (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  nom text not null,
  email text not null,
  achat text not null,
  achat_ref text,
  date_achat date not null,
  statut text not null default 'recue' check (statut in ('recue', 'traitee')),
  adresse_ip text,
  created_at timestamptz not null default now(),
  traitee_le timestamptz
);

create index if not exists demandes_retractation_statut_idx on demandes_retractation (statut, created_at desc);

alter table demandes_retractation enable row level security;
-- Aucune policy : table réservée au service role (liste : scripts/demandes-retractation.ts).
