-- 056 — Limiteur de débit partagé entre toutes les instances (lib/rate-limit.ts).
--
-- Le limiteur en mémoire ne voit que les requêtes de sa propre instance Vercel : avec plusieurs
-- instances, la limite réelle est multipliée d'autant. Ce compteur en base est atomique (une
-- seule instruction insert … on conflict) et commun à toutes les instances. Appelé uniquement
-- par le serveur avec le service role ; aucun accès pour anon / authenticated.

create table if not exists rate_limites (
  cle text primary key,
  compteur integer not null,
  fin_fenetre timestamptz not null
);

alter table rate_limites enable row level security;
-- Aucune policy : table inaccessible aux clés anon et authenticated.

create or replace function public.rate_limit_consommer(p_cle text, p_max integer, p_fenetre_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compteur integer;
begin
  insert into rate_limites as r (cle, compteur, fin_fenetre)
  values (p_cle, 1, now() + make_interval(secs => p_fenetre_ms / 1000.0))
  on conflict (cle) do update set
    compteur = case when r.fin_fenetre <= now() then 1 else r.compteur + 1 end,
    fin_fenetre = case when r.fin_fenetre <= now()
                       then now() + make_interval(secs => p_fenetre_ms / 1000.0)
                       else r.fin_fenetre end
  returning compteur into v_compteur;
  return v_compteur <= p_max;
end;
$$;

revoke all on function public.rate_limit_consommer(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_consommer(text, integer, integer) to service_role;

-- Nettoyage des fenêtres expirées depuis plus d'un jour (à appeler par un cron, facultatif).
create or replace function public.rate_limit_purger()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limites where fin_fenetre < now() - interval '1 day';
$$;

revoke all on function public.rate_limit_purger() from public, anon, authenticated;
grant execute on function public.rate_limit_purger() to service_role;
