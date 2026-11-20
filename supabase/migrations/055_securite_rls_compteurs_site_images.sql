-- 055 — Sécurité RLS : compteurs d'usage en lecture seule pour l'utilisateur, bucket public
-- site-images réservé aux envois du serveur.
--
-- 1. usage_mensuel / usage_ia_journal : les policies insert_own / update_own permettaient à un
--    utilisateur connecté de réécrire ses propres compteurs via l'API REST (clé anon publique)
--    et donc de remettre à zéro son budget IA, son budget images et ses quotas d'audit. Toutes
--    les écritures passent désormais par le service role côté serveur (lib/ai-budget.ts,
--    lib/media/quota-images-serveur.ts, routes audit-site et finder/alternatives) : la lecture
--    reste autorisée, l'écriture ne l'est plus.
-- 2. site-images : voir plus bas.
-- Le catalogue (produits, snapshots_produits, produits_dedup) est traité par la migration 057.
--
-- À appliquer APRÈS le déploiement du code qui écrit les compteurs avec le service role.

-- ── 1. Compteurs d'usage ─────────────────────────────────────────────────────────────────
drop policy if exists "insert_own" on usage_mensuel;
drop policy if exists "update_own" on usage_mensuel;
drop policy if exists "insert_own" on usage_ia_journal;
-- select_own reste en place sur les deux tables.

-- ── 2. Bucket public site-images ─────────────────────────────────────────────────────────
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
