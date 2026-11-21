# Audit UX — Dropvio vu par un dropshipper débutant

**Date :** 17 novembre 2026
**Environnement :** `http://localhost:3000` (serveur de développement local), compte réel en plan Expert
**Navigation :** Chromium sans interface, sur ordinateur (1440 × 900) et sur téléphone (390 × 844)
**Méthode :** phase 1 « en aveugle ». J'ai seulement utilisé l'application (pages, boutons, textes affichés), sans ouvrir le code ni la documentation pendant les tests.

**Limites à garder en tête :**
- **Biais :** l'auditeur avait lu une grande partie du code dans des sessions précédentes. Cette connaissance a pu raccourcir certains parcours, notamment pour trouver les boutiques (bouton « Mode boutique ») et comprendre le mot « migration » dans les messages d'erreur. Un vrai débutant aurait sans doute mis plus de temps sur ces deux points.
- **Temps de chargement :** ils ont été mesurés sur un serveur de développement local. La production peut être plus rapide.
- **Données de test :** la consommation a été limitée. Un site existant a été modifié puis remis à l'identique. Une boutique de test « Audit UX test » a été créée, avec 1 produit.

---

## Résumé en cinq lignes

1. **Ce qui fonctionne :** l'audit IA (score clair en 48 s), la modification d'un site existant par instruction (6 s, avec résumé), la création de boutique et l'ajout d'un produit par lien AliExpress, le calculateur de marge en mode France.
2. **Ce qui bloque :**
   - la génération de landing page échoue (2 essais sur 2) ;
   - la génération d'image du Studio échoue (« service indisponible ») ;
   - le choix des photos dans le Catalogue est impossible ;
   - toutes les pages de l'app sont inutilisables sur téléphone.
3. **Le plus beau :** l'écran de résultat de l'audit IA, la liste du Catalogue et la page Abonnements.
4. **Le plus confus :** le calculateur de marge, dont les exemples grisés ressemblent à des valeurs saisies mais ne comptent pas, et le tableau de bord, dont les chiffres se contredisent.
5. **Priorité suivante :** rendre fiables la génération de site et la génération d'image, puis rendre l'app utilisable sur téléphone.

---

## Tableau par outil

Scores sur 10 : **F** = facilité d'utilisation, **B** = beauté visuelle, **C** = clarté.

| # | Outil | Compréhension | Parcours (tâche principale) | Erreurs et blocages | Clarté des textes | Visuel | Téléphone | F | B | C |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tableau de bord | Partielle | 0 clic (page d'arrivée). Aucune indication de « par où commencer » à part « Nouvelle génération ». | Chiffres contradictoires : « Sites générés 4 » (30 j) et « Sites ce mois 0 » ; « Score moyen 63/100 » et « 54/100 » ; « 2/100 audits ce mois » et 3 audits sur 30 j. Le bloc « Dashboard complet » répète les blocs du dessus. | Les périodes (30 jours glissants, mois calendaire, tout) ne sont pas nommées. « Incidents Shopify » est obscur pour un débutant. | Propre et aéré, mais deux styles différents de sélecteur de période (gris et violet). | Inutilisable : la barre latérale prend environ 2/3 de l'écran, le contenu est écrasé. | 6 | 7 | 5 |
| 2 | Produits (Tous les produits) | Oui | **Recherche par nom impossible** : pas de champ texte, seulement des filtres niche, prix et marge (1 à 2 clics). Ajout à une boutique : 2 clics (bouton puis « Ajouter à cette boutique »). Marge lisible sans clic (« Marge est. »). | « Alternatives fiables » propose des produits à **0 commande et sans note**, en contradiction avec le mot « fiables ». La touche Échap ne ferme pas le menu des niches. | « 7.0%% comm. » (coquille). On ne sait pas sur quoi reposent « Marge est. » et « Prix de vente suggéré ». | Cartes chargées : 5 boutons par carte, et le bouton principal mène hors de l'app (« Voir sur AliExpress »). Titres coupés au milieu d'une ligne. Prix avec un point (« 15.10€ »). | Utilisable mais très long (24 000 px) et gêné par la barre latérale. | 6 | 7 | 6 |
| 3 | Calculateur de marge | Oui | 1 clic depuis un produit (coût prérempli), saisie du prix de vente, choix du pays. Le prix de vente suggéré du produit n'est pas reporté. | **Piège :** les valeurs grisées (livraison 2,00, pub 5,00, charges 15 %, taxe 5 %) ressemblent à des valeurs saisies mais valent 0. Résultat en mode International : « 62,2 % — Excellente » et « peut absorber les coûts pubs », alors qu'aucun coût de pub n'est compté. | « CAC », « break-even », « ROI » : jargon non expliqué. Le pays par défaut est « International manuel ». | Résultats bien hiérarchisés. La barre « Par vente » du graphique est invisible. | Barre latérale gênante. | 6 | 7 | 4 |
| 4 | Audit IA | Oui | 3 clics (coller l'URL, « Récupérer », « Analyser »), puis 48 s d'attente. L'étape « Récupérer » semble inutile. L'URL est marquée « facultatif » alors que c'est le cas le plus courant. | Aucun blocage. Une correction propose « ⭐ 4.8/5 · 2 347 clients satisfaits », c'est-à-dire d'inventer des avis. | Corrections très techniques (`max-width`, `rem`, `object-fit`) : un débutant ne sait pas les appliquer. Le bouton « Télécharger le HTML corrigé » aide. | **Le plus bel écran** : jauge, avis designer, 9 cartes notées. Le texte orange des corrections est peu contrasté. | Barre latérale gênante. | 8 | 8 | 6 |
| 5 | Site Builder | Partielle | Environ 4 clics et 2 saisies (« Ajoute ton produit », coller le lien, Importer, prix, Terminé, description, Générer). Changer le texte ou l'image n'a pas pu être testé sur un nouveau site, car la génération échoue (voir l'outil 6 pour la modification d'un site existant). | **Génération échouée 2 fois sur 2**, au plus 7 minutes d'attente à chaque fois, puis « La génération a échoué. Réessaie. » sans cause ni conseil. Le compteur Quota est ensuite passé à « Sites 1 / 100 » alors qu'aucun site n'a été créé. Impossible d'ajouter une photo produit ici (renvoi vers le Catalogue, lui-même bloqué). | Le sous-titre promet « en quelques secondes ». « 📄 HTML » (bouton de format) est obscur. La mention sur les images apparaît deux fois. | Grand vide au milieu de la page. La barre de saisie façon assistant est élégante. | Barre latérale gênante. | 3 | 7 | 5 |
| 6 | Mes sites | Oui | Téléchargement : 1 clic (fichier `.html` correct). Modification : 1 clic sur « Modifier », une instruction, « Appliquer » (6 s, avec résumé, enregistrement automatique et bouton « Annuler »). | Pas d'« ouverture » simple du site : pas de bouton « Voir », il faut passer par « Modifier ». Le bouton « Annuler cette modification » disparaît après un rechargement. Aucun moyen de changer une image. Nombreux doublons « animals.com », sans recherche. | Passage au vouvoiement (« vos landing pages »). « Liquid (Shopify) » et « .liquid » non expliqués. | Pas d'aperçu des sites dans la liste, seulement une icône de globe. Le texte de « Télécharger le .liquid » touche le bord du bouton. | Barre latérale gênante. | 6 | 6 | 6 |
| 7 | Studio IA | Oui | Description puis « Générer l'image » : 1 clic. | **Échec au bout de 71 s** : « Service de génération indisponible, réessaie plus tard. » **Aucun quota visible** dans le Studio : il faut aller dans « Quota ». | Explication claire sur l'image de référence. Dans l'onglet Images produits, « Sélectionner les [N] premiers produits » est coupé en deux. | Deux panneaux propres. Médiathèque vide bien signalée. | Barre latérale gênante. | 4 | 7 | 6 |
| 8 | Catalogue | Partielle : quelle différence avec « Tous les produits » ? | Ouvrir un produit : 1 clic. **Choisir une photo : impossible.** | La section Photos affiche « L'enregistrement des photos pour ton compte n'est pas encore disponible (migration 053 à appliquer) », sans aucun bouton. La fiche met plusieurs secondes à charger (« Chargement du catalogue… »), et la liste environ 17 s. | « Migration 053 » : jargon technique montré à l'utilisateur. Fiche pleine de « Non renseigné » (titre, description, stock). Lien AliExpress brut très long. | Liste très propre (miniatures, colonnes). La colonne « Stock » ne contient que « Non renseigné ». | Barre latérale gênante : la liste devient illisible. | 4 | 8 | 5 |
| 9 | Boutiques | Partielle : **aucune entrée « Boutiques » dans la barre latérale** | Site Builder, puis « Mode boutique », formulaire, « Créer ma boutique » (la page de la boutique s'ouvre), coller le lien, Importer, « Ajouter le produit » : environ 5 clics. Ça fonctionne. | Pas de confirmation visible près du formulaire après l'ajout. Pas de miniature du produit dans la liste. | « Slug », « Pousser vers Shopify », « migration 042 » (langue). « Visibilité de la boutique » écrit deux fois. Adresses invalides affichées dans la liste (« /boutique cuisine », « /boutique-soins:beauté »). | Page de gestion très longue (environ 12 blocs) ; on ne sait pas par quoi commencer. | Barre latérale gênante. | 6 | 6 | 5 |
| 10 | Formation | Oui (page de vente) | 1 clic (barre latérale). **La lecture d'une page n'a pas pu être testée** : avec ce compte, il faut acheter. | Rien n'indique si un abonnement (Expert, Agency…) inclut la formation. Pas d'extrait ni de plan des chapitres avant l'achat. | Textes de vente clairs. Prix « 24,99€ » sans espace. | Cartes de prix soignées, bundle bien mis en avant. | Correct. | 6 | 8 | 5 |
| 11 | Utilisation et Paramètres | Oui | Utilisation : 2 clics (Paramètres > Utilisation, ou carte du tableau de bord). Quota : 1 clic. | Page Quota : les libellés « Sites » et « Images » sont **presque invisibles** (texte blanc sur fond clair), la fin de période est « 01/01/2100 », et un bouton « Payer » est proposé pour 0,00 €. Intégrations : « AliExpress — Connecté » alors que rien n'a été connecté. Profil : « email non modifiable », « avatars disponibles prochainement ». | « Budget IA du mois : 0,31 € / 28,00 € » à côté de « Sites 1 / 100 » et « Images 0 / 50 » : trois compteurs différents sans lien expliqué. « Claude Fable 5.2 » : nom de modèle obscur. | Fenêtre des Paramètres claire et bien rangée. | Non testé en détail. | 6 | 7 | 5 |
| 12 | Abonnements | Partielle | Page atteinte par son adresse : aucun lien direct trouvé dans l'app, à part « Changer de plan » dans Paramètres. | Pour un abonné Expert, la page ne montre ni le plan actuel ni l'offre Expert, et propose « Commencer l'essai gratuit » sur Pro et Agency. Aucun lien de retour vers l'app (seulement « Voir la formation » et « Se déconnecter »). | Conditions de l'essai très claires. « Le budget IA le plus large » sans chiffre. | Très propre et lisible. | **Très bon** (seule page sans barre latérale). | 5 | 8 | 5 |

---

## Questions que l'utilisateur se pose et que l'interface ne règle pas

1. Ma génération de site a échoué : ai-je perdu un crédit ? Le Quota indique 1 site consommé.
2. Pourquoi la génération échoue-t-elle, et que dois-je changer pour qu'elle marche ?
3. Combien d'images me reste-t-il ? Le Studio ne le dit pas.
4. Quelle différence entre « Tous les produits » et « Catalogue » ? Ce sont les mêmes 4 081 produits.
5. Comment chercher un produit par son nom dans « Tous les produits » ?
6. La « Marge est. » de 62 % tient-elle compte de la livraison, de la publicité et des charges ?
7. Les montants grisés du calculateur sont-ils comptés ?
8. Où sont mes boutiques ? Pas d'entrée dans le menu.
9. Comment changer l'image d'un produit ou d'un site ? Le Site Builder renvoie au Catalogue, qui est bloqué, et l'écran de modification de site ne propose pas d'image.
10. Qu'est-ce qu'un « slug », un fichier « .liquid », une « migration 053 », « Claude Fable 5.2 » ?
11. Mon plan Expert inclut-il la formation ?
12. Que représente le budget IA (0,31 € / 28 €) par rapport aux quotas Sites et Images ?
13. Pourquoi « Sites ce mois : 0 » sur le tableau de bord, mais « 1 / 100 » dans Utilisation et Quota ?
14. Puis-je voir mon site en ligne depuis « Mes sites » sans passer par « Modifier » ?
15. Comment revenir dans l'app depuis la page Abonnements ?
16. Les « alternatives fiables » à 0 commande sont-elles vraiment fiables ?

---

## Problèmes classés par gravité

### Bloquant
1. **La génération de landing page échoue** (2 essais sur 2), après une longue attente (au plus 7 minutes), avec un message sans cause. Le compteur de sites consommés augmente pourtant (Quota : « Sites 1 / 100 »).
2. **La génération d'image du Studio échoue** : « Service de génération indisponible » au bout de 71 s.
3. **Le choix des photos d'un produit dans le Catalogue est impossible** (« migration 053 à appliquer »). Comme le Site Builder renvoie au Catalogue pour les images produits, aucun écran ne permet de changer la photo d'un produit hors boutique.
4. **Téléphone :** sur toutes les pages de l'app (sauf Abonnements), la barre latérale fixe occupe environ deux tiers de l'écran. Le contenu devient illisible : tableau de bord, Catalogue, etc.

### Gênant
5. **Calculateur :** les exemples grisés passent pour des valeurs. Le résultat est optimiste et le message (« peut absorber les coûts pubs ») trompeur, car ni publicité ni livraison ne sont comptées.
6. **Tableau de bord :** les chiffres se contredisent (sites, score moyen, audits) car les périodes ne sont pas indiquées.
7. **Produits :** pas de recherche par nom. « Alternatives fiables » propose des produits sans commande ni note.
8. **Boutiques** introuvables dans la barre latérale.
9. **Jargon technique visible** : « migration 042 », « migration 053 », « slug », « Liquid », « Pousser vers Shopify », « CAC », « Claude Fable 5.2 ».
10. **Audit IA :** les corrections sont du CSS, et l'une d'elles suggère d'afficher des avis et un nombre de clients inventés.
11. **Studio :** aucun quota affiché avant de générer.
12. **Mes sites :** pas d'aperçu, doublons, pas de recherche ; l'annulation disparaît au rechargement ; impossible de changer une image.
13. **Abonnements :** la page ignore le plan Expert actuel et n'a pas de retour vers l'app.
14. **Formation :** l'accès pour un abonné n'est pas expliqué ; pas d'aperçu du contenu.
15. **Quota :** libellés presque invisibles, « Payer 0,00 € » proposé, fin de période « 01/01/2100 ».
16. **Intégrations :** « AliExpress — Connecté » sans aucune connexion faite.
17. **Lenteur :** environ 5 à 17 s par page sur l'environnement testé (Catalogue environ 17 s, Produits environ 10 s).
18. **Promesse non tenue :** « en quelques secondes » dans le Site Builder.

### Cosmétique
19. « 7.0%% comm. » (double pourcentage).
20. Prix au format « 15.10€ » dans Produits, mais « 9,99 € » dans le Catalogue.
21. Titres produits coupés au milieu d'une ligne dans les cartes.
22. Deux styles de sélecteur de période sur le tableau de bord.
23. Mélange du tutoiement et du vouvoiement (« vos landing pages », « Sauvegarde illimitée de vos sites »).
24. « Visibilité de la boutique » écrit deux fois. Mention sur les images répétée deux fois dans le Site Builder.
25. Grand vide au milieu du Site Builder.
26. Le texte de « Télécharger le .liquid » touche le bord du bouton.
27. Adresses de boutiques invalides affichées (espace, deux-points, accent).
28. La touche Échap ne ferme pas le menu des niches.
29. Long identifiant technique affiché sous chaque produit de boutique, sans miniature.
30. Texte orange des corrections de l'audit peu contrasté.

Hors périmètre : la pastille noire « N » en bas à gauche des captures est l'indicateur du serveur de développement Next.js, pas un élément de Dropvio.

---

## Modifications suggérées (non faites)

- Afficher une vraie cause et une action possible quand une génération échoue, et indiquer clairement si un crédit a été consommé ou rendu.
- Barre latérale repliée (menu « burger ») sur téléphone.
- Calculateur : préremplir les vraies valeurs, ou afficher clairement « non compté » à côté des exemples. Reporter le prix de vente suggéré.
- Ajouter une recherche par nom dans « Tous les produits », et clarifier ou fusionner « Tous les produits » et « Catalogue ».
- Ajouter « Boutiques » dans la barre latérale.
- Remplacer les messages qui citent des migrations par un message pour l'utilisateur (« Fonction bientôt disponible »).
- Afficher le quota restant dans le Studio, et nommer les périodes sur le tableau de bord.
- Page Abonnements : afficher le plan actuel et un lien de retour vers l'app.

---

## Captures d'écran

Elles sont rangées **hors du projet**, dans le dossier temporaire de la session :
`/private/tmp/claude-501/-Users-lenny/bbb26045-ce08-49aa-af53-eb7171dafaa4/scratchpad/audit/shots/`
Ce dossier est temporaire. Pour garder les captures, il faut les copier ailleurs.

| Outil | Fichiers |
|---|---|
| Connexion | `00-login.png`, `01-apres-login.png` |
| 1 Tableau de bord | `01-dashboard-desktop.png`, `01-dashboard-desktop-pleine.png`, `01-dashboard-mobile.png` |
| 2 Produits | `02-produits-desktop.png`, `02-produits-mobile.png`, `02b-niches-ouvert.png`, `02c-ajout-boutique-modale.png`, `02d-alternatives.png`, `02e-bas-de-page.png` |
| 3 Calculateur | `03-calculateur-desktop.png`, `03b-resultat.png`, `03c-france.png` |
| 4 Audit IA | `04-audit-desktop.png`, `04b-apres-recuperer.png`, `04c-analyse-en-cours.png`, `04d-resultat.png`, `04d-resultat-pleine.png` |
| 5 Site Builder | `05-sitebuilder-desktop.png`, `05b-panneau-produit.png`, `05d-apres-import.png`, `05f-generation-en-cours.png`, `05g-resultat.png`, `05g2-resultat.png` (échecs) |
| 6 Mes sites | `06-messites-desktop.png`, `06b-apres-telechargement.png`, `06c-modifier.png`, `06d-modification-en-cours.png`, `06e-apres-modification.png` |
| 7 Studio IA | `07-studio-desktop.png`, `07b-generation-en-cours.png`, `07c-resultat.png` (échec), `07d-images-produits.png` |
| 8 Catalogue | `08-catalogue-desktop.png`, `08-catalogue-mobile.png`, `08b-fiche.png`, `08b-fiche-pleine.png` |
| 9 Boutiques | `09-boutiques-desktop.png`, `09c-boutique.png`, `09c-boutique-pleine.png`, `09d-apres-import.png`, `09e-apres-ajout.png` |
| 10 Formation | `10-formation-desktop.png`, `10-formation-mobile.png` |
| 11 Utilisation et Paramètres | `11-utilisation.png`, `11b-quota.png`, `11c-parametres.png`, `11d-parametres-0-Plan.png` à `11d-parametres-7-Legal.png` |
| 12 Abonnements | `12-abonnement-desktop.png`, `12-abonnement-mobile.png` |

Chaque capture a un fichier `.txt` du même nom, avec le texte visible, les boutons et les champs relevés.
