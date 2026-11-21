-- 048_medias_produit.sql
-- Option « Images produits » du Studio IA : une image générée pour un produit de boutique est
-- rattachée à ce produit. Requiert 046_mediatheque.sql. Supprimer le produit garde l'image dans la
-- médiathèque, sans lien.
alter table medias
  add column if not exists boutique_produit_id uuid references boutique_produits(id) on delete set null;

create index if not exists medias_boutique_produit_idx on medias (boutique_produit_id)
  where boutique_produit_id is not null;
