-- Visibilité publique par boutique : ajoute un flag est_publique (privé par défaut,
-- opt-in explicite) et les policies RLS de lecture publique correspondantes, en plus
-- (OR, policies permissives) des policies "select_own" déjà en place.
--
-- Note : les routes publiques (app/api/boutiques/slug/**) utilisent la service role
-- (qui bypass RLS) et filtrent donc explicitement sur est_publique côté application.
-- Ces policies RLS sont un garde-fou cohérent pour tout accès direct via la clé anon.

alter table boutiques
  add column if not exists est_publique boolean not null default false;

create policy "select_public" on boutiques for select using (est_publique = true);

create policy "select_public" on boutique_categories for select using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_categories.boutique_id
      and boutiques.est_publique = true
  )
);

create policy "select_public" on boutique_produits for select using (
  exists (
    select 1 from boutiques
    where boutiques.id = boutique_produits.boutique_id
      and boutiques.est_publique = true
  )
);
