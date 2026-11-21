-- 060 — handle_new_user est une fonction de trigger (création du profil à l'inscription) :
-- personne n'a à l'appeler directement (constat FO3 de SECURITE_AUDIT.md).
revoke all on function public.handle_new_user() from public, anon, authenticated;
