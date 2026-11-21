-- 040_sites_generes_pages.sql
-- Pages d'un site boutique multi-pages : objet JSON clé → HTML standalone, par exemple
-- {"accueil": "<!DOCTYPE html>…", "catalogue": "…", "collection-lampes": "…"}. Clés limitées
-- à [a-z0-9-] (voir lib/site-builder-pages.ts) ; la clé « accueil » est servie sous le nom de
-- fichier index.html, les autres sous <clé>.html.
--
-- html_content ne change pas : il reste obligatoire et contient la page d'accueil. Toutes les
-- fonctions existantes (aperçu, téléchargement, conversion Liquid, push Shopify, régénération)
-- continuent de ne lire que lui. pages est un complément, lu seulement par ce qui sait gérer
-- plusieurs pages.
--
-- Nullable et sans défaut : null signifie « site d'une seule page », ce qui est le cas de
-- tous les sites existants et des sites produit unique. Aucun remplissage rétroactif.
--
-- Pas de contrainte check sur la forme du JSON : la validation se fait côté application
-- (app/api/sites-generes/route.ts), comme pour format_export (039).
--
-- Rejouable (add column if not exists). Rien n'est supprimé ni modifié sur les autres colonnes.

alter table sites_generes add column if not exists pages jsonb;
