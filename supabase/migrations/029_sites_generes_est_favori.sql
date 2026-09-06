-- 029_sites_generes_est_favori.sql
-- Permet de marquer un site comme favori dans "Mes sites" (app/mes-sites/page.tsx) —
-- affiché en premier dans la liste, ordre chronologique conservé au sein de chaque groupe.
-- default false : tous les sites existants et tout insert non modifié restent non-favoris,
-- comportement inchangé pour tout le reste de l'app.
alter table sites_generes
  add column if not exists est_favori boolean not null default false;
