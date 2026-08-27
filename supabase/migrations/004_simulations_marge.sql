create table if not exists simulations_marge (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nom         text not null,
  inputs      jsonb not null,
  resultats   jsonb not null,
  created_at  timestamptz default now()
);

create index if not exists simulations_marge_user_idx on simulations_marge (user_id, created_at desc);

alter table simulations_marge enable row level security;

create policy "select_own" on simulations_marge for select using (auth.uid() = user_id);
create policy "insert_own" on simulations_marge for insert with check (auth.uid() = user_id);
create policy "update_own" on simulations_marge for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on simulations_marge for delete using (auth.uid() = user_id);
