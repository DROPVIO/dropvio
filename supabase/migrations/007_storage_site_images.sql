insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

-- Lecture publique : les images doivent s'afficher dans les landing pages exportées/publiées.
create policy "Lecture publique site-images"
on storage.objects for select
using (bucket_id = 'site-images');

-- Écriture : passe en pratique par la service role key (route /api/upload-image), qui
-- contourne RLS. Ces policies couvrent aussi un éventuel accès direct côté utilisateur connecté.
create policy "Upload authentifié site-images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'site-images');

create policy "Suppression propriétaire site-images"
on storage.objects for delete
to authenticated
using (bucket_id = 'site-images' and owner = auth.uid());
