-- 046_mediatheque.sql
-- Médiathèque du Studio IA : une ligne par fichier généré ou importé. Les originaux restent
-- dans un bucket privé ; une image utilisée en boutique est copiée à la demande dans le bucket
-- public site-images (url_publique), sans rendre le reste de la médiathèque accessible.

-- 1. medias : écriture réservée au serveur, comme les tables Expert.
create table if not exists medias (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('image', 'video')),
  origine        text not null check (origine in ('generation', 'import')),
  prompt         text,
  modele         text,
  format         text check (format in ('carre', 'portrait', 'paysage')),
  taille_octets  bigint not null check (taille_octets >= 0),
  mime           text not null,
  chemin         text not null unique,
  url_publique   text,
  chemin_public  text,
  generation_id  uuid references expert_generations(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists medias_user_created_idx on medias (user_id, created_at desc);

alter table medias enable row level security;

drop policy if exists "select_own" on medias;
create policy "select_own" on medias for select using (auth.uid() = user_id);

-- 2. Bucket privé. Taille et types sont imposés par Supabase, y compris pour l'envoi direct
-- depuis le navigateur (une route Vercel refuserait les fichiers au-delà de 4,5 Mo environ).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mediatheque', 'mediatheque', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture limitée au dossier de l'utilisateur. Aucune policy d'écriture : les envois passent
-- par une URL signée créée côté serveur, les suppressions par le service role.
drop policy if exists "Lecture propriétaire mediatheque" on storage.objects;
create policy "Lecture propriétaire mediatheque" on storage.objects
  for select to authenticated
  using (bucket_id = 'mediatheque' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Espace utilisé, calculé en base : une lecture côté serveur serait tronquée à 1 000 lignes.
create or replace function medias_octets_utilises(p_user_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(sum(taille_octets), 0)::bigint from medias where user_id = p_user_id;
$$;

revoke all on function medias_octets_utilises(uuid) from public, anon, authenticated;
grant execute on function medias_octets_utilises(uuid) to service_role;
