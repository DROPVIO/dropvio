-- 044_usage_ia_journal.sql
-- Journal des dépenses IA, une ligne par requête (coût en euros, horodaté). Sert aux limites
-- glissantes sur 24 heures et 7 jours (lib/ai-budget.ts) : usage_mensuel ne garde qu'un cumul
-- par mois, sans heure. Le budget mensuel reste calculé depuis usage_mensuel.
--
-- Tant que cette migration n'est pas appliquée, les limites sur 24 heures et 7 jours ne
-- s'appliquent pas (seul le budget mensuel protège) et un avertissement est journalisé.
--
-- Idempotente : peut être rejouée sans effet de bord.

create table if not exists usage_ia_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fonction text not null,
  cout_eur numeric(12, 6) not null check (cout_eur >= 0),
  created_at timestamptz not null default now()
);

create index if not exists usage_ia_journal_user_date_idx on usage_ia_journal (user_id, created_at desc);

alter table usage_ia_journal enable row level security;

drop policy if exists "select_own" on usage_ia_journal;
drop policy if exists "insert_own" on usage_ia_journal;

create policy "select_own" on usage_ia_journal for select using (auth.uid() = user_id);
create policy "insert_own" on usage_ia_journal for insert with check (auth.uid() = user_id);
