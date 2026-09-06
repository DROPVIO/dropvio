-- 028_sites_generes_is_trace.sql
-- Distingue les vraies lignes de génération (Site Builder mono-page) des lignes de trace
-- créées pour le flux "Préparer ma boutique" (app/api/boutiques/[id]/route.ts, PATCH) —
-- un simple repère d'activité pour "Mes sites", sans contenu réel (voir 023 pour boutique_id).
-- Sans cette colonne, les requêtes de comptage de sitesParMoisMax (qui comptent toutes les
-- lignes sites_generes du mois, voir app/api/generate-site/route.ts et
-- app/api/sites-generes/route.ts) décompteraient à tort ces traces du quota mono-page.
-- default false : toutes les lignes existantes et tous les inserts non modifiés restent de
-- vraies générations, comportement inchangé pour tout le reste de l'app.
alter table sites_generes
  add column if not exists is_trace boolean not null default false;
