create table if not exists snapshots_produits (
  id                uuid primary key default gen_random_uuid(),
  product_id        text not null references produits(id) on delete cascade,
  prix              numeric,
  volume_commandes  integer,
  date              date not null default current_date,
  created_at        timestamptz default now(),
  unique (product_id, date)
);

create index if not exists snapshots_produits_product_date_idx on snapshots_produits (product_id, date desc);

alter table snapshots_produits enable row level security;

-- Lecture publique (comme "produits") pour afficher le score de croissance côté client.
-- Les écritures passent uniquement par la route cron via la service role key, qui contourne RLS.
create policy "allow_select" on snapshots_produits for select using (true);
