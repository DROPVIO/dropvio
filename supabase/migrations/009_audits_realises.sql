create table if not exists audits_realises (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  url_ou_nom_site   text not null,
  score_total       integer not null,
  categories        jsonb not null,
  created_at        timestamptz default now()
);

create index if not exists audits_realises_user_idx on audits_realises (user_id, created_at desc);

alter table audits_realises enable row level security;

create policy "select_own" on audits_realises for select using (auth.uid() = user_id);
create policy "insert_own" on audits_realises for insert with check (auth.uid() = user_id);
create policy "delete_own" on audits_realises for delete using (auth.uid() = user_id);
