-- 021_drop_livraison_produits.sql
-- Le filtre "livraison rapide FR/UE" (migration 005) reposait sur une colonne jamais
-- alimentée : l'API Affiliate AliExpress ne renvoie pas de délai de livraison fiable
-- (ship_to_days), et scripts/seed-produits.ts n'a jamais écrit cette colonne — elle restait
-- à false pour tous les produits. Filtre retiré du code (app/produits-gagnants/page.tsx,
-- app/api/aliexpress/products/route.ts) ; colonne inutilisée nulle part, on la supprime.
drop index if exists produits_livraison_idx;

alter table produits
  drop column if exists "livraisonFrUe";
