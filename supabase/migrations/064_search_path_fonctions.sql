-- 064 — search_path fixé sur deux fonctions de trigger (avertissement de sécurité Supabase
-- « function_search_path_mutable »). Déjà appliquée en base.
alter function public.proteger_colonnes_facturation() set search_path = public;
alter function public.figer_config_expert() set search_path = public;
