-- Dans une fonction SECURITY DEFINER, current_user vaut le propriétaire (postgres) : on lit le rôle effectif.
-- 063 — Limite de produits par boutique sans plan « free » : Expert actif illimité, Pro et
-- Agency 200, compte sans plan (ou Expert sans période en cours) 0.

create or replace function public.verifier_limite_produits_boutique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_plan text;
  v_max integer;
  v_nombre integer;
begin
  if coalesce(current_setting('role', true), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  select user_id into v_user_id from boutiques where id = new.boutique_id for update;
  if v_user_id is null then
    return new;
  end if;

  select plan into v_plan from profils where id = v_user_id;
  if v_plan = 'expert' and not exists (
    select 1 from expert_periodes where user_id = v_user_id and periode_fin > now()
  ) then
    v_plan := null;
  end if;

  if v_plan = 'expert' then
    return new;
  end if;

  v_max := case when v_plan in ('pro', 'agency') then 200 else 0 end;

  select count(*) into v_nombre from boutique_produits where boutique_id = new.boutique_id;
  if v_nombre >= v_max then
    raise exception 'limite_produits_boutique: % produits maximum par boutique pour ce plan', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.verifier_limite_produits_boutique() from public, anon, authenticated;
