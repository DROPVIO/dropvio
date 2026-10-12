-- 041_boutique_categories_set_null_slug_unique.sql
-- 1. boutique_produits.category_id (012_boutiques.sql) référençait boutique_categories sans
--    clause on delete : supprimer une catégorie qui contient des produits échouait (23503),
--    alors que l'interface annonce que les produits restent sans catégorie. La clé passe en
--    on delete set null. La route DELETE /api/boutiques/[id]/categories/[categoryId] détache
--    déjà les produits avant de supprimer : cette contrainte en est le filet de sécurité.
-- 2. Le slug d'une catégorie sert d'URL de collection (/boutiques/[slug]/collections/[slug]) :
--    il doit être unique dans sa boutique. Les doublons existants sont d'abord renommés
--    (suffixe tiré de l'id) pour que l'index unique puisse être créé.
--
-- Idempotente : peut être rejouée sans effet de bord.

alter table boutique_produits
  drop constraint if exists boutique_produits_category_id_fkey;

alter table boutique_produits
  add constraint boutique_produits_category_id_fkey
  foreign key (category_id) references boutique_categories(id) on delete set null;

with doublons as (
  select id,
         row_number() over (partition by boutique_id, slug order by created_at, id) as rang
  from boutique_categories
)
update boutique_categories c
set slug = c.slug || '-' || left(c.id::text, 8),
    updated_at = now()
from doublons d
where c.id = d.id
  and d.rang > 1;

create unique index if not exists boutique_categories_boutique_slug_uidx
  on boutique_categories(boutique_id, slug);
