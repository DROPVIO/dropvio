-- 057 — Catalogue des produits gagnants : lecture réservée aux comptes connectés, limite Free
-- appliquée par la base.
--
-- Avant : produits et snapshots_produits avaient une policy allow_select (using true) et la vue
-- produits_dedup, exécutée avec les droits de son propriétaire (pas de security_invoker), était
-- lisible par anon. Tout le catalogue, liens AliExpress compris, était donc lisible sans compte
-- avec la clé anon publique, quel que soit le RLS des tables.
--
-- Après :
-- - aucun accès anon (tables et vue) ;
-- - comptes Pro, Agency, Expert : tout le catalogue ;
-- - comptes Free : 40 produits par niche sur 10 niches (CATALOGUE_FREE dans lib/plan-limits.ts),
--   listés dans catalogue_free et recalculés chaque nuit par /api/cron/snapshot-produits.
--   La limite vaut pour toute lecture avec la session de l'utilisateur (routes serveur comprises),
--   donc rien ne peut la contourner par l'API REST.
-- Le service role (cron, Shopify, routes admin) n'est pas soumis au RLS.

-- ── 1. Plan payant de l'utilisateur connecté ─────────────────────────────────────────────
create or replace function public.a_un_plan_payant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profils
    where id = auth.uid()
      and plan in ('pro', 'agency', 'expert')
  );
$$;

revoke all on function public.a_un_plan_payant() from public, anon;
grant execute on function public.a_un_plan_payant() to authenticated;

-- ── 2. Sélection Free : 10 niches × 40 produits ──────────────────────────────────────────
-- Les 10 niches les plus fournies, et dans chacune les 40 produits dédupliqués (même règle que
-- produits_dedup) qui ont le plus de commandes, au-dessus du plancher de 100 commandes affiché
-- par l'interface (lib/catalogue-commandes.ts). Table et non calcul à la volée : le calcul prend
-- plus d'une seconde, trop pour une règle RLS évaluée à chaque requête.
create table if not exists catalogue_free (
  produit_id text primary key,
  niche text not null
);

alter table catalogue_free enable row level security;
-- Aucune policy : lue seulement par la fonction security definer ci-dessous.

create or replace function public.catalogue_free_rafraichir(p_niches integer default 10, p_par_niche integer default 40)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  delete from catalogue_free;
  insert into catalogue_free (produit_id, niche)
  with dedup as (
    select distinct on (nom, niche) id, niche, commandes
    from produits
    where niche is not null and commandes >= 100
    order by nom, niche, commandes desc nulls last, note desc nulls last
  ), niches as (
    select niche from dedup group by niche order by count(*) desc, niche limit p_niches
  ), classes as (
    select d.id, d.niche,
           row_number() over (partition by d.niche order by d.commandes desc, d.id) as rang
    from dedup d join niches n using (niche)
  )
  select id, niche from classes where rang <= p_par_niche;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.catalogue_free_rafraichir(integer, integer) from public, anon, authenticated;
grant execute on function public.catalogue_free_rafraichir(integer, integer) to service_role;

create or replace function public.produit_catalogue_free(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from catalogue_free where produit_id = p_id);
$$;

revoke all on function public.produit_catalogue_free(text) from public, anon;
grant execute on function public.produit_catalogue_free(text) to authenticated;

select public.catalogue_free_rafraichir();

-- ── 3. Policies du catalogue ─────────────────────────────────────────────────────────────
-- (select …) : le plan n'est évalué qu'une fois par requête, pas pour chaque ligne.
drop policy if exists "allow_select" on produits;
drop policy if exists "select_plan_payant" on produits;
drop policy if exists "select_catalogue" on produits;
create policy "select_catalogue" on produits
  for select to authenticated
  using ((select public.a_un_plan_payant()) or public.produit_catalogue_free(id));

drop policy if exists "allow_select" on snapshots_produits;
drop policy if exists "select_plan_payant" on snapshots_produits;
drop policy if exists "select_catalogue" on snapshots_produits;
create policy "select_catalogue" on snapshots_produits
  for select to authenticated
  using ((select public.a_un_plan_payant()) or public.produit_catalogue_free(product_id));

-- ── 4. Vue produits_dedup : RLS de produits appliqué, plus d'accès anon ──────────────────
alter view public.produits_dedup set (security_invoker = true);
revoke select on public.produits_dedup from anon;

-- ── 5. Plus aucun droit anon sur les tables du catalogue ─────────────────────────────────
revoke all on public.produits from anon;
revoke all on public.snapshots_produits from anon;

-- Fonctions de rotation du catalogue (migration 047, security invoker) : appelées par
-- /api/aliexpress/products avec la session de l'utilisateur, plus jamais en anonyme.
revoke execute on function public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer) from public, anon;
revoke execute on function public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer) from public, anon;
grant execute on function public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer) to authenticated;
grant execute on function public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer) to authenticated;
