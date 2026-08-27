-- 018_shopify_incidents_scopes.sql
-- Passage de shopify_connections.access_token (stocké en clair depuis 015) à un stockage
-- chiffré (AES-256-GCM, voir lib/crypto.ts) — nécessaire pour les nouveaux scopes lecture
-- (read_orders, read_returns, read_shopify_payments_disputes) qui donnent accès à des
-- données commandes/financières.
--
-- Le champ en clair est SUPPRIMÉ plutôt que migré en place : confirmé qu'aucune connexion
-- réelle n'en dépend à ce jour. Le garder aurait maintenu un chemin de lecture non chiffré
-- pour rien. Toute connexion existante devra être refaite — le callback OAuth réécrit
-- systématiquement la ligne avec le nouveau champ chiffré (voir app/api/shopify/callback).
alter table shopify_connections drop column if exists access_token;
alter table shopify_connections add column if not exists access_token_encrypted text;

-- Reflète si le scope read_shopify_payments_disputes a été effectivement accordé par le
-- marchand à l'écran de consentement OAuth (il peut être demandé sans être accordé) — sert
-- à distinguer "boutique sans Shopify Payments / scope refusé" (chargebacks_visible = false,
-- jamais affiché comme 0) d'une vraie absence de litige.
alter table shopify_connections add column if not exists disputes_scope_granted boolean not null default false;
