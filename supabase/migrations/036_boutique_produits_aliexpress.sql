-- 036_boutique_produits_aliexpress.sql
-- Fiches boutique importées directement depuis AliExpress, hors catalogue `produits` :
-- source_produit_id reste null pour elles, le lien fournisseur et la variante (SKU) sont donc
-- portés par la fiche elle-même. Une variante AliExpress = une fiche boutique_produits.
-- prix_achat : coût AliExpress (EUR) au moment de l'import, donnée privée du marchand —
-- jamais affichée sur la vitrine. À ne pas confondre avec prix_original, qui est le prix
-- barré public. prix_vente est proposé à prix_achat × COEFFICIENT_MARGE_DEFAUT
-- (lib/calcul-marge.ts), modifiable ensuite.
-- La table `produits` (catalogue partagé) n'est pas modifiée.

alter table boutique_produits
  add column if not exists aliexpress_product_id text,
  add column if not exists aliexpress_sku_id text,
  add column if not exists lien_aliexpress text,
  add column if not exists variante_attributs jsonb default '{}',
  add column if not exists prix_achat numeric;

-- Empêche d'importer deux fois la même variante dans une même boutique.
-- Index NON partiel volontairement : l'import utilise upsert(..., { onConflict, ignoreDuplicates })
-- et PostgREST génère alors un « ON CONFLICT (colonnes) » sans prédicat, que Postgres ne sait
-- pas rattacher à un index partiel (erreur 42P10). Le comportement reste celui d'un index
-- partiel « where aliexpress_product_id is not null » : en Postgres deux NULL ne sont jamais
-- égaux, donc les fiches créées à la main ou depuis le catalogue (aliexpress_product_id null)
-- n'entrent jamais en conflit entre elles. L'import renseigne toujours aliexpress_sku_id (le
-- SKU par défaut à défaut de variantes) pour que la protection joue aussi dans ce cas.
create unique index if not exists boutique_produits_aliexpress_variante_uidx
  on boutique_produits (boutique_id, aliexpress_product_id, aliexpress_sku_id);
