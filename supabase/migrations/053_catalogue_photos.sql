-- 053_catalogue_photos.sql — PROPOSITION, À VALIDER AVANT APPLICATION (nouvelle table).
--
-- Photos choisies par un utilisateur pour un produit du catalogue commun (produits). Le
-- catalogue est partagé et non modifiable par les utilisateurs (migration 010) : le choix est
-- donc enregistré par utilisateur, ici, jamais dans produits. Une ligne par photo ; position 0 =
-- photo principale, les suivantes = galerie, dans l'ordre.
--
-- Utilisée par /api/catalogue/[id]/photos et par la liste /api/catalogue. Tant que la table
-- n'existe pas, la section « Photos » de la fiche Catalogue l'indique et n'enregistre rien.
create table if not exists catalogue_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  produit_id  text not null references produits(id) on delete cascade,
  url         text not null,
  position    integer not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  unique (user_id, produit_id, position)
);

create index if not exists catalogue_photos_user_produit_idx on catalogue_photos (user_id, produit_id, position);

alter table catalogue_photos enable row level security;

drop policy if exists "select_own" on catalogue_photos;
drop policy if exists "insert_own" on catalogue_photos;
drop policy if exists "update_own" on catalogue_photos;
drop policy if exists "delete_own" on catalogue_photos;

create policy "select_own" on catalogue_photos for select using (auth.uid() = user_id);
create policy "insert_own" on catalogue_photos for insert with check (auth.uid() = user_id);
create policy "update_own" on catalogue_photos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on catalogue_photos for delete using (auth.uid() = user_id);
