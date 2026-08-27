-- 022_profils_auto_creation.sql
-- Aucun trigger sur auth.users ne crée la ligne profils correspondante : vérifié
-- empiriquement (auth.admin.createUser() puis lecture de profils = aucune ligne créée),
-- et absent de tout l'historique supabase/migrations/. Jusqu'ici, app/dashboard/page.tsx
-- lit profils avec .maybeSingle() et traite l'absence de ligne comme "onboarding non
-- terminé" (silencieux), mais tout le reste qui dépend de profils.plan (008_plan_limits,
-- quotas usage_mensuel) se retrouve sans valeur par défaut tant que la ligne n'existe pas.
-- Ce trigger comble ce trou à la source, pour tout nouveau compte (signup normal ou
-- création admin), sans dépendre d'un appel applicatif qui pourrait être oublié.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profils (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
