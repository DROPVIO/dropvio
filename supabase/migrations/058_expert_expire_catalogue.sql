-- 058 — Un plan Expert expiré ne donne plus accès au catalogue complet.
--
-- a_un_plan_payant() (migration 057) se fiait à profils.plan = 'expert' même quand aucune
-- période Expert n'était en cours, alors que l'application traite alors le compte comme Free
-- (resolvePlan dans lib/supabase-server.ts, et désormais middleware.ts). Un Expert expiré
-- gardait donc la lecture du catalogue complet par le RLS.
--
-- Après : Pro et Agency comme avant ; Expert seulement avec une période payée en cours
-- (expert_periodes.periode_fin dans le futur). Un Expert expiré retombe sur la sélection Free
-- (catalogue_free), comme tout compte Free.
create or replace function public.a_un_plan_payant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profils p
    where p.id = auth.uid()
      and (
        p.plan in ('pro', 'agency')
        or (
          p.plan = 'expert'
          and exists (
            select 1 from expert_periodes e
            where e.user_id = p.id
              and e.periode_fin > now()
          )
        )
      )
  );
$$;

revoke all on function public.a_un_plan_payant() from public, anon;
grant execute on function public.a_un_plan_payant() to authenticated;
