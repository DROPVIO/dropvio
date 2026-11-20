-- 055 — Sécurité RLS : compteurs d'usage en lecture seule pour l'utilisateur, catalogue réservé
-- aux plans payants.
--
-- 1. usage_mensuel / usage_ia_journal : les policies insert_own / update_own permettaient à un
--    utilisateur connecté de réécrire ses propres compteurs via l'API REST (clé anon publique)
--    et donc de remettre à zéro son budget IA, son budget images et ses quotas d'audit. Toutes
--    les écritures passent désormais par le service role côté serveur (lib/ai-budget.ts,
--    lib/media/quota-images-serveur.ts, routes audit-site et finder/alternatives) : la lecture
--    reste autorisée, l'écriture ne l'est plus.
-- 2. produits / snapshots_produits : allow_select (using true) rendait tout le catalogue des
--    produits gagnants lisible par n'importe qui, sans compte, avec la clé anon publique.
--    Lecture réservée aux comptes Pro, Agency et Expert. Les routes serveur qui utilisent le
--    service role (cron, Shopify) ne sont pas concernées par le RLS.
--
-- À appliquer APRÈS le déploiement du code qui écrit les compteurs avec le service role.

-- ── 1. Compteurs d'usage ─────────────────────────────────────────────────────────────────
drop policy if exists "insert_own" on usage_mensuel;
drop policy if exists "update_own" on usage_mensuel;
drop policy if exists "insert_own" on usage_ia_journal;
-- select_own reste en place sur les deux tables.

-- ── 2. Catalogue des produits gagnants ───────────────────────────────────────────────────
create or replace function public.a_un_plan_payant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profils
    where id = auth.uid()
      and plan in ('pro', 'agency', 'expert')
  );
$$;

revoke all on function public.a_un_plan_payant() from public;
grant execute on function public.a_un_plan_payant() to authenticated;

drop policy if exists "allow_select" on produits;
create policy "select_plan_payant" on produits
  for select to authenticated
  using (public.a_un_plan_payant());

drop policy if exists "allow_select" on snapshots_produits;
create policy "select_plan_payant" on snapshots_produits
  for select to authenticated
  using (public.a_un_plan_payant());

-- ── 3. Bucket public site-images ─────────────────────────────────────────────────────────
-- « Upload authentifié site-images » laissait n'importe quel compte connecté déposer n'importe
-- quel fichier (HTML, SVG avec script, exécutable…), de n'importe quelle taille et à n'importe
-- quel chemin, dans un bucket PUBLIC. Tous les envois de l'application passent par le serveur
-- (service role : /api/upload-image, /api/media/[id]/publier, lib/og-cache.ts) : la policy
-- n'est pas utilisée. Le bucket n'accepte plus que des images, 10 Mo maximum.
drop policy if exists "Upload authentifié site-images" on storage.objects;
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    file_size_limit = 10485760
where id = 'site-images';
