-- 047_produits_rotation.sql
-- Rotation quotidienne de l'ordre du catalogue /produits-gagnants
-- (app/api/aliexpress/products/route.ts). Avant : tri fixe par commandes desc, les mêmes
-- produits remontaient toujours en tête.
--
-- On garde exactement le même ensemble (vue produits_dedup + mêmes filtres que la route) ;
-- seul l'ordre change : md5(id || '|' || seed), puis id en départage. La seed est la date du
-- jour à Europe/Paris (YYYY-MM-DD), calculée par la route : ordre stable toute la journée,
-- donc pagination cohérente entre pages et requêtes, et nouvel ordre à minuit heure de Paris.
--
-- PostgREST ne sait pas trier par une expression : d'où ces deux fonctions appelées en RPC.
-- produits_rotation renvoie une page, produits_rotation_total le total filtré (pagination et
-- totalPages). Les deux portent la même clause WHERE : à garder synchronisées.
--
-- security invoker (défaut) : la RLS de produits s'applique comme pour la lecture directe de la
-- vue. stable : pas d'écriture.

create or replace function public.produits_rotation(
  p_seed           text,
  p_niche          text    default null,
  p_prix_min       numeric default null,
  p_prix_max       numeric default null,
  p_commandes_min  integer default null,
  p_commandes_max  integer default null,
  p_note_min       numeric default null,
  p_marge_min      integer default null,
  p_offset         integer default 0,
  p_limit          integer default 20
)
returns setof produits_dedup
language sql
stable
set search_path = public
as $$
  select d.*
  from produits_dedup d
  where (p_niche         is null or d.niche       =  p_niche)
    and (p_prix_min      is null or d."prixVente" >= p_prix_min)
    and (p_prix_max      is null or d."prixVente" <= p_prix_max)
    and (p_commandes_min is null or d.commandes   >= p_commandes_min)
    and (p_commandes_max is null or d.commandes   <= p_commandes_max)
    and (p_note_min      is null or d.note        >= p_note_min)
    and (p_marge_min     is null or d.marge       >= p_marge_min)
  -- collate "C" : comparaison octet par octet de l'empreinte hexadécimale, indépendante de la
  -- locale de la base et plus rapide.
  order by md5(d.id || '|' || p_seed) collate "C", d.id collate "C"
  offset greatest(coalesce(p_offset, 0), 0)
  limit  greatest(coalesce(p_limit, 20), 0);
$$;

create or replace function public.produits_rotation_total(
  p_niche          text    default null,
  p_prix_min       numeric default null,
  p_prix_max       numeric default null,
  p_commandes_min  integer default null,
  p_commandes_max  integer default null,
  p_note_min       numeric default null,
  p_marge_min      integer default null
)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from produits_dedup d
  where (p_niche         is null or d.niche       =  p_niche)
    and (p_prix_min      is null or d."prixVente" >= p_prix_min)
    and (p_prix_max      is null or d."prixVente" <= p_prix_max)
    and (p_commandes_min is null or d.commandes   >= p_commandes_min)
    and (p_commandes_max is null or d.commandes   <= p_commandes_max)
    and (p_note_min      is null or d.note        >= p_note_min)
    and (p_marge_min     is null or d.marge       >= p_marge_min);
$$;

grant execute on function public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer) to anon, authenticated;
grant execute on function public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer) to anon, authenticated;
