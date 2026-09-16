-- 034_profils_preferences.sql
-- La section "Préférences" de ParametresModal.tsx (langue, notifications email/push)
-- affichait un faux succès sans jamais rien persister — corrigé pour écrire réellement dans
-- profils, sur le même modèle que nom_complet (upsert direct depuis le client, RLS déjà en
-- place sur profils, voir 003_profils.sql).

alter table profils
  add column if not exists langue text not null default 'fr',
  add column if not exists notif_email boolean not null default true,
  add column if not exists notif_push boolean not null default false;
