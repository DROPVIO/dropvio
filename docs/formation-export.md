# Formation Dropvio — export du contenu

Export établi le 2026-11-16 à partir du code de la copie `Documents/dropvio` (branche `retrait-langue-etapes`, avec les modifications locales non commitées). Les textes sont repris tels qu'ils sont dans le code et dans `messages/fr.json` (namespace `dashboard.formation`, sauf mention contraire). Rien n'a été modifié.

---

## 1. Pages, routes et fichiers concernés

### Pages

| Chemin | Fichier | Rôle |
|---|---|---|
| `/formation` | `app/formation/page.tsx` | Page de vente et, pour les formations achetées, liste des modules avec leur contenu dépliable. Publique (accessible sans compte). |
| `/formation/lire/[moduleId]` | `app/formation/lire/[moduleId]/page.tsx` | Lecture d'un module en vue paginée (format A4). Réservée aux acheteurs de la collection du module. |
| — | `app/formation/lire/[moduleId]/PagedReader.tsx` | Composant client de la vue paginée (Paged.js). |
| — | `app/formation/lire/[moduleId]/loading.tsx` | Écran de chargement de la vue paginée (spinner). |
| `/formation?success=1` | même page | Retour de Stripe après paiement réussi. |
| `/formation?canceled=1` | même page | Retour de Stripe après paiement annulé. |

### Routes API

| Route | Fichier | Rôle |
|---|---|---|
| `GET /api/formation?locale=…` | `app/api/formation/route.ts` | Liste des modules et collections possédées. Le contenu HTML n'est renvoyé que pour les collections possédées. Route publique (pas de 401). |
| `POST /api/formation/checkout` | `app/api/formation/checkout/route.ts` | Crée une session Stripe Checkout en mode paiement unique (`courte`, `longue` ou `bundle`). Connexion obligatoire. |
| `POST /api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` | Sur `checkout.session.completed` avec `payment_status = "paid"` : octroie l'accès (`grantFormationAccess`). |

### Logique et données

| Élément | Fichier | Rôle |
|---|---|---|
| Prix affichés, octroi d'accès | `lib/formation.ts` | `FORMATION_PRIX`, `collectionsDeOffre`, `grantFormationAccess` |
| Chargement des modules | `lib/formation-content.ts` | Lit les fichiers Markdown, les trie et les convertit en HTML |
| Prix Stripe | `lib/stripe.ts` | `getFormationPriceId` lit `STRIPE_PRICE_FORMATION_COURTE`, `STRIPE_PRICE_FORMATION_LONGUE` et `STRIPE_PRICE_FORMATION_BUNDLE` |
| Possession | `lib/supabase-server.ts` | `getServerUserAndPlan()` renvoie `formationOwned` à partir de `formation_achats` |
| Octroi manuel | `scripts/formation-grant.ts` | `npm run formation:grant -- <email> <courte\|longue\|bundle>` |
| Table | `supabase/migrations/020_formation_achats.sql` | Table `formation_achats` : `user_id`, `collection` (`courte` ou `longue`), `prix_paye_centimes`, identifiants Stripe, `achete_via` (`unitaire`, `bundle` ou `manuel`), unique par utilisateur et collection. Lecture par l'utilisateur seulement. |
| Ancienne colonne | `supabase/migrations/016_formation_access.sql` | `profils.formation_active` (ancien modèle « add-on abonnement »), **supprimée** par la migration 020. Aucune référence dans le code actuel. |
| Fichiers statiques | `public/formation/paged.min.js`, `public/formation/paged-reader.css`, `public/formation/README.md` | Bibliothèque Paged.js 0.4.3 et feuille de style de la vue paginée |

### Liens vers la Formation depuis le reste de l'app

| Où | Fichier | Libellé | Destination |
|---|---|---|---|
| Barre latérale (connecté) | `components/Sidebar.tsx` (`NAV_ITEMS`) | « Formation » (`dashboard.nav.itemFormation`), icône livre | `/formation` |
| Page d'abonnement | `app/abonnement/page.tsx` | « Voir la formation » (`abonnement.lienFormation`) | `/formation` |
| Bloc Expert de la tarification (landing) | `components/landing/TarifsSection.tsx` + `landing.pricing.expert.features[4]` | « Toutes les formations incluses » (texte, **pas un lien**) | — |
| Dashboard | — | non trouvé dans le code | — |
| `robots.txt` | `app/robots.ts` | `/formation` dans `disallow` | — |
| Middleware | `proxy.ts` | `/formation` hors des chemins protégés (commentaire : « page de vente publique ») | — |

---

## 2. Page `/formation` — sections dans l'ordre d'affichage

### 2.0 Mise en page

- **Visiteur non connecté :** la page s'affiche seule, sans barre latérale.
- **Utilisateur connecté :** la page s'affiche avec la barre latérale de l'app (`Sidebar`) et le tutoriel d'onboarding (`OnboardingProvider` et `OnboardingTour`). Cette mise en page est gérée par la page elle-même, pas par `AppShell`.
- **Pendant la vérification de la connexion :** un écran vide de la couleur du fond, sans texte.

### 2.1 En-tête

| Élément | Texte |
|---|---|
| Badge | « Formation » (`badge`) |
| Titre (h1) | « Formation dropshipping » (`title`) |
| Sous-titre | « Achat unique, accès à vie. Pas d'abonnement. » (`subtitle`) |

### 2.2 Bandeaux de retour de paiement

Ils sont affichés selon le paramètre d'URL, qui est ensuite retiré de l'adresse.

| Cas | Texte |
|---|---|
| `?success=1` | « Paiement reçu — l'accès s'active en quelques secondes. » (`bannerSuccess`). Un seul rechargement automatique des données a lieu 3 secondes plus tard. |
| `?canceled=1` | « Paiement annulé, rien n'a été débité. » (`bannerCanceled`) |

### 2.3 États de chargement et d'erreur

| Cas | Texte |
|---|---|
| Chargement | « Chargement… » (`dashboard.common.loading`) |
| Erreur de l'API `/api/formation` | message traduit du code d'erreur, sinon « Impossible de charger la formation. » (`errorLoad`) |
| Serveur injoignable | « Impossible de contacter le serveur. » (`errorServer`) |

### 2.4 Cartes de vente

Une carte par collection **non possédée** : la courte, puis la longue.

**Carte « Formation courte »**
- Titre : « Formation courte » (`courteTitre`)
- Accroche : « L'essentiel pour lancer une boutique qui tient, sans y passer des semaines. » (`courteAccroche`)
- Prix : « 24,99€ » (`FORMATION_PRIX.courte`)
- Public (italique) : « Pour ceux qui n'ont pas le temps de tout lire mais veulent des bases solides et applicables tout de suite. » (`courtePublic`)
- Liste à coches (`courteBullets`) :
  - Le calcul de marge complet à faire avant chaque lancement
  - Choisir un produit et un fournisseur fiable, avec méthode
  - Construire une fiche produit et une boutique qui convertissent
  - Trésorerie, cadre légal France et service client sans mauvaise surprise
  - Un condensé sérieux, pas un résumé superficiel
- Bouton : « Acheter — 24,99€ » (`buy`), puis « Redirection… » (`redirecting`) pendant la création du paiement. Il appelle `POST /api/formation/checkout` avec `{ offre: "courte" }`.

**Carte « Formation longue »**
- Titre : « Formation longue » (`longueTitre`)
- Accroche : « La méthode complète, approfondie, avec études de cas et grilles prêtes à l'emploi. » (`longueAccroche`)
- Prix : « 59,99€ » (`FORMATION_PRIX.longue`)
- Public (italique) : « Pour ceux qui veulent tout maîtriser en profondeur, avant de se lancer ou pour structurer une activité déjà démarrée. » (`longuePublic`)
- Liste à coches (`longueBullets`) :
  - Chaque sujet développé en profondeur, exemples chiffrés multiples
  - Études de cas complètes, anatomie des échecs les plus fréquents
  - Grilles d'évaluation fournisseurs, checklists boutique et lancement
  - Glossaire, sources, comparatif des canaux publicitaires
  - 26 parties pour construire une activité qui dure
- Bouton : « Acheter — 59,99€ » (`buy`), puis « Redirection… ». Il appelle le checkout avec `{ offre: "longue" }`.

**Carte « Les deux formations » (bundle)**

Elle est affichée tant que l'utilisateur ne possède pas les deux collections.
- Étiquette en coin : « MEILLEURE OFFRE » (`bundleBadge`)
- Titre : « Les deux formations » (`bundleTitle`)
- Description : « Version courte pour démarrer vite, version longue pour tout approfondir — l'accès aux deux, à vie. » (`bundleDesc`)
- Prix : « 69,99€ » (`FORMATION_PRIX.bundle`), à côté du prix barré « 84,98€ » (somme courte + longue) et de « économise 14,99€ » (`bundleSave`)
- Bouton : « Acheter le bundle — 69,99€ » (`buyBundle`), puis « Redirection… ». Il appelle le checkout avec `{ offre: "bundle" }`.

**Erreurs à l'achat**

Elles s'affichent dans une boîte d'alerte du navigateur (`alert()`).
- Erreur de l'API : message traduit du code (`formation_already_owned` : « Tu possèdes déjà cette formation. ») ; sinon « Impossible de démarrer le paiement. » (`errorCheckout`).
- Serveur injoignable : « Impossible de contacter le serveur. » (`errorServer`).
- Visiteur non connecté (réponse 401) : redirection vers `/login?redirect=/formation`, sans message.

### 2.5 Contenu des collections possédées

Pour chaque collection possédée (la courte, puis la longue) :
- un titre de section : « Formation courte » ou « Formation longue » ;
- une carte dépliable (`<details>`) par module, avec :
  - le titre du module (premier titre `#` du fichier, ou `title` du frontmatter) ;
  - une description (champ `description` du frontmatter, sinon premier paragraphe, coupé à 240 caractères) ;
  - un bouton « Lire → » (`read`) vers `/formation/lire/<id du module>` ;
  - une flèche ▾ pour déplier ;
  - une fois déplié, le contenu complet du module en HTML, avec un style adapté au thème clair ou sombre.

---

## 3. Page `/formation/lire/[moduleId]` (vue paginée)

| Élément | Texte ou comportement |
|---|---|
| Barre du haut, à gauche | Lien « ← Retour à la formation » (`readerBack`), vers `/formation` |
| Barre du haut, au centre | Titre du module |
| Pendant la mise en page | « Mise en page du document… » (`readerLoading`) |
| Erreur de mise en page | « Impossible de générer la vue paginée. Réessaie de recharger la page. » (`readerError`) |
| Rendu | Pages A4 blanches (210 × 297 mm) générées par Paged.js, avec le logo `/logo/logo-mono-black.svg` en bas à droite de chaque page (`public/formation/paged-reader.css`). Couleurs fixes, sans thème. |
| Chargement de la route | Spinner sur fond gris (`loading.tsx`) |

---

## 4. Modules et contenus

### Source

Tous les modules sont des **fichiers Markdown locaux**, dans le dépôt :
- français : `content/formation/courte/` et `content/formation/longue/` ;
- anglais : `content/formation/en/courte/` et `content/formation/en/longue/`, mêmes noms de fichiers. Tous les fichiers ont une version anglaise.
- espagnol et italien : **pas de traduction**, le contenu est servi en français.

Ils sont convertis en HTML au démarrage du serveur (`gray-matter`, `remark`, `remark-html`). Rien n'est stocké dans Supabase et aucun contenu externe n'est chargé.

**Ordre :** d'abord le numéro en tête du nom de fichier ; à défaut, le numéro qui suit `partie-` ; sinon, en dernier. L'identifiant d'un module est `<collection>-<nom du fichier sans extension>`.

**Vidéos, PDF et fichiers téléchargeables : non trouvé dans le code.** La vue paginée est seulement une lecture à l'écran : il n'y a pas de bouton de téléchargement ni d'impression.

### Formation courte — 17 modules

| Id | Titre | Fichier | Anglais | Mots (FR) |
|---|---|---|---|---|
| `courte-00-avant-propos-et-sources` | Avant-propos | `content/formation/courte/00-avant-propos-et-sources.md` | oui | 278 |
| `courte-formation-courte-partie-1-5` | Formation Dropshipping — Version courte | `content/formation/courte/formation-courte-partie-1-5.md` | oui | 1491 |
| `courte-formation-courte-partie-6-10` | Formation Dropshipping — Version courte (suite) | `content/formation/courte/formation-courte-partie-6-10.md` | oui | 1148 |
| `courte-formation-courte-partie-11-15` | Formation Dropshipping — Version courte (suite 2) | `content/formation/courte/formation-courte-partie-11-15.md` | oui | 864 |
| `courte-formation-courte-partie-16-19` | Formation Dropshipping — Version courte (suite 3) | `content/formation/courte/formation-courte-partie-16-19.md` | oui | 631 |
| `courte-20-etude-de-cas-condensee` | Partie 20 — Étude de cas condensée : une année de boutique | `content/formation/courte/20-etude-de-cas-condensee.md` | oui | 532 |
| `courte-22-produits-complementaires-et-outils` | Partie 22 — Construire une gamme complémentaire qui se vend elle-même | `content/formation/courte/22-produits-complementaires-et-outils.md` | oui | 571 |
| `courte-24-exemples-chiffres-complementaires` | Partie 24 — Deux exemples de marge supplémentaires, pour ancrer la méthode | `content/formation/courte/24-exemples-chiffres-complementaires.md` | oui | 688 |
| `courte-26-tresorerie-exemple-et-legal` | Partie 26 — Lire un mois de trésorerie sur un exemple chiffré | `content/formation/courte/26-tresorerie-exemple-et-legal.md` | oui | 549 |
| `courte-28-gerer-une-crise` | Partie 28 — Gérer une crise fournisseur ou financière sans paniquer | `content/formation/courte/28-gerer-une-crise.md` | oui | 505 |
| `courte-29-les-dix-premiers-clients` | Partie 29 — Les tout premiers clients : ce qui compte différemment | `content/formation/courte/29-les-dix-premiers-clients.md` | oui | 463 |
| `courte-30-conclusion` | Conclusion — Ce qu'il faut retenir de cette formation | `content/formation/courte/30-conclusion.md` | oui | 340 |
| `courte-31-saisonnalite` | Partie 31 — Anticiper la saisonnalité plutôt que la subir | `content/formation/courte/31-saisonnalite.md` | oui | 549 |
| `courte-33-recapitulatif-final` | Partie 33 — Récapitulatif final : la méthode complète en un seul endroit | `content/formation/courte/33-recapitulatif-final.md` | oui | 680 |
| `courte-34-faq-avancee` | Partie 34 — Questions fréquentes, suite | `content/formation/courte/34-faq-avancee.md` | oui | 768 |
| `courte-36-erreurs-frequentes` | Partie 36 — Les erreurs les plus fréquentes, formulées comme des mises en garde directes | `content/formation/courte/36-erreurs-frequentes.md` | oui | 525 |
| `courte-formation-courte-annexes` | Formation Dropshipping — Version courte : annexes pratiques | `content/formation/courte/formation-courte-annexes.md` | oui | 846 |

### Formation longue — 36 modules

| Id | Titre | Fichier | Anglais | Mots (FR) |
|---|---|---|---|---|
| `longue-00-avant-propos` | Avant-propos | `content/formation/longue/00-avant-propos.md` | oui | 321 |
| `longue-01-fondations-realite-du-marche` | Partie 1 — Fondations du dropshipping et réalité du marché | `content/formation/longue/01-fondations-realite-du-marche.md` | oui | 1403 |
| `longue-02-trouver-produit-gagnant` | Partie 2 — Trouver et valider un produit gagnant | `content/formation/longue/02-trouver-produit-gagnant.md` | oui | 1194 |
| `longue-02b-produit-etude-de-cas` | Partie 2 (complément) — Étude de cas complète : de l'idée au choix final | `content/formation/longue/02b-produit-etude-de-cas.md` | oui | 877 |
| `longue-03-pricing-et-marges` | Partie 3 — Fixer ses prix et calculer sa vraie marge | `content/formation/longue/03-pricing-et-marges.md` | oui | 1318 |
| `longue-03b-pricing-exemples-chiffres` | Partie 3 (complément) — Trois calculs de marge entièrement déroulés | `content/formation/longue/03b-pricing-exemples-chiffres.md` | oui | 1189 |
| `longue-04-boutique-qui-convertit` | Partie 4 — Construire une boutique qui convertit | `content/formation/longue/04-boutique-qui-convertit.md` | oui | 1087 |
| `longue-04b-boutique-checklist-audit` | Partie 4 (complément) — Grille d'audit complète d'une fiche produit | `content/formation/longue/04b-boutique-checklist-audit.md` | oui | 880 |
| `longue-05-fournisseurs-et-logistique` | Partie 5 — Fournisseurs et logistique : rester fiable | `content/formation/longue/05-fournisseurs-et-logistique.md` | oui | 908 |
| `longue-05b-fournisseurs-grille-evaluation` | Partie 5 (complément) — Grille d'évaluation d'un fournisseur avant premier engagement | `content/formation/longue/05b-fournisseurs-grille-evaluation.md` | oui | 650 |
| `longue-06-acquisition-et-marketing` | Partie 6 — Acquisition et marketing | `content/formation/longue/06-acquisition-et-marketing.md` | oui | 748 |
| `longue-06b-acquisition-budget-exemple` | Partie 6 (complément) — Construire et lire un budget d'acquisition sur ses premières semaines | `content/formation/longue/06b-acquisition-budget-exemple.md` | oui | 655 |
| `longue-07-service-client-retours-litiges` | Partie 7 — Service client, retours et litiges | `content/formation/longue/07-service-client-retours-litiges.md` | oui | 978 |
| `longue-07b-service-client-modeles-reponses` | Partie 7 (complément) — Quatre modèles de réponse à adapter, jamais à copier tels quels | `content/formation/longue/07b-service-client-modeles-reponses.md` | oui | 623 |
| `longue-08-finances-et-tresorerie` | Partie 8 — Finances et trésorerie : rester stable | `content/formation/longue/08-finances-et-tresorerie.md` | oui | 823 |
| `longue-08b-tresorerie-exemple-mensuel` | Partie 8 (complément) — Lire un mois de trésorerie sur un exemple chiffré | `content/formation/longue/08b-tresorerie-exemple-mensuel.md` | oui | 573 |
| `longue-09-cadre-legal-fiscal-france` | Partie 9 — Cadre légal et fiscal en France | `content/formation/longue/09-cadre-legal-fiscal-france.md` | oui | 1042 |
| `longue-09b-legal-checklist-lancement` | Partie 9 (complément) — Check-list administrative avant le premier lancement public | `content/formation/longue/09b-legal-checklist-lancement.md` | oui | 554 |
| `longue-10-scaler-et-perenniser` | Partie 10 — Scaler et pérenniser son activité | `content/formation/longue/10-scaler-et-perenniser.md` | oui | 794 |
| `longue-10b-scaler-signaux-a-surveiller` | Partie 10 (complément) — Tableau des signaux à surveiller avant qu'ils ne deviennent des problèmes | `content/formation/longue/10b-scaler-signaux-a-surveiller.md` | oui | 529 |
| `longue-11-etude-de-cas-narrative` | Partie 11 — Une année dans la vie d'une boutique, du lancement à la stabilité | `content/formation/longue/11-etude-de-cas-narrative.md` | oui | 1009 |
| `longue-12-glossaire` | Partie 12 — Glossaire complet des termes du dropshipping | `content/formation/longue/12-glossaire.md` | oui | 627 |
| `longue-13-anatomie-echec` | Partie 13 — Anatomie d'un échec : ce que les boutiques qui ferment ont en commun | `content/formation/longue/13-anatomie-echec.md` | oui | 689 |
| `longue-14-canaux-publicitaires-comparaison` | Partie 14 — Comparer les canaux publicitaires : ce qui les distingue réellement | `content/formation/longue/14-canaux-publicitaires-comparaison.md` | oui | 599 |
| `longue-15-psychologie-achat` | Partie 15 — Comprendre pourquoi un visiteur achète, ou n'achète pas | `content/formation/longue/15-psychologie-achat.md` | oui | 596 |
| `longue-16-boite-a-outils-dropvio` | Partie 16 — La boîte à outils : où chaque fonctionnalité de Dropvio s'inscrit dans la méthode | `content/formation/longue/16-boite-a-outils-dropvio.md` | oui | 726 |
| `longue-17-fidelisation-et-retention` | Partie 17 — Fidéliser plutôt que reconquérir à chaque fois | `content/formation/longue/17-fidelisation-et-retention.md` | oui | 568 |
| `longue-18-organisation-et-temps` | Partie 18 — S'organiser quand on gère une activité seul | `content/formation/longue/18-organisation-et-temps.md` | oui | 614 |
| `longue-19-plan-action-90-jours` | Partie 19 — Plan d'action sur 90 jours | `content/formation/longue/19-plan-action-90-jours.md` | oui | 544 |
| `longue-20-faq-generale` | Partie 20 — Questions fréquentes | `content/formation/longue/20-faq-generale.md` | oui | 608 |
| `longue-21-sources-et-bibliographie` | Partie 21 — Sources et bibliographie | `content/formation/longue/21-sources-et-bibliographie.md` | oui | 653 |
| `longue-22-niche-vs-generaliste` | Partie 22 — Boutique de niche ou boutique généraliste : un choix structurant | `content/formation/longue/22-niche-vs-generaliste.md` | oui | 563 |
| `longue-23-expedition-internationale-douanes` | Partie 23 — Expédition internationale et douanes : ce qu'il faut anticiper | `content/formation/longue/23-expedition-internationale-douanes.md` | oui | 627 |
| `longue-24-produits-complementaires-gamme` | Partie 24 — Construire une gamme de produits complémentaires qui se vend elle-même | `content/formation/longue/24-produits-complementaires-gamme.md` | oui | 716 |
| `longue-25-saisonnalite-et-calendrier` | Partie 25 — Anticiper la saisonnalité plutôt que la subir | `content/formation/longue/25-saisonnalite-et-calendrier.md` | oui | 565 |
| `longue-26-deuxieme-etude-de-cas-echec-evite` | Partie 26 — Second cas pratique : un signal d'alerte pris à temps | `content/formation/longue/26-deuxieme-etude-de-cas-echec-evite.md` | oui | 682 |

Le texte complet des leçons n'est pas recopié ici : il se trouve dans les fichiers ci-dessus.

---

## 5. Règles d'accès

L'accès ne dépend **pas du plan** (Pro, Agency, Expert ou aucun plan). Il dépend **uniquement des achats** enregistrés dans `formation_achats`, une ligne par collection.

| Situation | Ce qui est visible | Message |
|---|---|---|
| Non connecté | Cartes de vente des deux collections et du bundle. L'API renvoie la liste des modules sans leur contenu. | Au clic sur « Acheter… » : redirection vers `/login?redirect=/formation`, sans message |
| Connecté, aucun achat | Les mêmes cartes, dans la mise en page de l'app (barre latérale) | — |
| A acheté la courte | Cartes « Formation longue » et bundle, puis section « Formation courte » avec ses 17 modules | — |
| A acheté la longue | Cartes « Formation courte » et bundle, puis section « Formation longue » avec ses 36 modules | — |
| A acheté les deux (bundle ou deux achats) | Plus aucune carte de vente ; les deux sections de modules | — |
| Tente d'acheter une offre déjà possédée | Refus du serveur | « Tu possèdes déjà cette formation. » (alerte) |
| Paiement non configuré côté serveur | Refus du serveur | « Le paiement n'est pas encore configuré. » (`apiErrors.payment_not_configured`, alerte) |
| Offre invalide ou session Stripe impossible | Refus du serveur | « Offre invalide. » ou « Impossible de créer la session de paiement. » (`apiErrors`, alerte) |
| Plan Expert | **Aucun accès particulier dans le code** : un abonné Expert doit acheter comme les autres | — (voir incohérences) |
| `/formation/lire/<id>` sans posséder la collection, ou non connecté | Redirection vers `/formation` | aucun message |
| `/formation/lire/<id>` avec un id inexistant | Page 404 | page 404 standard |
| Octroi manuel (support) | Accès comme après un achat | `scripts/formation-grant.ts` (`achete_via = "manuel"`) |

**Paiement.** Stripe Checkout en mode `payment` (achat unique, jamais d'abonnement). L'accès est octroyé par le webhook seulement si `payment_status = "paid"`. Le bundle octroie les deux collections.

---

## 6. Prix

| Offre | Prix affiché | Source de l'affichage | Prix réellement débité |
|---|---|---|---|
| Formation courte | 24,99€ | `FORMATION_PRIX` dans `app/formation/page.tsx` (copie locale) et dans `lib/formation.ts` | Price Stripe dans `STRIPE_PRICE_FORMATION_COURTE` |
| Formation longue | 59,99€ | idem | `STRIPE_PRICE_FORMATION_LONGUE` |
| Bundle | 69,99€ (barré : 84,98€, « économise 14,99€ ») | idem, le prix barré et l'économie étant calculés | `STRIPE_PRICE_FORMATION_BUNDLE` |

Le montant des Prices Stripe n'est pas lisible dans le code : il faut le vérifier dans Stripe. `lib/formation.ts` précise que les prix affichés doivent rester synchronisés à la main avec Stripe.

---

## 7. Composants d'interface

| Composant | Où | Détail |
|---|---|---|
| Badge arrondi | En-tête | Pastille violette « Formation » |
| Bandeau d'information | Retour de paiement | Vert (succès) ou gris (annulation), centré |
| Carte de vente | Section 2.4 | Carte arrondie : titre, accroche, prix, public en italique, liste à coches ✓, bouton pleine largeur en dégradé violet |
| Carte bundle | Section 2.4 | Carte en dégradé violet, étiquette « MEILLEURE OFFRE » en coin, prix et prix barré, bouton violet |
| Carte dépliable de module | Section 2.5 | Élément `<details>`, titre, description, bouton « Lire → », flèche ▾, contenu Markdown rendu avec le style `prose` |
| Barre latérale | Utilisateur connecté | `components/Sidebar.tsx` (entrée « Formation ») |
| Tutoriel d'onboarding | Utilisateur connecté | `OnboardingProvider` et `OnboardingTour` |
| Lecteur paginé | `/formation/lire/[moduleId]` | Barre du haut sombre, pages A4 blanches avec ombre (Paged.js) |
| Alerte navigateur | Erreurs d'achat | `alert()` natif |

---

## 8. Éléments obsolètes ou incohérents (non corrigés)

1. **« Toutes les formations incluses » pour le plan Expert** : c'est affiché dans la tarification (fr, en, es, it), mais aucun code ne donne accès aux formations aux abonnés Expert. L'accès vient seulement de `formation_achats` (achat Stripe ou octroi manuel).
2. **Prix en double** : `FORMATION_PRIX` est défini à la fois dans `app/formation/page.tsx` et dans `lib/formation.ts`. Les prix sont aussi à synchroniser à la main avec les Prices Stripe.
3. **Format de prix figé** : « 24,99€ » (virgule, sans espace) est affiché dans toutes les langues, y compris en anglais.
4. **Contenu non traduit en espagnol et en italien** : l'interface est traduite, mais les leçons s'affichent en français pour ces langues.
5. **Ordre de la formation courte** :
   - la « Conclusion » (fichier 30) apparaît avant les parties 31, 33, 34 et 36, puis les annexes ;
   - la numérotation saute de 20 à 22, 24, 26, 28 (il manque 21, 23, 25, 27, 32 et 35) ;
   - les quatre premiers chapitres ont des titres génériques (« Version courte (suite) », « (suite 2) »…).
6. **Doublons de titres entre les deux collections** : « Lire un mois de trésorerie sur un exemple chiffré » (courte 26 et longue 08b), « Anticiper la saisonnalité plutôt que la subir » (courte 31 et longue 25), et la gamme complémentaire (courte 22 et longue 24). C'est peut-être voulu (version condensée).
7. **`robots.txt` exclut `/formation`**, alors que c'est décrit comme une page de vente publique : elle n'est pas indexée par les moteurs de recherche.
8. **Erreurs d'achat dans `alert()`** : ailleurs dans l'app, les alertes ont été remplacées par des messages intégrés (commit « remplacer les alert() »).
9. **Retour de paiement** : un seul rechargement automatique au bout de 3 secondes. Si le webhook Stripe est plus lent, l'accès n'apparaît qu'après un rechargement manuel.
10. **Ancien modèle** : la migration 016 (`profils.formation_active`, formation en option d'abonnement) est remplacée par la 020. La colonne est supprimée et aucun code ne s'en sert. Rien d'actif, mais la 016 reste dans le dossier.
11. **Plan Free** : aucune mention du plan Free n'a été trouvée dans les textes de la Formation. Seuls des commentaires de code y font allusion (« plus de restriction de plan »).
12. **Lien depuis le dashboard** : non trouvé dans le code. La Formation n'est accessible que par la barre latérale et la page d'abonnement.
