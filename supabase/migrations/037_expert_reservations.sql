-- 037_expert_reservations.sql
-- Remplace le remboursement "par ordre" de 036 par un système de réservation : chaque unité
-- consommée crée une ligne dans expert_generations qui garde sa source exacte (période ou
-- crédit). Le remboursement rend l'unité à cette source, une seule fois, même si la période
-- est terminée entre-temps. Un cron rembourse les réservations bloquées (timeout Vercel).
--
-- À lancer juste après 036, tant que expert_generations est vide (la colonne reussie est supprimée).

-- 1. expert_generations devient la table des réservations.
alter table expert_generations drop column if exists reussie;
alter table expert_generations add column if not exists type text;
alter table expert_generations add column if not exists statut text not null default 'en_cours';
alter table expert_generations add column if not exists source_periode_id uuid references expert_periodes(id);
alter table expert_generations add column if not exists source_credit_id uuid references expert_credits(id);
alter table expert_generations add column if not exists termine_at timestamptz;

alter table expert_generations alter column type set not null;

alter table expert_generations drop constraint if exists expert_generations_type_check;
alter table expert_generations
  add constraint expert_generations_type_check check (type in ('site', 'image', 'video'));

alter table expert_generations drop constraint if exists expert_generations_statut_check;
alter table expert_generations
  add constraint expert_generations_statut_check check (statut in ('en_cours', 'reussie', 'remboursee'));

-- Exactement une source par réservation, conservée après remboursement pour l'historique.
alter table expert_generations drop constraint if exists expert_generations_source_check;
alter table expert_generations
  add constraint expert_generations_source_check check (num_nonnulls(source_periode_id, source_credit_id) = 1);

create index if not exists expert_generations_en_cours_idx
  on expert_generations (created_at) where statut = 'en_cours';

-- 2. Les anciennes fonctions changent de signature : on les supprime.
drop function if exists expert_consommer(uuid, text, text);
drop function if exists expert_rembourser(uuid, text, text);

-- 3. expert_consommer : réserve une unité et renvoie l'id de la réservation, ou null s'il n'y a
-- plus de quota. Ordre de consommation inchangé : quota inclus (modèle du plan), puis crédits du
-- modèle demandé, du plus ancien au plus récent.
create or replace function expert_consommer(p_user_id uuid, p_type text, p_modele text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_periode expert_periodes%rowtype;
  v_credit_id uuid;
  v_reservation_id uuid;
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
    return null;
  end if;

  if p_type = 'site' and v_periode.modele = p_modele and v_periode.sites_utilises < v_periode.sites then
    update expert_periodes set sites_utilises = sites_utilises + 1 where id = v_periode.id;
  elsif p_type = 'image' and coalesce(v_periode.modele_images, p_modele) = p_modele
    and v_periode.images_utilisees < v_periode.images then
    update expert_periodes set images_utilisees = images_utilisees + 1 where id = v_periode.id;
  elsif p_type = 'video' and coalesce(v_periode.modele_videos, p_modele) = p_modele
    and v_periode.videos_utilisees < v_periode.videos then
    update expert_periodes set videos_utilisees = videos_utilisees + 1 where id = v_periode.id;
  else
    select id into v_credit_id
    from expert_credits
    where user_id = p_user_id and type = p_type and modele = p_modele and quantite_utilisee < quantite
    order by created_at, id
    limit 1
    for update;

    if v_credit_id is null then
      return null;
    end if;

    update expert_credits set quantite_utilisee = quantite_utilisee + 1 where id = v_credit_id;
  end if;

  insert into expert_generations (user_id, periode_id, type, modele, statut, source_periode_id, source_credit_id)
  values (
    p_user_id, v_periode.id, p_type, p_modele, 'en_cours',
    case when v_credit_id is null then v_periode.id end,
    v_credit_id
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

-- 4. expert_rembourser : rend l'unité d'une réservation à sa source exacte. Idempotent : ne fait
-- rien (et renvoie false) si la réservation n'est plus 'en_cours'.
create or replace function expert_rembourser(p_reservation_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_gen expert_generations%rowtype;
begin
  select * into v_gen from expert_generations where id = p_reservation_id for update;

  if not found or v_gen.statut <> 'en_cours' then
    return false;
  end if;

  if v_gen.source_periode_id is not null then
    update expert_periodes set
      sites_utilises   = sites_utilises   - case when v_gen.type = 'site'  then 1 else 0 end,
      images_utilisees = images_utilisees - case when v_gen.type = 'image' then 1 else 0 end,
      videos_utilisees = videos_utilisees - case when v_gen.type = 'video' then 1 else 0 end
    where id = v_gen.source_periode_id;
  else
    update expert_credits set quantite_utilisee = quantite_utilisee - 1 where id = v_gen.source_credit_id;
  end if;

  update expert_generations set statut = 'remboursee', termine_at = now() where id = p_reservation_id;
  return true;
end;
$$;

-- 5. expert_finaliser : appelée par la route à la fin de la génération. Enregistre toujours les
-- tokens réels (même si le cron a déjà remboursé), puis valide la réservation en cas de succès
-- ou la rembourse en cas d'échec. Renvoie false si la réservation n'était plus 'en_cours'.
create or replace function expert_finaliser(
  p_reservation_id uuid,
  p_reussie boolean,
  p_tokens_entree integer,
  p_tokens_sortie integer,
  p_cout_usd numeric,
  p_site_id uuid default null
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_statut text;
begin
  update expert_generations
  set tokens_entree = greatest(coalesce(p_tokens_entree, 0), 0),
      tokens_sortie = greatest(coalesce(p_tokens_sortie, 0), 0),
      cout_usd      = coalesce(p_cout_usd, 0),
      site_id       = coalesce(p_site_id, site_id)
  where id = p_reservation_id
  returning statut into v_statut;

  if v_statut is distinct from 'en_cours' then
    return false;
  end if;

  if p_reussie then
    update expert_generations set statut = 'reussie', termine_at = now() where id = p_reservation_id;
    return true;
  end if;

  return expert_rembourser(p_reservation_id);
end;
$$;

-- 6. expert_rembourser_expirees : pour le cron. Rembourse les réservations restées 'en_cours'
-- plus de p_minutes (route coupée par un timeout) et renvoie leur nombre.
create or replace function expert_rembourser_expirees(p_minutes integer default 15)
returns integer
language plpgsql
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from expert_generations
    where statut = 'en_cours' and created_at < now() - make_interval(mins => p_minutes)
    for update skip locked
  loop
    if expert_rembourser(r.id) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- 7. Réservées au service role.
revoke all on function expert_consommer(uuid, text, text) from public, anon, authenticated;
revoke all on function expert_rembourser(uuid) from public, anon, authenticated;
revoke all on function expert_finaliser(uuid, boolean, integer, integer, numeric, uuid) from public, anon, authenticated;
revoke all on function expert_rembourser_expirees(integer) from public, anon, authenticated;

grant execute on function expert_consommer(uuid, text, text) to service_role;
grant execute on function expert_rembourser(uuid) to service_role;
grant execute on function expert_finaliser(uuid, boolean, integer, integer, numeric, uuid) to service_role;
grant execute on function expert_rembourser_expirees(integer) to service_role;
