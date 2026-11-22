-- Accusés de résiliation (parcours /resiliation) : preuve de la demande de résiliation
-- d'un abonnement, avec sa référence et la date de fin d'accès annoncée.
-- Écriture réservée au serveur (service role) ; chaque compte lit ses propres accusés.
create table if not exists public.resiliations (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  plan                    text not null check (plan in ('pro', 'agency', 'expert')),
  stripe_subscription_id  text not null,
  fin_acces               timestamptz,
  adresse_ip              text,
  created_at              timestamptz not null default now()
);

create index if not exists resiliations_user_idx on public.resiliations (user_id, created_at desc);

alter table public.resiliations enable row level security;

drop policy if exists resiliations_select_own on public.resiliations;
create policy resiliations_select_own on public.resiliations
  for select to authenticated
  using ((select auth.uid()) = user_id);
