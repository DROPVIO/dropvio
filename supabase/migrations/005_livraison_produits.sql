alter table produits
  add column if not exists "livraisonFrUe" boolean not null default false;

create index if not exists produits_livraison_idx on produits ("livraisonFrUe");
