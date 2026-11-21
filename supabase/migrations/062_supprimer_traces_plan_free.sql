-- 062 — Suppression des dernières traces du plan « free » : protection des colonnes de
-- facturation (plan null à la création), catalogue réservé aux plans payants, sélection
-- catalogue_free supprimée.

create or replace function public.proteger_colonnes_facturation()
returns trigger
language plpgsql
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := null;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.abonnement_statut := null;
      new.essai_fin := null;
      new.periode_fin := null;
      new.essai_utilise := false;
    else
      new.plan := old.plan;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.abonnement_statut := old.abonnement_statut;
      new.essai_fin := old.essai_fin;
      new.periode_fin := old.periode_fin;
      new.essai_utilise := old.essai_utilise;
    end if;
  end if;
  return new;
end;
$function$;

drop function if exists public.proteger_facturation_profils();

drop policy if exists "select_catalogue" on produits;
create policy "select_catalogue" on produits
  for select to authenticated
  using ((select public.a_un_plan_payant()));

drop policy if exists "select_catalogue" on snapshots_produits;
create policy "select_catalogue" on snapshots_produits
  for select to authenticated
  using ((select public.a_un_plan_payant()));

drop function if exists public.produit_catalogue_free(text);
drop function if exists public.catalogue_free_rafraichir(integer, integer);
drop table if exists public.catalogue_free;
