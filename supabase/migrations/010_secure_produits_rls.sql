-- La clé service role (utilisée par le cron et les scripts d'admin, via
-- createSupabaseAdminClient) bypass RLS entièrement — une policy "to service_role"
-- ne serait donc jamais évaluée et n'apporterait aucune restriction réelle.
-- Le seul moyen effectif de fermer l'écriture aux rôles anon/authenticated (qui,
-- avec "with check (true)", pouvaient jusqu'ici insérer/modifier n'importe quelle
-- ligne du catalogue via la clé anon publique) est de supprimer ces policies :
-- sans policy insert/update, RLS refuse ces opérations par défaut pour tout rôle
-- non bypass-RLS, tandis que le service role continue d'écrire normalement.
drop policy if exists "allow_insert" on produits;
drop policy if exists "allow_update" on produits;

-- La lecture publique reste inchangée (catalogue public, "allow_select" non touché).
