-- Autorise "finder_alternatives" comme nouvelle valeur de usage_mensuel.feature, pour le
-- quota mensuel de la fonctionnalité "Alternatives fiables" du finder (voir la route
-- /api/finder/alternatives) — même mécanisme que audit_ia / site_builder (008_plan_limits).
alter table usage_mensuel drop constraint if exists usage_mensuel_feature_check;
alter table usage_mensuel add constraint usage_mensuel_feature_check
  check (feature in ('audit_ia', 'site_builder', 'finder_alternatives'));
