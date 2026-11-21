-- 038_storage_inspiration.sql
-- Bucket PRIVÉ pour les screenshots d'inspiration uploadés par l'utilisateur (1 à 3 par
-- génération), destinés au seul appel vision qui en extrait des tokens de style.
--
-- Pourquoi un nouveau bucket et pas site-images : site-images est public
-- (007_storage_site_images.sql, `public = true` + policy "Lecture publique"), ce qui est
-- voulu là-bas — les images doivent s'afficher dans les landing pages exportées. Y déposer
-- des captures d'écran les rendrait lisibles par simple URL, sans authentification. Les
-- inspirations n'ont aucune raison d'être servies publiquement : elles ne sortent jamais du
-- serveur autrement qu'en base64 vers l'API Anthropic.
--
-- public = false a une conséquence à connaître : getPublicUrl() ne renvoie plus rien
-- d'exploitable sur ce bucket. La lecture se fait côté serveur (download + base64) ou par
-- URL signée.
--
-- Idempotence : le insert est protégé par on conflict do nothing, mais `create policy` ne
-- l'est pas — d'où le `drop policy if exists` qui le précède. Cette migration est donc
-- rejouable sans erreur, ce qui compte ici : elle est appliquée à la main dans le SQL
-- Editor, où une exécution partielle est vite arrivée.
--
-- Rien n'est supprimé : site-images et ses policies ne sont pas touchés.

insert into storage.buckets (id, name, public)
values ('inspiration', 'inspiration', false)
on conflict (id) do nothing;

-- Lecture : le propriétaire du fichier, et lui seul. Aucune policy de lecture publique,
-- contrairement à site-images.
drop policy if exists "Lecture propriétaire inspiration" on storage.objects;
create policy "Lecture propriétaire inspiration"
on storage.objects for select
to authenticated
using (bucket_id = 'inspiration' and owner = auth.uid());

-- Écriture : l'utilisateur connecté, pour lui-même. storage.objects.owner est renseigné
-- automatiquement par Storage à partir du JWT, donc le with check suffit à empêcher un
-- upload au nom d'un autre compte.
drop policy if exists "Upload propriétaire inspiration" on storage.objects;
create policy "Upload propriétaire inspiration"
on storage.objects for insert
to authenticated
with check (bucket_id = 'inspiration' and owner = auth.uid());

-- Mise à jour : nécessaire pour un upsert (réupload du même slot d'inspiration), que
-- Storage traduit en update et non en insert.
drop policy if exists "Mise à jour propriétaire inspiration" on storage.objects;
create policy "Mise à jour propriétaire inspiration"
on storage.objects for update
to authenticated
using (bucket_id = 'inspiration' and owner = auth.uid())
with check (bucket_id = 'inspiration' and owner = auth.uid());

drop policy if exists "Suppression propriétaire inspiration" on storage.objects;
create policy "Suppression propriétaire inspiration"
on storage.objects for delete
to authenticated
using (bucket_id = 'inspiration' and owner = auth.uid());
