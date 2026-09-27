-- 032_sites_generes_regeneration_fields.sql
-- Ajoute les champs nécessaires pour pré-remplir le Site Builder lors d'une régénération
-- (bouton "Regénérer", voir app/mes-sites/page.tsx) — aujourd'hui seuls nom_produit et
-- html_content sont conservés, tout le reste du prompt de génération initiale (description,
-- image, prix, style, couleurs, lien AliExpress source) est perdu après coup. Tous nullable :
-- rétrocompatible avec l'existant, et les sites issus de TemplateEditor.tsx (mode "Éditeur de
-- templates") ou du mode boutique continuent de n'écrire aucun de ces champs — leur
-- description restant null sert justement de signal pour ne proposer le pré-remplissage
-- que sur les sites générés en mode mono-page IA (voir app/site-builder/page.tsx).
alter table sites_generes
  add column if not exists description      text,
  add column if not exists lien_aliexpress   text,
  add column if not exists image_url         text,
  add column if not exists prix_vente        numeric(10,2),
  add column if not exists prix_original     numeric(10,2),
  add column if not exists style_id          text,
  add column if not exists couleur_primary   text,
  add column if not exists couleur_secondary text,
  add column if not exists couleur_accent    text;
