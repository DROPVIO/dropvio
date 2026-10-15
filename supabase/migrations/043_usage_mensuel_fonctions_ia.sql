-- 043_usage_mensuel_fonctions_ia.sql
-- Budget IA mensuel par plan (lib/ai-budget.ts) : le coût du mois est calculé à partir des
-- tokens enregistrés dans usage_mensuel, fonction par fonction, au prix du modèle de chaque
-- fonction. Trois fonctions IA n'avaient pas encore de valeur autorisée dans la contrainte :
--   - inspiration_ia : analyse de captures d'inspiration (claude-sonnet-4-6), jusqu'ici
--     comptée sous site_builder, donc au prix d'un autre modèle ;
--   - boutique_ia : tri des collections, réécriture des produits, ajustement des prix
--     (claude-opus-5-5) ;
--   - textes_ia : texte d'un produit et contenu de boutique (claude-haiku-4-5).
--
-- Tant que cette migration n'est pas appliquée, lib/ai-budget.ts enregistre ces tokens sous
-- audit_ia, convertis pour garder le même coût : le budget reste juste, seule la répartition
-- par fonction est faussée.
--
-- Idempotente : peut être rejouée sans effet de bord.

alter table usage_mensuel drop constraint if exists usage_mensuel_feature_check;
alter table usage_mensuel add constraint usage_mensuel_feature_check
  check (feature in ('audit_ia', 'site_builder', 'finder_alternatives', 'inspiration_ia', 'boutique_ia', 'textes_ia'));
