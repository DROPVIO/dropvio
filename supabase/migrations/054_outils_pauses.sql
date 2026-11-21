-- 054_outils_pauses.sql — PROPOSITION, À VALIDER AVANT APPLICATION (nouvelle table).
--
-- Pauses par outil pour les plans Pro et Agency : chaque image générée consomme des crédits de
-- l'outil utilisé ; quand les crédits de la période d'usage sont épuisés, l'outil passe en pause.
-- S'ajoute au budget IA mensuel (052) et au garde-fou horaire, sans les remplacer.
--
-- Les réglages (crédits par image, credits_max, periode_minutes, pause_minutes) restent dans le
-- code (lib/pauses-outils.ts), comme les autres limites par plan, et sont passés en paramètres :
-- seul l'usage est en base. Les règles sont celles de lib/pauses-outils-regles.ts (testées) :
-- - une réservation n'est acceptée que si elle tient dans les crédits restants de la période ;
-- - celle après laquelle il ne reste plus de quoi générer une image déclenche la pause, à sa date ;
-- - la période est glissante et repart à zéro à la fin d'une pause ;
-- - une réservation rendue (génération en échec) ne compte plus et lève la pause qu'elle avait
--   déclenchée.

create table if not exists outils_usage (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  outil            text not null check (outil in ('studio_prompt_libre', 'studio_images_produits', 'boutique_images_produits', 'landing_page')),
  credits          integer not null check (credits > 0),
  declenche_pause  boolean not null default false,
  rendu            boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists outils_usage_user_outil_idx on outils_usage (user_id, outil, created_at desc);

-- Lecture par l'utilisateur (crédits restants affichés) ; écritures seulement par les fonctions
-- ci-dessous, appelées par le serveur avec la clé service role.
alter table outils_usage enable row level security;
drop policy if exists "select_own" on outils_usage;
create policy "select_own" on outils_usage for select using (auth.uid() = user_id);

-- Réserve les crédits d'une image. Verrou par (utilisateur, outil) : deux onglets qui génèrent en
-- même temps passent l'un après l'autre, la pause ne peut donc pas être contournée.
-- statut : 'ok' (reservation_id renseigné), ou 'pause' (fin_pause renseignée).
create or replace function outils_credits_reserver(
  p_user_id uuid,
  p_outil text,
  p_cout integer,
  p_credits_max integer,
  p_periode_minutes integer,
  p_pause_minutes integer
)
returns table (reservation_id uuid, statut text, fin_pause timestamptz, restants integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maintenant timestamptz := now();
  v_pause interval := make_interval(mins => p_pause_minutes);
  v_fin_pause timestamptz;
  v_fin_derniere timestamptz;
  v_debut timestamptz;
  v_utilises integer;
  v_restants integer;
  v_declenche boolean;
  v_id uuid;
begin
  if p_cout <= 0 or p_credits_max < p_cout or p_periode_minutes <= 0 or p_pause_minutes <= 0 then
    raise exception 'Réglages de pause invalides pour %', p_outil;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_outil, 0));

  -- Pause en cours ?
  select max(u.created_at + v_pause) into v_fin_pause
  from outils_usage u
  where u.user_id = p_user_id and u.outil = p_outil and u.declenche_pause and not u.rendu
    and u.created_at + v_pause > v_maintenant;
  if v_fin_pause is not null then
    return query select null::uuid, 'pause'::text, v_fin_pause, 0;
    return;
  end if;

  -- Période d'usage : glissante, jamais avant la fin de la dernière pause.
  select max(u.created_at + v_pause) into v_fin_derniere
  from outils_usage u
  where u.user_id = p_user_id and u.outil = p_outil and u.declenche_pause and not u.rendu
    and u.created_at + v_pause <= v_maintenant;
  v_debut := greatest(v_maintenant - make_interval(mins => p_periode_minutes), coalesce(v_fin_derniere, '-infinity'::timestamptz));

  select coalesce(sum(u.credits), 0) into v_utilises
  from outils_usage u
  where u.user_id = p_user_id and u.outil = p_outil and not u.rendu
    and u.created_at > v_debut and u.created_at <= v_maintenant;
  v_restants := greatest(0, p_credits_max - v_utilises);

  if v_restants < p_cout then
    return query select null::uuid, 'pause'::text, v_maintenant + v_pause, 0;
    return;
  end if;

  v_declenche := (v_restants - p_cout) < p_cout;
  insert into outils_usage (user_id, outil, credits, declenche_pause, created_at)
  values (p_user_id, p_outil, p_cout, v_declenche, v_maintenant)
  returning id into v_id;

  return query select v_id, 'ok'::text, case when v_declenche then v_maintenant + v_pause else null end, v_restants - p_cout;
end;
$$;

-- Rend les crédits d'une réservation dont la génération a échoué.
create or replace function outils_credits_rendre(p_reservation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update outils_usage set rendu = true where id = p_reservation_id;
$$;

revoke all on function outils_credits_reserver(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function outils_credits_rendre(uuid) from public, anon, authenticated;
grant execute on function outils_credits_reserver(uuid, text, integer, integer, integer, integer) to service_role;
grant execute on function outils_credits_rendre(uuid) to service_role;
