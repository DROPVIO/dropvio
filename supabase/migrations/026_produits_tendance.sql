-- 026_produits_tendance.sql
-- Signal "tendance" générique sur un produit du catalogue (ex. catégories identifiées en
-- forte croissance lors d'un sourcing donné — animatronic/costumes animaux/calendriers de
-- l'avent/déco gothique pour la niche Halloween 2026). Booléen simple, pas de suffixe
-- d'année en dur dans le nom de colonne : ça éviterait une nouvelle migration à chaque
-- niche saisonnière future. created_at existant permet déjà de situer un import dans le
-- temps si besoin de contexte a posteriori.
alter table produits add column if not exists tendance boolean not null default false;

create index if not exists produits_tendance_idx on produits (tendance) where tendance = true;
