-- 061 — Plus de plan « free » : seuls pro, agency et expert existent. Un compte sans abonnement
-- a plan = null et n'a accès à aucun outil.
alter table profils alter column plan drop default;
alter table profils alter column plan drop not null;
update profils set plan = null where plan = 'free';
alter table profils drop constraint profils_plan_check;
alter table profils add constraint profils_plan_check check (plan in ('pro', 'agency', 'expert'));
