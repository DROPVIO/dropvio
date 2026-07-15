create table if not exists sites_generes (
  id           uuid primary key default gen_random_uuid(),
  nom_produit  text not null,
  html_content text not null,
  created_at   timestamptz default now()
);

alter table sites_generes enable row level security;

create policy "allow_select" on sites_generes for select using (true);
create policy "allow_insert" on sites_generes for insert with check (true);
