-- 027_produits_dedup_view.sql
-- Vue en lecture seule qui déduplique les titres identiques au sein d'une même niche
-- (variantes/relistings AliExpress distincts — id/lienAliExpress toujours différents,
-- jamais un doublon de clé primaire — qui partagent un titre scrapé identique). Garde,
-- par (nom, niche), la ligne avec le plus de commandes (note en départage) plutôt que la
-- première rencontrée.
--
-- Partition par (nom, niche) et non par nom seul : un même titre légitimement sourcé dans
-- plusieurs niches (ex. bandes de résistance en fitness ET yoga) doit garder une ligne par
-- niche, sinon il disparaîtrait des niches où sa ligne n'a pas été retenue.
--
-- Non destructif : la table produits n'est pas modifiée, aucune ligne supprimée. Vue simple
-- (pas matérialisée) : reflète toujours l'état courant de produits sans job de rafraîchissement
-- à maintenir — un DISTINCT ON sur ~45k lignes reste trivial pour Postgres à ce volume.
create or replace view produits_dedup as
select distinct on (nom, niche) *
from produits
order by nom, niche, commandes desc nulls last, note desc nulls last;
