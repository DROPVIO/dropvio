-- 012_boutiques.sql
-- Ajoute les tables boutiques, boutique_categories et boutique_produits
-- pour le mode boutique multi-produits.

create table if not exists boutiques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nom text not null,
  slug text not null unique,
  description text,
  theme text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boutiques_user_idx on boutiques(user_id);
create index if not exists boutiques_slug_idx on boutiques(slug);

create table if not exists boutique_categories (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references boutiques(id) on delete cascade,
  nom text not null,
  slug text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boutique_categories_boutique_idx on boutique_categories(boutique_id);
create index if not exists boutique_categories_slug_idx on boutique_categories(slug);

create table if not exists boutique_produits (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references boutiques(id) on delete cascade,
  category_id uuid references boutique_categories(id),
  source_produit_id text references produits(id),
  nom text not null,
  slug text not null,
  description text,
  image_urls jsonb not null default '[]',
  prix_vente numeric not null default 0,
  prix_original numeric,
  stock integer not null default 0,
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock', 'out_of_stock', 'preorder')),
  position integer not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boutique_produits_boutique_idx on boutique_produits(boutique_id);
create index if not exists boutique_produits_slug_idx on boutique_produits(slug);
create index if not exists boutique_produits_category_idx on boutique_produits(category_id);

-- RLS pour boutiques
alter table boutiques enable row level security;

drop policy if exists "select_own" on boutiques;
drop policy if exists "insert_own" on boutiques;
drop policy if exists "update_own" on boutiques;
drop policy if exists "delete_own" on boutiques;

create policy "select_own" on boutiques for select using (auth.uid() = user_id);
create policy "insert_own" on boutiques for insert with check (auth.uid() = user_id);
create policy "update_own" on boutiques for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on boutiques for delete using (auth.uid() = user_id);

-- RLS pour boutique_categories
alter table boutique_categories enable row level security;

drop policy if exists "select_own" on boutique_categories;
drop policy if exists "insert_own" on boutique_categories;
drop policy if exists "update_own" on boutique_categories;
drop policy if exists "delete_own" on boutique_categories;

create policy "select_own" on boutique_categories for select using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_categories.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
create policy "insert_own" on boutique_categories for insert with check (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_categories.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
create policy "update_own" on boutique_categories for update using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_categories.boutique_id
      and boutiques.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_categories.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
create policy "delete_own" on boutique_categories for delete using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_categories.boutique_id
      and boutiques.user_id = auth.uid()
  )
);

-- RLS pour boutique_produits
alter table boutique_produits enable row level security;

drop policy if exists "select_own" on boutique_produits;
drop policy if exists "insert_own" on boutique_produits;
drop policy if exists "update_own" on boutique_produits;
drop policy if exists "delete_own" on boutique_produits;

create policy "select_own" on boutique_produits for select using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_produits.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
create policy "insert_own" on boutique_produits for insert with check (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_produits.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
create policy "update_own" on boutique_produits for update using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_produits.boutique_id
      and boutiques.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_produits.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
create policy "delete_own" on boutique_produits for delete using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_produits.boutique_id
      and boutiques.user_id = auth.uid()
  )
);
