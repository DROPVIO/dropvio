-- 023_sites_generes_boutique_id.sql
-- Permet de générer un site (IA ou éditeur de templates) directement lié à une boutique
-- du mode multi-produits, pour savoir de quelle boutique il provient. Nullable : la grande
-- majorité des sites générés ne sont pas rattachés à une boutique. on delete set null (pas
-- cascade) : supprimer une boutique ne doit jamais supprimer les sites déjà générés à partir
-- d'elle, seulement retirer le lien.
alter table sites_generes
  add column if not exists boutique_id uuid references boutiques(id) on delete set null;

create index if not exists sites_generes_boutique_idx on sites_generes(boutique_id);
