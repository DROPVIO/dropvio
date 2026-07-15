create table if not exists profils (
  id           uuid primary key references auth.users(id) on delete cascade,
  nom_complet  text,
  plan         text not null default 'free',
  created_at   timestamptz default now()
);

alter table profils enable row level security;

create policy "select_own" on profils for select using (auth.uid() = id);
create policy "insert_own" on profils for insert with check (auth.uid() = id);
create policy "update_own" on profils for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "delete_own" on profils for delete using (auth.uid() = id);
