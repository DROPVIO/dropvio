-- 031_audits_realises_site_id.sql
-- Relie un audit au site généré (sites_generes) qui l'a produit, pour permettre de
-- retrouver "le dernier audit de ce site" et d'appliquer ses corrections dessus (voir
-- app/mes-sites/page.tsx bouton "Auditer" + app/audit/page.tsx ?site=<id>). Nullable :
-- un audit lancé depuis /audit en collant du HTML / une URL / un fichier n'a pas de site
-- associé et reste valide. on delete set null (pas cascade) : supprimer un site ne doit
-- jamais supprimer l'historique d'audit déjà réalisé dessus, seulement retirer le lien.
alter table audits_realises
  add column if not exists site_id uuid references sites_generes(id) on delete set null;

create index if not exists audits_realises_site_idx on audits_realises(site_id);
