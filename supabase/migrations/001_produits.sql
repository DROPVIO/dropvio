create table if not exists produits (
  id               text primary key,
  nom              text not null,
  image            text,
  "prixFournisseur" numeric,
  "prixVente"       numeric,
  marge            integer,
  commandes        integer,
  note             numeric,
  commission       text,
  "lienAliExpress"  text,
  niche            text,
  created_at       timestamptz default now()
);

create index if not exists produits_niche_idx       on produits (niche);
create index if not exists produits_niche_prix_idx  on produits (niche, "prixVente");

alter table produits enable row level security;

create policy "allow_select" on produits for select using (true);
create policy "allow_insert" on produits for insert with check (true);
create policy "allow_update" on produits for update using (true) with check (true);
