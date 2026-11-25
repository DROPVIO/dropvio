-- 070 — Catalogue sans plancher de commandes, et plafond du plan Pro (15 000 produits), dans les
-- fonctions de rotation de Produits gagnants (app/api/aliexpress/products/route.ts).
--
-- Plus de plancher : la condition de la migration 049 qui imposait au moins 100 commandes, même
-- sans filtre, est retirée. Tout le catalogue dédoublonné (vue produits_dedup) est lisible ;
-- p_commandes_min redevient un filtre facultatif, appliqué seulement s'il est fourni.
--
-- Plafond Pro : un ensemble fixe, les 15 000 premiers produits du catalogue dédoublonné dans
-- l'ordre commandes décroissantes, puis id croissant. La route lit le dernier produit autorisé
-- (la « borne », lib/catalogue-plafond.ts) et la passe ici : un produit est gardé s'il a plus de
-- commandes que la borne, ou autant avec un id inférieur ou égal. Les filtres et l'ordre de
-- rotation quotidien s'appliquent à l'intérieur. Borne absente (null) = aucun plafond (Agency,
-- Expert, ou catalogue plus petit que le plafond).
--
-- La comparaison des id garde la collation par défaut de la base, comme le tri de PostgREST qui
-- sert à lire la borne : les deux rangent les id de la même façon.
--
-- Deux paramètres s'ajoutent en fin de signature : les anciennes fonctions sont supprimées
-- (sinon PostgREST verrait deux surcharges pour un même appel). Ordre et droits identiques à 047
-- et 057. Prérequis : migrations 047, 049 et 057 appliquées.

drop function if exists public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer);
drop function if exists public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer);

create function public.produits_rotation(
  p_seed             text,
  p_niche            text    default null,
  p_prix_min         numeric default null,
  p_prix_max         numeric default null,
  p_commandes_min    integer default null,
  p_commandes_max    integer default null,
  p_note_min         numeric default null,
  p_marge_min        integer default null,
  p_offset           integer default 0,
  p_limit            integer default 20,
  p_borne_commandes  integer default null,
  p_borne_id         text    default null
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
    and (p_borne_commandes is null or p_borne_id is null
         or d.commandes > p_borne_commandes
         or (d.commandes = p_borne_commandes and d.id <= p_borne_id))
  order by md5(d.id || '|' || p_seed) collate "C", d.id collate "C"
  offset greatest(coalesce(p_offset, 0), 0)
  limit  greatest(coalesce(p_limit, 20), 0);
$$;

create function public.produits_rotation_total(
  p_niche            text    default null,
  p_prix_min         numeric default null,
  p_prix_max         numeric default null,
  p_commandes_min    integer default null,
  p_commandes_max    integer default null,
  p_note_min         numeric default null,
  p_marge_min        integer default null,
  p_borne_commandes  integer default null,
  p_borne_id         text    default null
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
    and (p_marge_min     is null or d.marge       >= p_marge_min)
    and (p_borne_commandes is null or p_borne_id is null
         or d.commandes > p_borne_commandes
         or (d.commandes = p_borne_commandes and d.id <= p_borne_id));
$$;

-- Droits de 057 : comptes connectés seulement (le RLS de produits réserve le catalogue aux abonnés).
revoke execute on function public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer, integer, text) from public, anon;
revoke execute on function public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer, integer, text) from public, anon;
grant execute on function public.produits_rotation(text, text, numeric, numeric, integer, integer, numeric, integer, integer, integer, integer, text) to authenticated, service_role;
grant execute on function public.produits_rotation_total(text, numeric, numeric, integer, integer, numeric, integer, integer, text) to authenticated, service_role;
