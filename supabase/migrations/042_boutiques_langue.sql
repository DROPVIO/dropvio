-- 042_boutiques_langue.sql
-- Langue d'une boutique, choisie par le vendeur dans ses réglages : elle fixe la langue des
-- pages publiques (/boutiques/[slug]/**), de leurs métadonnées pour Google et du contenu des
-- sites générés depuis la boutique, quelle que soit la langue du visiteur.
-- Valeurs = langues de l'app (lib/locale.ts). fr par défaut : les boutiques existantes,
-- toutes rédigées en français jusqu'ici, ne changent pas.
--
-- Tant que cette migration n'est pas appliquée, le code lit « fr » (repli sur le code
-- PostgreSQL 42703 undefined_column) et le choix de langue est refusé avec un message.
alter table boutiques
  add column if not exists langue text not null default 'fr'
  constraint boutiques_langue_check check (langue in ('fr', 'en', 'es', 'it'));
