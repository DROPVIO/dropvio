-- 071 — Progression en temps réel de la création d'un site (Site Builder).
--
-- La génération (POST /api/generate-site) dure souvent plus de 10 secondes. Le client crée un
-- identifiant de suivi (uuid), l'envoie avec la demande, puis interroge
-- GET /api/generate-site/progression?id=… toutes les 1,5 s. La route de génération écrit ici,
-- au plus une fois par seconde, l'étape en cours et le nombre de caractères de HTML déjà reçus
-- de l'IA : c'est l'avancement réel, partagé entre les instances serveur (un état en mémoire ne
-- le serait pas).
--
-- Écriture : seulement par le serveur (clé service, lib/progression-site.ts). Lecture : chaque
-- compte lit ses propres lignes. Les lignes de plus d'un jour sont effacées par la route à
-- chaque nouvelle génération du même compte. Aucune donnée de contenu n'est stockée.
--
-- Sans cette migration, la création de site fonctionne comme avant : l'écriture échoue sans
-- bloquer, et l'interface affiche une progression estimée au lieu de l'avancement réel.

create table if not exists public.progression_generation_site (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  etape       text not null,
  caracteres  integer not null default 0,
  appel       smallint not null default 0,
  cree_le     timestamptz not null default now(),
  maj_le      timestamptz not null default now(),
  constraint progression_generation_site_etape_check
    check (etape in ('preparation', 'redaction', 'relance', 'gabarits', 'termine', 'erreur')),
  constraint progression_generation_site_caracteres_check check (caracteres >= 0)
);

create index if not exists progression_generation_site_user_idx
  on public.progression_generation_site (user_id, cree_le desc);

alter table public.progression_generation_site enable row level security;

drop policy if exists progression_generation_site_select_own on public.progression_generation_site;
create policy progression_generation_site_select_own on public.progression_generation_site
  for select to authenticated
  using ((select auth.uid()) = user_id);
