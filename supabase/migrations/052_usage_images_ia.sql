-- 052_usage_images_ia.sql
-- Génération d'images pour les plans Pro et Agency : chaque image est comptée dans
-- usage_mensuel (feature 'images_ia', compteur = nombre d'images du mois) et décomptée du budget
-- IA mensuel au prix IMAGE_PRICE_EUR (lib/ai-budget.ts). Aucune nouvelle table : seule la
-- contrainte des fonctions acceptées change (même procédé que 043).
--
-- Tant que cette migration n'est pas appliquée, la génération d'images reste refusée aux plans
-- Pro et Agency (code images_migration_requise) : jamais d'image sans décompte.
alter table usage_mensuel drop constraint if exists usage_mensuel_feature_check;
alter table usage_mensuel add constraint usage_mensuel_feature_check
  check (feature in ('audit_ia', 'site_builder', 'finder_alternatives', 'inspiration_ia', 'boutique_ia', 'textes_ia', 'images_ia'));
