-- 049_produits_commandes_min.sql
-- Catalogue Produits gagnants : un produit n'est affiché qu'à partir de 100 commandes, quel que
-- soit le filtre envoyé (absent ou plus bas → 100 ; plus haut → respecté). Même règle que
-- lib/catalogue-commandes.ts, appliquée aussi ici pour qu'un appel RPC direct ne la contourne pas.
-- Seule la ligne commandes change par rapport à 047 ; signatures, ordre et droits identiques.

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
    and d.commandes >= greatest(coalesce(p_commandes_min, 100), 100)
    and (p_commandes_max is null or d.commandes   <= p_commandes_max)
    and (p_note_min      is null or d.note        >= p_note_min)
    and (p_marge_min     is null or d.marge       >= p_marge_min)
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
    and d.commandes >= greatest(coalesce(p_commandes_min, 100), 100)
    and (p_commandes_max is null or d.commandes   <= p_commandes_max)
    and (p_note_min      is null or d.note        >= p_note_min)
    and (p_marge_min     is null or d.marge       >= p_marge_min);
$$;

grant execute on function public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer) to anon, authenticated;
grant execute on function public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer) to anon, authenticated;
