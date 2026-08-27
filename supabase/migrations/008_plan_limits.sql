-- Fondations pour les limites par plan (Free / Pro / Agency), vérifiées côté serveur uniquement.

-- 1. profils.plan : contrainte de valeurs valides (le défaut 'free' existe déjà depuis 003).
alter table profils
  add constraint profils_plan_check check (plan in ('free', 'pro', 'agency'));

-- 2. sites_generes : ajout du propriétaire, nécessaire pour compter "5 sites/mois par utilisateur".
-- Nullable : les lignes existantes (créées avant cette colonne) n'ont pas de propriétaire connu
-- et resteront invisibles pour tout le monde une fois les policies resserrées ci-dessous
-- (auth.uid() ne peut jamais valoir null), sans backfill destructif.
alter table sites_generes
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists sites_generes_user_idx on sites_generes (user_id, created_at desc);

-- Remplace les policies entièrement publiques par des policies "propriétaire uniquement",
-- cohérent avec simulations_marge (004) et profils (003).
drop policy if exists "allow_select" on sites_generes;
drop policy if exists "allow_insert" on sites_generes;

create policy "select_own" on sites_generes for select using (auth.uid() = user_id);
create policy "insert_own" on sites_generes for insert with check (auth.uid() = user_id);
create policy "delete_own" on sites_generes for delete using (auth.uid() = user_id);

-- 3. Compteur d'usage mensuel générique — réutilisé pour l'audit IA et le site builder.
-- Une ligne par (utilisateur, fonctionnalité, mois) ; "mois" = premier jour du mois (UTC).
create table if not exists usage_mensuel (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  feature     text not null check (feature in ('audit_ia', 'site_builder')),
  mois        date not null,
  compteur    integer not null default 0,
  updated_at  timestamptz default now(),
  unique (user_id, feature, mois)
);

alter table usage_mensuel enable row level security;

create policy "select_own" on usage_mensuel for select using (auth.uid() = user_id);
create policy "insert_own" on usage_mensuel for insert with check (auth.uid() = user_id);
create policy "update_own" on usage_mensuel for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
