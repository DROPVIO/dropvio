-- 037a_usage_mensuel_tokens.sql
-- Consommation de tokens des appels modèle, cumulée par (utilisateur, fonctionnalité, mois)
-- sur la ligne qui porte déjà le compteur d'usage (usage_mensuel, 008_plan_limits.sql).
--
-- Pourquoi sur usage_mensuel plutôt que dans une table de log dédiée : le coût suit la même
-- fenêtre glissante que le quota, et une ligne par génération ferait croître une table sans
-- borne pour une information qui n'est consultée qu'agrégée. Le détail par génération reste
-- possible plus tard sans défaire ceci.
--
-- bigint et non integer : une génération consomme ~13 000 tokens, un plan Agency à 50 sites
-- par mois en cumule ~650 000 — integer tiendrait, mais pas avec une marge confortable si
-- les modifications de site viennent s'y ajouter.
--
-- Écrit par logTokensUsage() (lib/plan-limits.ts), appelé depuis
-- app/api/generate-site/route.ts. Tant que cette migration n'est pas appliquée, cette
-- fonction se contente d'un avertissement dans les logs : la génération continue de
-- fonctionner normalement, seuls les tokens ne sont pas comptés.
--
-- Idempotente (add column if not exists), non destructive, n'invalide aucune donnée
-- existante : les lignes déjà présentes prennent 0 sur les deux colonnes.
--
-- NE TOUCHE PAS au check (feature in (...)) de usage_mensuel : les générations ET les
-- modifications sont comptées sous la valeur 'site_builder', déjà autorisée depuis
-- 008_plan_limits.sql. Aucune nouvelle valeur de feature n'est introduite.
alter table usage_mensuel
  add column if not exists tokens_entree bigint not null default 0,
  add column if not exists tokens_sortie bigint not null default 0;
