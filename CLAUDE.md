@AGENTS.md

## Base de données Supabase
- N'exécute JAMAIS de SQL qui modifie la base (migration, insert, update, delete, alter, create, drop, fonction, policy), ni via le connecteur Supabase, ni via la CLI, ni via un script.
- Quand une modification de base est nécessaire : crée le fichier de migration dans supabase/migrations/ et affiche son contenu complet dans ta réponse, dans un bloc ```sql```. Je le fais appliquer ailleurs puis je te confirme.
- La lecture seule (select, vérifier qu'une table ou une colonne existe) reste autorisée.

## Mode d'exécution
- Exécute chaque prompt EN ENTIER, du début à la fin, sans t'arrêter pour demander une confirmation. Prends les décisions raisonnables toi-même et liste-les à la fin dans un récapitulatif.
- Seules exceptions où tu t'arrêtes : SQL qui modifie la base (règle ci-dessus), suppression de fichiers ou de données, et secrets manquants.
- Ne fais jamais de tests dans le navigateur à ma place : c'est moi qui teste l'interface. Toi, tu lis les logs serveur pendant mes tests.
