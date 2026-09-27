-- 035_sites_generes_html_precedent.sql
-- Permet d'annuler l'application d'un HTML corrigé par l'audit IA sur un site généré
-- (bouton « Appliquer au site » de /audit, bouton « Annuler la dernière correction IA »
-- de /mes-sites). La route PATCH /api/sites-generes/[id] recopie l'ancien html_content
-- ici avant d'écrire le nouveau, en une seule requête serveur — jamais en deux appels
-- depuis le client, pour qu'une interruption ne laisse pas la sauvegarde à moitié faite.
--
-- Nullable et sans valeur par défaut : null = aucune correction IA appliquée depuis la
-- dernière génération, donc rien à annuler (c'est exactement le signal qui conditionne
-- l'affichage du bouton d'annulation). Volontairement un seul niveau d'historique : il
-- s'agit d'annuler la dernière action, pas de versionner les sites.
--
-- Aucune policy à ajouter : sites_generes est déjà restreinte au propriétaire par
-- select_own / insert_own / delete_own (008_plan_limits.sql) et update_own
-- (013_sites_generes_update_policy.sql), qui couvrent cette colonne comme les autres.
alter table sites_generes
  add column if not exists html_content_precedent text;
