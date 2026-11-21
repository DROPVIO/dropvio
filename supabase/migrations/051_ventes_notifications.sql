-- 051_ventes_notifications.sql
-- Page « Mes ventes » (/ventes) et notifications de nouvelle vente.
-- Aucun paiement, aucune commande fournisseur : le marchand commande lui-même sur AliExpress
-- et change le statut à la main.

-- 1. Date du dernier changement de statut, posée par la route /api/ventes (PATCH).
alter table commandes_a_preparer
  add column if not exists statut_change_le timestamptz;

-- 2. Notifications dans l'application. Aucune donnée personnelle : seulement le lien vers la
-- commande. Une seule notification par commande (unique), même si le webhook est rejoué.
create table if not exists notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null default 'vente' check (type in ('vente')),
  commande_id      uuid not null references commandes_a_preparer(id) on delete cascade,
  vue_le           timestamptz,
  email_envoye_le  timestamptz,
  created_at       timestamptz not null default now(),
  unique (commande_id)
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_non_vues_idx on notifications (user_id) where vue_le is null;

-- Même pattern que commandes_a_preparer : RLS activée sans policy, accès par le service role
-- depuis les routes /api/notifications, toujours filtré par user_id.
alter table notifications enable row level security;

-- 3. Création automatique : seulement à l'INSERTION d'une commande « à traiter ». Le webhook et
-- la réconciliation font un upsert (on conflict (user_id, shopify_order_id) do update) : un
-- webhook rejoué met à jour la ligne existante sans déclencher ce trigger, et la contrainte
-- unique couvre tout autre cas.
create or replace function notifier_nouvelle_vente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'a_traiter' then
    insert into notifications (user_id, type, commande_id)
    values (new.user_id, 'vente', new.id)
    on conflict (commande_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function notifier_nouvelle_vente() from public, anon, authenticated;

drop trigger if exists commandes_a_preparer_notifier on commandes_a_preparer;
create trigger commandes_a_preparer_notifier
  after insert on commandes_a_preparer
  for each row execute function notifier_nouvelle_vente();

-- 4. E-mail à chaque nouvelle vente : désactivé par défaut, réglable dans Paramètres.
alter table profils
  add column if not exists notif_email_ventes boolean not null default false;
