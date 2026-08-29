-- 024_produits_commandes_idx.sql
-- app/api/aliexpress/products/route.ts trie systématiquement par "commandes" desc
-- (le tri par défaut de /produits-gagnants), sans filtre niche pour l'onglet "Voir tout" —
-- jusqu'ici aucun index ne couvrait cette colonne (seuls (niche) et (niche, "prixVente")
-- existaient, migration 001). Mesuré : sans filtre niche sur les 40 000 lignes actuelles,
-- la requête passe de ~90-120ms à 290-430ms aux offsets profonds, faute d'index pour
-- éviter un tri complet du jeu de résultats à chaque requête.
create index if not exists produits_commandes_idx on produits (commandes desc);
