-- 008_plan_limits.sql a resserré sites_generes à "propriétaire uniquement" avec
-- select_own/insert_own/delete_own, mais a oublié la policy UPDATE : toute tentative
-- d'édition d'un site déjà sauvegardé échoue silencieusement (0 ligne affectée) faute
-- de policy correspondante.
create policy "update_own" on sites_generes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
