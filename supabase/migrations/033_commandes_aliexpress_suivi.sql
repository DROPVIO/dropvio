-- 033_commandes_aliexpress_suivi.sql
-- Ferme la boucle du flux "assist manuel" AliExpress : numéro de suivi saisi par le marchand,
-- poussé vers Shopify (fulfillment) une fois le scope write_fulfillments accordé.

alter table commandes_a_preparer
  add column if not exists numero_suivi text,
  add column if not exists transporteur text,
  add column if not exists fulfillment_shopify_id bigint,
  add column if not exists fulfillment_erreur text;

-- Même pattern que disputes_scope_granted (018_shopify_incidents_scopes.sql) : un scope OAuth
-- optionnel/tardif, à vérifier avant de tenter un appel qui échouerait sinon avec un 403.
alter table shopify_connections
  add column if not exists fulfillment_scope_granted boolean not null default false;
