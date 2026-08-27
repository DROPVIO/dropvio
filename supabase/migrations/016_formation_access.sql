-- 016_formation_access.sql
-- Formation écrite dropshipping : passe en add-on payant (+10€/mois), réservé aux plans
-- Pro et Agency. formation_active = l'add-on a été souscrit (indépendant du plan lui-même :
-- être Pro/Agency est nécessaire mais pas suffisant, il faut aussi avoir payé l'add-on).
-- Activation pour l'instant manuelle (scripts/toggle-formation.ts) en attendant Stripe —
-- voir lib/formation.ts pour le point d'intégration explicite.
alter table profils
  add column if not exists formation_active boolean not null default false;
