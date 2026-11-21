-- Dans une fonction SECURITY DEFINER, current_user vaut le propriétaire (postgres) : on lit le rôle effectif.
-- 059 — Limite de produits par boutique appliquée par la base.
--
-- La limite du plan (PLAN_LIMITS.produitsBoutiqueMax dans lib/plan-limits.ts) n'était vérifiée
-- que par la route POST /api/boutiques/[id]/produits. Avec la policy insert_own, un utilisateur
-- pouvait ajouter des produits directement par l'API REST (clé anon + sa session) au-delà de
-- cette limite. Ce trigger refuse l'ajout quel que soit le chemin.
--
-- Limites, à garder identiques à lib/plan-limits.ts :
--   free 0 · pro 200 · agency 200 · expert illimité (seulement avec une période en cours ;
--   un Expert expiré est traité comme Free, comme dans l'application).
-- Comme le trigger proteger_colonnes_facturation, il ne s'applique qu'aux rôles anon et
-- authenticated : les opérations du service role (serveur, maintenance) ne sont pas bloquées.
-- La ligne de la boutique est verrouillée pendant le contrôle : deux ajouts simultanés ne
-- peuvent pas dépasser la limite ensemble.

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
    return new; -- boutique inexistante : la clé étrangère refusera l'ajout
  end if;

  select plan into v_plan from profils where id = v_user_id;
  if v_plan = 'expert' and not exists (
    select 1 from expert_periodes where user_id = v_user_id and periode_fin > now()
  ) then
    v_plan := 'free';
  end if;

  v_max := case coalesce(v_plan, 'free')
    when 'pro' then 200
    when 'agency' then 200
    when 'expert' then null
    else 0
  end;

  if v_max is null then
    return new;
  end if;

  select count(*) into v_nombre from boutique_produits where boutique_id = new.boutique_id;
  if v_nombre >= v_max then
    raise exception 'limite_produits_boutique: % produits maximum par boutique pour ce plan', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.verifier_limite_produits_boutique() from public, anon, authenticated;

drop trigger if exists boutique_produits_limite_plan on boutique_produits;
create trigger boutique_produits_limite_plan
  before insert on boutique_produits
  for each row execute function public.verifier_limite_produits_boutique();
