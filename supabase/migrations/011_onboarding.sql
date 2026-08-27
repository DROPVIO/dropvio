-- Onboarding interactif (coachmarks) : indique si l'utilisateur a terminé ou
-- passé le tutoriel de première connexion. Se déclenche une seule fois par
-- compte, sauf relance manuelle depuis les paramètres (gérée côté client).
alter table profils
  add column if not exists onboarding_termine boolean not null default false;

-- Les comptes déjà existants avant cette migration ne doivent pas voir
-- apparaître le tutoriel au prochain login : seuls les nouveaux profils
-- (créés après cette migration, avec la valeur par défaut false) le verront.
update profils set onboarding_termine = true where onboarding_termine = false;
