-- 025_boutiques_mentions_legales.sql
-- Nouveau champ pour le contenu de la page "Mentions légales" de chaque boutique
-- publique (app/boutiques/[slug]/mentions-legales/page.tsx). Colonne dédiée plutôt
-- que le settings jsonb générique, cohérente avec nom/description/theme déjà en
-- colonnes propres sur boutiques (voir 012_boutiques.sql). Nullable : une boutique
-- sans mentions légales renseignées affiche un état vide sur la page publique.
alter table boutiques add column if not exists mentions_legales text;
