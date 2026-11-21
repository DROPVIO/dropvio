# À faire avant le lancement

- [ ] **Suppression de compte (obligation RGPD).** L'app n'a pas de fonction de suppression. Elle devra aussi effacer les fichiers de l'utilisateur dans les buckets `mediatheque` et `site-images` : la suppression d'un compte efface les lignes `medias`, pas les fichiers.
- [ ] **Vente des crédits images et vidéos.** Passer `EXPERT_MEDIAS_EN_VENTE` à `true` dans `lib/expert-pricing.ts` quand le Studio est en production.
