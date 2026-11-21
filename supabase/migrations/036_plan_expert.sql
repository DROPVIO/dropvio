-- 036_plan_expert.sql
-- Plan Expert : l'utilisateur compose son offre (modèle IA, sites, images, vidéos) et ne peut
-- plus rien en retirer pendant la période. Il peut seulement ajouter des crédits payants, sur
-- le modèle de son plan ou sur un autre (ex. crédits Opus 5.5 avec un plan Fable 5).
--
-- usage_mensuel n'est pas réutilisé : il suit le mois calendaire alors qu'une période Expert
-- suit la date d'abonnement, et ses policies laissent chaque utilisateur modifier ses propres
-- lignes. Les compteurs vivent donc ici, écrits uniquement côté serveur.

-- 1. profils : valeur "expert", client Stripe, plan non modifiable par l'utilisateur.
alter table profils drop constraint if exists profils_plan_check;
alter table profils
  add constraint profils_plan_check check (plan in ('free', 'pro', 'agency', 'expert'));

alter table profils add column if not exists stripe_customer_id text unique;

-- La policy update_own de 003_profils.sql ne restreint aucune colonne : sans ce trigger, un
-- utilisateur connecté pourrait s'attribuer un plan payant directement avec la clé anon. Les
-- valeurs envoyées sont ignorées plutôt que refusées, pour ne pas casser les upserts légitimes
-- de profils (nom, préférences, onboarding). Service role et SQL Editor ne sont pas concernés.
create or replace function proteger_facturation_profils()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.stripe_customer_id := null;
  else
    new.plan := old.plan;
    new.stripe_customer_id := old.stripe_customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profils_proteger_facturation on profils;
create trigger profils_proteger_facturation
  before insert or update on profils
  for each row execute function proteger_facturation_profils();

-- 2. expert_periodes : une ligne par période payée, créée par le webhook Stripe après paiement
-- confirmé. Sans ligne couvrant la date du jour, l'utilisateur n'a pas de configuration active.
-- modele_images / modele_videos restent null tant que les fournisseurs ne sont pas choisis.
create table if not exists expert_periodes (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  modele                  text not null check (modele in ('fable-5', 'opus-5-5')),
  modele_images           text,
  modele_videos           text,
  sites                   integer not null default 0 check (sites >= 0),
  images                  integer not null default 0 check (images >= 0),
  videos                  integer not null default 0 check (videos >= 0),
  prix_total_centimes     integer not null check (prix_total_centimes >= 0),
  stripe_subscription_id  text not null,
  -- unique : garde-fou d'idempotence, le webhook Stripe peut être livré plusieurs fois.
  stripe_invoice_id       text not null unique,
  periode_debut           timestamptz not null,
  periode_fin             timestamptz not null,
  sites_utilises          integer not null default 0 check (sites_utilises >= 0),
  images_utilisees        integer not null default 0 check (images_utilisees >= 0),
  videos_utilisees        integer not null default 0 check (videos_utilisees >= 0),
  created_at              timestamptz not null default now(),
  check (periode_fin > periode_debut),
  unique (user_id, periode_debut)
);

create index if not exists expert_periodes_user_fin_idx on expert_periodes (user_id, periode_fin desc);

-- Configuration figée : seuls les compteurs de consommation peuvent changer, même via le
-- service role. Un changement de configuration passe par la période suivante.
create or replace function figer_config_expert()
returns trigger
language plpgsql
as $$
begin
  if (new.user_id, new.modele, new.modele_images, new.modele_videos, new.sites, new.images, new.videos,
      new.prix_total_centimes, new.stripe_subscription_id, new.stripe_invoice_id, new.periode_debut, new.periode_fin)
     is distinct from
     (old.user_id, old.modele, old.modele_images, old.modele_videos, old.sites, old.images, old.videos,
      old.prix_total_centimes, old.stripe_subscription_id, old.stripe_invoice_id, old.periode_debut, old.periode_fin)
  then
    raise exception 'La configuration Expert d''une période ne peut pas être modifiée.';
  end if;
  return new;
end;
$$;

drop trigger if exists expert_periodes_figer_config on expert_periodes;
create trigger expert_periodes_figer_config
  before update on expert_periodes
  for each row execute function figer_config_expert();

-- 3. expert_config_suivante : configuration programmée pour le prochain renouvellement. Sans
-- ligne, la configuration en cours est reconduite.
create table if not exists expert_config_suivante (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  modele         text not null check (modele in ('fable-5', 'opus-5-5')),
  modele_images  text,
  modele_videos  text,
  sites          integer not null default 0 check (sites >= 0),
  images         integer not null default 0 check (images >= 0),
  videos         integer not null default 0 check (videos >= 0),
  updated_at     timestamptz not null default now()
);

-- 4. expert_credits : recharges payantes, une ligne par couple (type, modèle) acheté. Le modèle
-- peut différer de celui du plan. periode_id indique la période d'achat : les crédits non
-- utilisés sont reportés d'une période à l'autre, tant que l'utilisateur a une période active.
create table if not exists expert_credits (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  periode_id                  uuid not null references expert_periodes(id) on delete restrict,
  type                        text not null check (type in ('site', 'image', 'video')),
  modele                      text not null,
  quantite                    integer not null check (quantite > 0),
  quantite_utilisee           integer not null default 0,
  prix_paye_centimes          integer not null check (prix_paye_centimes >= 0),
  stripe_checkout_session_id  text not null,
  stripe_payment_intent_id    text,
  created_at                  timestamptz not null default now(),
  check (type <> 'site' or modele in ('fable-5', 'opus-5-5')),
  check (quantite_utilisee between 0 and quantite),
  -- unique : même garde-fou d'idempotence que stripe_invoice_id ci-dessus.
  unique (stripe_checkout_session_id, type, modele)
);

create index if not exists expert_credits_user_idx on expert_credits (user_id, type, modele);

-- 5. expert_generations : coût réel de chaque génération, pour le comparer au prix facturé.
-- Les échecs y figurent (reussie = false) : ils ne consomment pas de quota mais coûtent des
-- tokens. cout_usd est figé à la génération pour rester juste si les tarifs changent.
create table if not exists expert_generations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  periode_id     uuid not null references expert_periodes(id) on delete cascade,
  site_id        uuid references sites_generes(id) on delete set null,
  modele         text not null,
  tokens_entree  integer not null default 0 check (tokens_entree >= 0),
  tokens_sortie  integer not null default 0 check (tokens_sortie >= 0),
  cout_usd       numeric(12, 6) not null default 0,
  reussie        boolean not null,
  created_at     timestamptz not null default now()
);

create index if not exists expert_generations_periode_idx on expert_generations (periode_id, created_at);

-- 6. RLS : lecture de ses propres lignes uniquement. Aucune policy insert/update/delete :
-- l'écriture ne passe que par le service role, comme formation_achats (020).
alter table expert_periodes enable row level security;
alter table expert_config_suivante enable row level security;
alter table expert_credits enable row level security;
alter table expert_generations enable row level security;

drop policy if exists "select_own" on expert_periodes;
drop policy if exists "select_own" on expert_config_suivante;
drop policy if exists "select_own" on expert_credits;
drop policy if exists "select_own" on expert_generations;

create policy "select_own" on expert_periodes for select using (auth.uid() = user_id);
create policy "select_own" on expert_config_suivante for select using (auth.uid() = user_id);
create policy "select_own" on expert_credits for select using (auth.uid() = user_id);
create policy "select_own" on expert_generations for select using (auth.uid() = user_id);

-- 7. expert_consommer : consomme une unité si elle est disponible et renvoie false sinon. Le
-- quota inclus ne vaut que pour le modèle du plan, puis les crédits du modèle demandé, toutes
-- périodes d'achat confondues, sont utilisés du plus ancien au plus récent. Le verrou sur la
-- période sérialise les générations simultanées d'un même utilisateur, contrairement à
-- incrementMonthlyUsage.
create or replace function expert_consommer(p_user_id uuid, p_type text, p_modele text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_periode expert_periodes%rowtype;
  v_credit_id uuid;
begin
  if p_type not in ('site', 'image', 'video') then
    raise exception 'Type de consommation inconnu : %', p_type;
  end if;

  select * into v_periode
  from expert_periodes
  where user_id = p_user_id and now() >= periode_debut and now() < periode_fin
  order by periode_debut desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if p_type = 'site' and v_periode.modele = p_modele and v_periode.sites_utilises < v_periode.sites then
    update expert_periodes set sites_utilises = sites_utilises + 1 where id = v_periode.id;
    return true;
  elsif p_type = 'image' and coalesce(v_periode.modele_images, p_modele) = p_modele
    and v_periode.images_utilisees < v_periode.images then
    update expert_periodes set images_utilisees = images_utilisees + 1 where id = v_periode.id;
    return true;
  elsif p_type = 'video' and coalesce(v_periode.modele_videos, p_modele) = p_modele
    and v_periode.videos_utilisees < v_periode.videos then
    update expert_periodes set videos_utilisees = videos_utilisees + 1 where id = v_periode.id;
    return true;
  end if;

  select id into v_credit_id
  from expert_credits
  where user_id = p_user_id and type = p_type and modele = p_modele and quantite_utilisee < quantite
  order by created_at, id
  limit 1;

  if v_credit_id is null then
    return false;
  end if;

  update expert_credits set quantite_utilisee = quantite_utilisee + 1 where id = v_credit_id;
  return true;
end;
$$;

revoke all on function expert_consommer(uuid, text, text) from public, anon, authenticated;
grant execute on function expert_consommer(uuid, text, text) to service_role;

-- 8. expert_rembourser : rend une unité quand une génération échoue après avoir consommé la
-- sienne, et renvoie false s'il n'y a rien à rendre. La période en cours passe d'abord, si
-- le modèle est celui du plan, puis le crédit le plus récent déjà utilisé de ce modèle.
create or replace function expert_rembourser(p_user_id uuid, p_type text, p_modele text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_periode expert_periodes%rowtype;
  v_credit_id uuid;
begin
  if p_type not in ('site', 'image', 'video') then
    raise exception 'Type de consommation inconnu : %', p_type;
  end if;

  select * into v_periode
  from expert_periodes
  where user_id = p_user_id and now() >= periode_debut and now() < periode_fin
  order by periode_debut desc
  limit 1
  for update;

  if found then
    if p_type = 'site' and v_periode.modele = p_modele and v_periode.sites_utilises > 0 then
      update expert_periodes set sites_utilises = sites_utilises - 1 where id = v_periode.id;
      return true;
    elsif p_type = 'image' and coalesce(v_periode.modele_images, p_modele) = p_modele
      and v_periode.images_utilisees > 0 then
      update expert_periodes set images_utilisees = images_utilisees - 1 where id = v_periode.id;
      return true;
    elsif p_type = 'video' and coalesce(v_periode.modele_videos, p_modele) = p_modele
      and v_periode.videos_utilisees > 0 then
      update expert_periodes set videos_utilisees = videos_utilisees - 1 where id = v_periode.id;
      return true;
    end if;
  end if;

  select id into v_credit_id
  from expert_credits
  where user_id = p_user_id and type = p_type and modele = p_modele and quantite_utilisee > 0
  order by created_at desc, id desc
  limit 1
  for update;

  if v_credit_id is null then
    return false;
  end if;

  update expert_credits set quantite_utilisee = quantite_utilisee - 1 where id = v_credit_id;
  return true;
end;
$$;

revoke all on function expert_rembourser(uuid, text, text) from public, anon, authenticated;
grant execute on function expert_rembourser(uuid, text, text) to service_role;
