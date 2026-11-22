# Rapport de modifications

## Séance du 21 nov. au soir

Branche : `fix/sans-plan-free-et-corrections` (créée depuis `fix/textes-securite-landing`). Aucun
push. Un commit par étape, en français.

### Étapes

| Étape | Statut | Fichiers principaux | Commit |
|---|---|---|---|
| 0. Travail en cours antérieur isolé | Fait | 232 fichiers des sessions du 20-21 nov., aucun secret | `21b3f06` |
| 1. Migrations alignées sur la base | Fait (rien exécuté) | `supabase/migrations/059` (rôle effectif), `060` à `063` | `d5955c2` |
| 2. Suppression du plan Free | Fait | `lib/plan-limits.ts`, `lib/plan-effectif.ts`, `lib/supabase-server.ts`, routes `app/api/*`, `components/Sidebar.tsx`, `components/ParametresModal.tsx`, `app/dashboard/page.tsx`, `app/abonnement/page.tsx`, `lib/abonnement.ts`, `lib/expert-billing.ts`, `proxy.ts`, `messages/*.json` | `29ac3ff` |
| 3. `middleware.ts` → `proxy.ts` | Fait | `proxy.ts`, références dans `next.config.ts`, `lib/locale.ts`, `i18n/request.ts`, `app/layout.tsx`, `docs/formation-export.md` | `80c617b` |
| 4. Sécurité FO1 à FO6 | Fait (FO5 : réglage Supabase) | `lib/api-errors.ts`, `lib/fetch-sur.ts`, `lib/media/images-produits.ts`, `app/api/sites-generes/[id]/route.ts`, `SECURITE_AUDIT.md` | `adfe9ae` |
| 5. Mise en page | Fait (pages publiques seulement capturées) | `components/AppShell.tsx`, `components/Sidebar.tsx`, `scripts/captures-mise-en-page.mjs`, `docs/captures/avant`, `docs/captures/apres` | `54aedaf` |
| 6. Oublis | Fait | `app/abonnement/page.tsx`, `app/api/abonnement/route.ts`, `app/formation/page.tsx`, `components/formation/FormationContenu.tsx`, `components/studio/GenerateurMedia.tsx`, métadonnées des pages publiques | `2abe5da` |
| 7. Vouvoiement | Fait | `messages/fr.json` (317 messages), `content/formation/courte` et `longue` (37 fichiers), 146 messages d'API | `f4a666b`, `d8bea67` |
| 8. Landing | Vérifiée | `scripts/verifier-landing.mjs` | `af2936e` |
| 9. Vérifications finales | Faites | — | — |
| 10. Rapport | Fait | ce fichier | dernier commit |

### Détail par étape

**Étape 1.** Les fichiers 059 à 063 reproduisent exactement l'état de la base, vérifié en lecture
seule avant écriture : contrainte de plan, colonne `plan` sans défaut, fonctions et policies.

**Étape 2 — plus de plan Free.**
- **Types et limites :** `type Plan = "pro" | "agency" | "expert"` et `PlanOuAucun = Plan | null`.
  `limitesDuPlan`, `budgetIaEur`, `budgetImagesEur` et `stockageMaxOctets` renvoient 0 sans plan.
- **Règle commune :** `planEffectif` (Expert sans période en cours → null, valeur inconnue →
  null) sert au proxy, à `resolvePlan` et aux tests (5 cas).
- **Routes :** sans plan, le catalogue répond 403 `abonnement_requis`, l'ajout de produits
  `abonnement_requis_produits` et les autres outils `abonnement_requis_outil`. Messages traduits
  dans les 4 langues.
- **Interface :** la barre latérale et la carte « Plan actuel » du dashboard lisent le plan
  réellement en vigueur (`/api/plan`). Sans plan, elles affichent « Aucun abonnement » et un lien
  « Choisir un abonnement ».
- **Stripe** (seules les lignes qui écrivaient `free`) : `lib/abonnement.ts` et
  `lib/expert-billing.ts` écrivent maintenant `plan = null`.
- **Essai gratuit :** il est géré par Stripe (statut `trialing`). Aucun libellé « Free » de
  l'interface ne s'y rapportait : il n'y avait rien à renommer en « Essai ».
- **Tarifs :** il n'y avait aucune carte Free sur la landing, `/abonnement` ou `/expert`, ni de
  question sur un plan gratuit dans la FAQ.
- **Résultat de la recherche demandée** (`grep -rniE "['\"]free['\"]|plan.?free|catalogue_free|PlanFree|planFree" app components lib proxy.ts messages`) :
  aucune ligne. Les anciennes migrations gardent le mot, elles n'ont pas été modifiées.

**Étape 3.** Le codemod a créé `proxy.ts` avec la fonction `proxy` et le même `matcher`, et il
n'existe plus de `middleware.ts`. L'avertissement « The "middleware" file convention is
deprecated » n'apparaît plus. Test de fumée : `/` → 200 ; `/dashboard`, `/produits-gagnants`,
`/quota` et `/abonnement` sans session → 307 vers `/login`.

**Étape 4.** Détail dans `SECURITE_AUDIT.md` (tableau FO1 à FO6). En bref :
- **FO1 :** 89 réponses 500 passent par `erreurServeur`, qui renvoie un message générique avec une
  référence, et écrit le détail dans les logs ;
- **FO2 :** 401 sans session ;
- **FO3 :** migration 060 ;
- **FO4 :** `fetchSur` (undici 8.7.0, la même version que le `fetch` de Node, `dispatcher` +
  `lookup` fixé), utilisé par Spy, l'audit depuis une URL et la photo de référence envoyée à
  OpenAI ;
- **FO6 :** seul l'hôte exact du projet Supabase est accepté.

**Étape 5 — mise en page.**
- **Desktop (≥ 1024 px) :** la barre latérale est une colonne fixe. Le contenu est décalé de
  `var(--largeur-barre)`, soit 260 px étendue ou 64 px repliée ; il n'y a plus de 260 px en dur.
  L'état replié est mémorisé (localStorage dans un try/catch).
- **Mobile (< 1024 px) :** le tiroir est un `<dialog>` ouvert par `showModal()`, avec le libellé
  « Navigation ». Échap, un clic sur le fond ou sur un lien le ferment. Le focus revient au bouton
  et la page derrière ne défile pas. Le bouton est en haut à gauche sur toutes les pages de
  l'outil, `/formation` comprise pour un compte connecté.
- **Référence 5dc350d :** mêmes largeurs (260 et 64 px) et même hauteur d'en-tête (57 px) que la
  version actuelle. Rien à reprendre côté alignement. Les seules différences depuis sont les
  couleurs du thème sombre, conservées.
- **Captures :** 10 pages × 4 largeurs (375, 768, 1280, 1440), dans `docs/captures/avant` et
  `docs/captures/apres`, avec un fichier `mesures.json` par dossier. Aucun défilement horizontal
  dans les 40 cas.
  - Il n'y a pas de compte de test local : les pages de l'outil redirigent vers `/login`, et la
    barre latérale n'a donc pas pu être capturée.
  - Les captures « après » sont prises en mode « mouvement réduit », sinon les sections animées de
    la landing apparaissent vides.

**Étape 6.**
- **Carte « Reprendre Expert » sur `/abonnement` :** affichée quand `plan = expert` en base sans
  période en cours. Elle mène à `/expert` ; aucun nouvel endpoint de paiement.
- **`/formation` :** a maintenant son titre et sa description (page serveur autour du contenu
  client).
- **Pages publiques :** titres et descriptions dans les bornes demandées, sauf le titre français
  de la formation (voir les décisions).
- **Lien « Quota » du Studio :** traduit.
- **Lint :** 0 avertissement. Les 3 avertissements d'origine sont corrigés :
  - `orders` inutilisé : retiré ;
  - `handleConfirmerContenu` : code mort, supprimé ;
  - `fetchBoutiques` : passé en `useCallback`.

**Étape 7 — vouvoiement.**
- **`messages/fr.json` :** 317 messages réécrits. Mêmes variables et balises vérifiées
  automatiquement pour chacun.
- **Formation française :** 37 fichiers, avec une conjugaison explicite de chaque verbe.
- **Code :** 146 messages d'API passés au vouvoiement.
- **Titre de la landing :** conservé tel quel.
- **Espagnol et italien :** déjà cohérents au tutoiement (aucun « usted » ni « Lei »).
- **Comparaison des clés :** 2 397 clés dans chacune des 4 langues, aucune manquante. La seule
  différence de variables (`studio.produits.lancer`) est un faux positif : une forme de pluriel
  `=0`.
- **Cas de tutoiement conservés volontairement :**
  - `messages/fr.json`, section `legal.confidentialite` : page confidentialité, hors périmètre ;
  - « ton » au sens du ton d'une marque : `siteBuilder.builder.composer.placeholder`
    (« textes, ton, ambiance »), `content/formation/longue/07b`, `10-scaler`, `12-glossaire`, et
    « Ton et vocabulaire… » dans `app/api/generate-site/route.ts` ;
  - consignes envoyées à l'IA (« Tu es un développeur… », « Base-toi… »), jamais affichées :
    `app/api/generate-site`, `generer-contenu`, `reecrire-produits`, `ajuster-prix`,
    `trier-produits`, `audit-site/html`, `generer-texte-produit`, `inspiration`, `modifier-site`,
    `avis-capture`, `lib/cadre-createur-site.ts`, `lib/pages-produit.ts`, `lib/avis-produit.ts`,
    `lib/audit-site-prompt.ts` ;
  - citation d'un slogan publicitaire « deviens riche en dropshipping » dans
    `content/formation/longue/01-fondations-realite-du-marche.md` ;
  - « Supprime définitivement la boutique… » : description à la 3e personne de ce que fait
    l'action, pas une adresse à l'utilisateur.
- **Longueur des textes :** pas de débordement visible sur les captures des pages publiques. Les
  pages de l'outil n'ont pas pu être capturées (pas de compte de test) : à vérifier lors de tes
  tests.

**Étape 8.**
- Aucune carte Free à retirer ; landing au vouvoiement.
- 10 liens internes testés, aucun mort ; un seul h1 ; aucune image sans `alt`.
- Prix de la section tarifs : 29 € (Pro), 59 € (Agency), « à partir de 59 € » (Expert). Ce sont
  deux offres différentes, pas un prix affiché deux fois. Aucun prix modifié.

### Vérifications finales (étape 9)

- `npx tsc --noEmit` : 0 erreur.
- `npm run lint` : 0 erreur, 0 avertissement.
- `npm test` : 190 tests, 189 réussis, 0 échec, 1 ignoré (test déjà marqué « à confirmer » sur
  `TOKENS_PAR_SITE_FABLE`).
- `npm run build` : réussi (97 pages générées). Un seul avertissement, qui existait déjà : Next
  déduit la racine du projet car il trouve un `package-lock.json` vide (84 octets) dans
  `/Users/lenny`, hors du projet. Il ne casse rien. Pour le faire disparaître, supprimez ce
  fichier : je n'y ai pas touché, c'est un fichier hors du projet.
- Test de fumée (serveur de dev) :

| Chemin | Statut |
|---|---|
| `/`, `/formation`, `/faq`, `/expert`, `/boutiques`, `/login` | 200 |
| `/abonnement`, `/dashboard`, `/produits-gagnants`, `/site-builder`, `/quota`, `/studio`, `/mes-sites` sans session | 307 → `/login` |
| `/api/sites-generes/[id]` sans session | 401 |
| `/api/catalogue` sans session | 401 |
| `/api/webhooks/stripe` sans signature | 400 |

| Page | Titre (caractères) | Description (caractères) |
|---|---|---|
| `/` | 60 | 155 |
| `/formation` | 62 | 154 |
| `/faq` | 54 | 160 |
| `/expert` | 54 | 158 |
| `/boutiques` | 57 | 157 |

### Décisions prises seul

1. **Branche :** créée depuis `fix/textes-securite-landing`, la branche de travail en cours, plutôt
   que depuis `main`.
2. **Plan pas encore chargé et absence de plan :** dans le Studio et la page boutique du Site
   Builder, `null` voulait dire « plan pas encore chargé ». J'ai ajouté un indicateur « plan
   chargé » séparé, pour qu'un compte sans plan ne reste pas bloqué sur « Chargement ».
3. **Plan affiché :** la barre latérale et le dashboard lisent le plan en vigueur via `/api/plan`
   (une requête de plus), pour qu'un Expert expiré n'apparaisse plus comme « Expert ».
4. **Le titre français de la formation fait 62 caractères :** tu l'as imposé mot pour mot, donc je
   l'ai gardé malgré la limite de 60. Les titres des autres langues respectent la limite.
5. **undici :** ajouté en version 8.7.0, la même que celle embarquée par Node, et utilisé avec son
   propre `fetch`, pour éviter une incompatibilité entre `dispatcher` et `fetch`.
6. **Photo de référence OpenAI :** elle suit maintenant les redirections, chacune revalidée par
   `fetchSur`, au lieu de les refuser ; la liste d'hôtes autorisés reste appliquée avant. Le
   téléchargement passe par un point d'injection, ce qui garde les tests hors réseau.
7. **Playwright :** ajouté en devDependency (1.62.1), la version du navigateur déjà en cache.
8. **FO2 :** testé par un appel HTTP sur le serveur, et non par un test unitaire. La route dépend
   des cookies de Next, difficiles à simuler hors requête.
9. **Erreurs Shopify** (`err.message` dans `shopify-push`) : laissées telles quelles, la logique
   Shopify étant hors périmètre.
10. **Code mort supprimé :** `handleConfirmerContenu` (page boutique), qui n'était appelé nulle
    part, pour supprimer l'avertissement de lint.
11. **Captures :** prises en mode « mouvement réduit », pour que les sections animées soient
    visibles.
12. **E-mails :** l'application n'envoie elle-même aucun e-mail. Ceux d'authentification sont
    configurés dans Supabase : leur texte n'est pas dans le dépôt.

### Migrations nouvelles à appliquer

Aucune. Les fichiers 059 à 063 décrivent l'état déjà appliqué en base.

### À faire dans le dashboard Supabase (FO5)

- **Authentication > Rate Limits :** garder les limites par défaut, ou les baisser.
- **SMTP personnalisé :** à brancher avant le lancement. La limite d'envoi d'e-mails par défaut de
  Supabase est très basse, et des inscriptions resteraient sans e-mail de confirmation.
- **CAPTCHA (Turnstile) :** envisageable plus tard sur l'inscription et la connexion.

### Reste hors périmètre

Stripe (sauf les lignes qui écrivaient « free »), Shopify, Vercel, mentions légales, CGU, CGV,
politique de confidentialité.

### Nouveautés depuis le 26 octobre (conservées)

Expliquées simplement : ce que c'est, où c'est, à quoi ça sert, ce qui a changé.

- **Menu de navigation sur téléphone.**
  - Où : en haut à gauche de toutes les pages de l'outil, sur téléphone et tablette.
  - À quoi ça sert : le menu s'ouvre en panneau par-dessus la page.
  - Ce qui a changé : avant, la barre de gauche écrasait le contenu sur petit écran. Elle se ferme
    d'un clic à côté, avec la touche Échap ou en choisissant une page.
- **Barre de gauche repliable qui se souvient de votre choix.**
  - Où : bouton « Réduire » en bas de la barre, sur ordinateur.
  - À quoi ça sert : gagner de la place ; votre choix est gardé d'une visite à l'autre.
  - Ce qui a changé : le contenu se cale exactement sur la largeur de la barre, qu'elle soit
    ouverte ou réduite.
- **Sous-menus dans la barre de gauche.**
  - Où : « Produits gagnants » et « Site Builder » s'ouvrent pour montrer leurs pages (par exemple
    « Mes sites »).
  - À quoi ça sert : retrouver vite une page liée sans encombrer la barre.
- **Cloche des ventes.**
  - Où : en haut à droite des pages de l'outil.
  - À quoi ça sert : un compteur signale les nouvelles ventes Shopify ; un clic ouvre la liste.
- **Page « Mes ventes ».**
  - Où : menu « Ventes ».
  - À quoi ça sert : les commandes reçues sur votre boutique, 50 par page, à passer chez le
    fournisseur puis à marquer « commandée ».
- **Bandeau de paiement à régulariser.**
  - Où : en haut des pages de l'outil, seulement quand c'est nécessaire.
  - À quoi ça sert : prévient si le renouvellement Expert attend une validation bancaire ou si la
    carte est refusée.
- **Studio IA et médiathèque.**
  - Où : menu « Studio ».
  - À quoi ça sert : créer des images de produits avec l'IA et retrouver toutes vos images (créées
    ou importées) au même endroit.
  - Un indicateur montre les crédits restants et l'heure de reprise si une pause s'applique.
- **Catalogue et photos des produits.**
  - Où : « Produits gagnants » → « Catalogue ».
  - À quoi ça sert : choisir la photo principale et la galerie d'un produit, depuis votre
    médiathèque ou votre ordinateur, avant de l'envoyer en boutique.
- **Choix des photos du site.**
  - Où : Site Builder, sous la barre de saisie.
  - À quoi ça sert : choisir la source des photos (photos du produit, médiathèque, liens ou
    génération par l'IA) et leur nombre.
  - Ce qui a changé : la génération par IA n'est plus qu'une option parmi d'autres.
- **Aperçu téléphone du site généré.**
  - Où : étape « Résultat » du Site Builder.
  - À quoi ça sert : un cadre de téléphone montre le site à la vraie taille d'un iPhone.
- **Budget IA du mois dans le Site Builder.**
  - Où : sous la génération de landing page.
  - À quoi ça sert : montre ce qu'il reste du budget IA du mois et le nombre de sites créés.
- **Galerie photo sur les fiches produit des boutiques publiques.**
  - Où : fiche produit d'une boutique en ligne.
  - À quoi ça sert : une grande image et des miniatures pour passer d'une photo à l'autre.
- **Courbes « période actuelle contre période précédente ».**
  - Où : dashboard.
  - À quoi ça sert : comparer l'activité avec la période précédente de même durée, avec la
    variation en pourcentage.
- **Pages « Plan Expert » et « Quota ».**
  - Où : `/expert` (publique) et menu « Quota » (abonnés Expert).
  - À quoi ça sert : composer son mois Expert avec le prix calculé en direct, suivre sa
    consommation et racheter des crédits.
- **Page de choix d'abonnement.**
  - Où : `/abonnement`.
  - À quoi ça sert : choisir Pro ou Agency avec l'essai de 3 jours.
  - Ce qui a changé : nouvelle carte « Reprendre Expert » pour un abonnement Expert terminé.
- **Thème sombre plus clair.**
  - Où : partout dans l'outil en mode sombre.
  - À quoi ça sert : des fonds légèrement plus clairs et des textes secondaires plus contrastés,
    pour une meilleure lisibilité.

---

## Séances précédentes — 20 et 21 novembre 2026

Branche : `fix/textes-securite-landing`. Ce rapport couvre les 10 tâches et l'audit de sécurité
(détaillé dans `SECURITE_AUDIT.md`).

## Mise à jour — 21 novembre, deuxième série

### Tâche 1 — design de référence
Liste des 15 derniers commits qui touchent au design affichée (la même qu'en fin de rapport,
« Points ouverts »). **Rien n'est restauré** : j'attends ton choix.

### Tâche 2 — migration 053 et photos du catalogue
- La migration 053 crée `catalogue_photos` : les photos qu'un utilisateur choisit pour un produit
  du catalogue (position 0 = photo principale, puis la galerie). Le catalogue commun n'est
  jamais modifié.
- En lecture seule, la table et ses 4 règles d'accès existent en base : la migration est
  appliquée.
- La fonction était déjà codée. Je l'ai relue de bout en bout, comme convenu :
  - enregistrement : `/api/catalogue/[id]/photos`, avec session obligatoire, produit visible pour
    l'utilisateur et URL https sur un hôte connu ;
  - liste : `/api/catalogue` affiche la photo principale ;
  - fiche : `/api/catalogue/[id]` affiche la galerie.

  Aucun défaut trouvé. Seul un commentaire obsolète de `lib/catalogue-photos.ts` est corrigé.
- Je n'ai ajouté aucune photo en base : chaque utilisateur choisit les siennes dans sa fiche
  Catalogue.

### Tâche 5 — landing
- Aucun prompt de mise à jour de la landing dans le dépôt (fichiers `.md` et `docs/` parcourus) :
  **colle-le-moi**.
- Titre de page : la landing avait seulement « Dropvio ». Elle a maintenant un titre et une
  description dans les 4 langues, par exemple en français : « Produits gagnants, marge nette et
  boutique Shopify | Dropvio ».
  - Pour cela, le contenu de la landing est passé dans `components/landing/LandingContenu.tsx`,
    et `app/page.tsx` est une petite page serveur qui fixe le titre. Un composant client ne
    peut pas le faire.
  - Les autres pages ne changent pas.
- Textes à 10–11 px : ils ne sont que dans le visuel décoratif du haut
  (`components/landing/DashboardMockup.tsx`). Laissés tels quels (ta réponse).
- Prix : non modifiés, en attente de ta décision.

### Tâche 6 — sécurité
- **a) Produits au-delà de la limite du plan** : migration `059_limite_produits_boutique.sql`, à
  appliquer.
  - Un trigger refuse l'ajout au-delà de la limite, quel que soit le chemin, sans risque entre
    deux ajouts simultanés (ta réponse : trigger SQL).
  - `app/api/boutiques/[id]/produits/route.ts` traduit ce refus en 403 avec le message de limite
    habituel.
  - Un commentaire dans `lib/plan-limits.ts` rappelle que les limites sont recopiées dans le SQL.
- **b) Expert expiré** :
  - `middleware.ts` traite un Expert sans période en cours comme un compte Free (règle dans
    `lib/plan-effectif.ts`) ;
  - la migration `058_expert_expire_catalogue.sql`, à appliquer, fait de même pour le RLS du
    catalogue.
- Autres constats faibles (FO1 à FO6, dans `SECURITE_AUDIT.md`) : non appliqués, à décider.

### Tests
- `npx tsc --noEmit` : aucune erreur. `npm run lint` : 0 erreur (3 avertissements déjà présents).
  `npm test` : 176 tests réussis sur 177, aucun échec, dont 4 nouveaux tests sur la règle
  Expert expiré.
- Middleware : la landing répond, et les pages outils redirigent vers la connexion sans session.
- Titre de la landing vérifié en français et en anglais.
- Les deux migrations ne sont pas encore testées en base. Une fois qu'elles sont appliquées, je
  vérifierai en lecture seule :
  - avec une session simulée de ton compte Expert actif, la règle accorde bien l'accès complet ;
  - le trigger et les deux fonctions sont en place.

  Il n'existe aucun compte Expert expiré en base, et je ne dois pas en créer : le cas « expiré »
  est couvert par les tests unitaires du code.

### Décisions
- Titre de la landing via une page serveur plutôt que dans le layout commun : sinon toutes les
  pages sans titre propre (dashboard, outils) auraient pris le titre de la landing.
- Le trigger ne s'applique qu'aux appels faits avec une clé utilisateur (anon et authenticated),
  comme le trigger `proteger_colonnes_facturation`. Les opérations du serveur avec le service
  role restent possibles.

### Constats en passant (non corrigés)
- Aucune page de l'interface n'appelle `/api/expert/checkout` : un Expert expiré, renvoyé vers
  `/abonnement`, ne peut y choisir que Pro ou Agency, pas reprendre Expert.
- `/formation` n'a pas de titre propre (seulement « Dropvio »).
- `components/studio/GenerateurMedia.tsx:17` : lien « Quota » encore écrit en dur (zone Studio,
  hors périmètre de la tâche 4).

## Où en est chaque tâche

| # | Tâche | État |
|---|---|---|
| 1 | Barre latérale | Fait. Ton test PC et mobile reste à faire. |
| 2 | Pauses et crédits | Vérifié : rien à regrouper, valeurs actuelles conservées (ta réponse). |
| 3 | Design de référence | **En attente** : choisis un commit dans la liste plus bas. |
| 4 | Traductions et français | Fait. |
| 5 | Formation | Fait (ordre et traductions le 20/11, revérifiés aujourd'hui). |
| 6 | Prix en double | Fait (2 endroits). |
| 7 | Photos du catalogue | Vérifié le 21/11 (deuxième série) : migration 053 appliquée, fonction relue, aucun défaut. |
| 8 | Stripe en mode test | **Bloqué** : aucune clé Stripe dans `.env.local`, outil `stripe` non installé. Préparé : script et `.env.example`. |
| 9 | Shopify (test) | **Partiel** : refus des appels mal signés testés ; aucune boutique de développement connectée et `TOKEN_ENCRYPTION_KEY` vide. |
| 10 | Landing | Prompt de mise à jour absent. Prix vérifiés, auto-évaluation faite. |
| Sécurité | Audit | Fait. Aucun constat critique ou élevé ouvert ; constats moyens et faibles à décider. |

## Changements

### 1. Barre latérale (`components/AppShell.tsx`, `app/formation/page.tsx`)
- Le cadre commun (barre latérale, tiroir mobile, mémoire de l'état replié) est maintenant un
  composant `CadreApp`, utilisé par toutes les pages de l'outil **et par `/formation`**.
  `/formation` avait sa propre barre : marge fixe de 260 px sur mobile, pas de bouton pour
  ouvrir le menu, état replié oublié à chaque visite.
- Mobile : quand le tiroir est ouvert, la page derrière ne défile plus. Si on agrandit la fenêtre
  en largeur desktop pendant que le tiroir est ouvert, il se ferme.
- Déjà en place depuis le 20/11 et conservé :
  - desktop : la barre ne recouvre pas le contenu (marge de 260 px, ou 64 px repliée), le
    bouton « Réduire » la replie, et l'état est mémorisé dans le navigateur ;
  - mobile : un bouton ouvre le tiroir ; il se ferme au clic sur le fond, sur un lien, sur le
    logo, sur « Nouvelle génération » ou avec Échap.
- Vérification des deux tailles d'écran : faite sur le code, pas dans un navigateur. Ta règle
  dans `CLAUDE.md` réserve les tests d'interface à toi.

### 2. Pauses et crédits
- Les crédits, périodes et pauses n'existent que dans `lib/pauses-outils.ts`, et le budget images
  une seule fois dans `lib/plan-limits.ts` (`IMAGE_BUDGET_EUR_PAR_PLAN`). Aucun texte de
  l'interface ne recopie ces chiffres. Rien à regrouper, aucune valeur changée.

### 4. Traductions et français
- Les 2 383 clés existent dans les 4 fichiers de `messages/`, avec les mêmes variables dans les
  4 langues. Aucun texte n'est resté en français dans en, es ou it.
- Textes écrits en dur, passés par les traductions : le lien « Quota » à 3 endroits
  (`app/site-builder/page.tsx`, `components/site-builder/GenerationImagesBoutique.tsx`). En
  espagnol, il devient « Cuota ».
- Le texte d'aide sur la répartition du budget (paramètres, section Plan) recopiait « 15 % » et
  « 30 % » : il lit maintenant les vraies valeurs du code, dans les 4 langues.

Corrections du français (`messages/fr.json`) :

| Clé | Avant | Après |
|---|---|---|
| `dashboard.mesSites.subtitle` | Toutes vos landing pages sauvegardées automatiquement après génération. | Toutes tes landing pages, sauvegardées automatiquement après chaque génération. |
| `dashboard.mesSites.downloadOk` | Fichier enregistré dans vos Téléchargements… | Fichier enregistré dans tes Téléchargements… |
| `parametres.plan.features.pro` (5e ligne) | Sauvegarde illimitée de vos sites | Sauvegarde illimitée de tes sites |
| `dashboard.calculateur.usCharges` | …automatiquement : Frais Stripe… | …automatiquement : frais Stripe… |
| `dashboard.produits.loadingProducts` | Chargement des produits AliExpress... | Chargement des produits AliExpress… |
| `dashboard.produits.altLoading` | …sur AliExpress... | …sur AliExpress… |
| `auth.login.confirmedBanner` | Ton email est confirmé. | Ton e-mail est confirmé. |
| `auth.login.errorInvalid` | Email ou mot de passe incorrect. | E-mail ou mot de passe incorrect. |
| `auth.login.resend`, `auth.register.resend` | Renvoyer l'email de confirmation | Renvoyer l'e-mail de confirmation |
| `auth.login.resendSent`, `auth.register.resendSent` | Email renvoyé ! | E-mail renvoyé ! |
| `auth.login.emailLabel`, `auth.register.emailLabel`, `parametres.profil.emailLabel` | Email | E-mail |
| `auth.register.errorAlreadyRegistered` | Cet email est déjà utilisé. | Cet e-mail est déjà utilisé. |
| `parametres.profil.emailCaption` | L'email ne peut pas être modifié… | L'e-mail ne peut pas être modifié… |

Pourquoi :
- l'application tutoie partout, mais quelques phrases vouvoyaient ;
- « Email » et « E-mail » cohabitaient, c'est maintenant « e-mail » partout ;
- les points de suspension s'écrivent « … » ;
- pas de majuscule après deux-points en milieu de phrase.

La landing et la FAQ vouvoient : c'est cohérent dans chacune de ces zones, je n'y ai pas touché.

### 5. Formation
- Ordre de la version courte : parties 1 à 35 sans trou, puis la conclusion, puis les annexes,
  identique dans les 4 langues. Fait le 20/11 et revérifié.
- Traductions : toutes les leçons existent et sont complètes en en, es et it.
- `robots.txt` : ton message ne précisait pas le choix ([INDEXER /formation OU L'EXCLURE]). J'ai
  gardé l'état actuel :
  - la page de vente `/formation` est indexée et présente dans le sitemap ;
  - les leçons `/formation/lire/…` sont exclues, et leurs pages portent un `noindex`.

### 6. Prix écrits en double
- `/expert`, bloc « Votre recharge » : avec une seule ligne, le même montant apparaissait deux fois
  (la ligne, puis le total). Le montant de la ligne n'est plus affiché quand il n'y a qu'une ligne
  (`components/landing/ExpertOffre.tsx`).
- `/formation` : chaque carte affichait le prix en grand puis le répétait dans le bouton
  (« Acheter — 24,99 € »). Les boutons disent maintenant « Acheter » et « Acheter le bundle »,
  dans les 4 langues.
- Pas un doublon : dans le visuel du haut de la landing, l'ordinateur et le téléphone montrent
  volontairement les mêmes chiffres.

### 8. Stripe en mode test (préparé, pas exécuté)
- `.env.example` documente maintenant toutes les variables lues par le code, sans valeur. Six
  manquaient : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SHOPIFY_*`, `TOKEN_ENCRYPTION_KEY`,
  `ALIEXPRESS_*`, `CRON_SECRET`, plus les domaines.
- Nouveau script `scripts/stripe-creer-prix-test.ts`. Il crée, en mode test seulement, Pro
  29 €/mois, Agency 59 €/mois et les 3 prix de la formation, puis affiche les identifiants à
  coller dans `.env.local`.
  - Il refuse une clé live et ne crée rien en double : chaque prix a une `lookup_key`.
  - Il lit les montants dans `lib/plan-limits.ts` et `lib/formation.ts`.
  - Expert n'a pas de prix fixe (ta réponse) : son montant reste calculé selon la configuration.
- Webhook (`app/api/webhooks/stripe/route.ts`) : il renvoyait une erreur 500 quand Stripe n'était
  pas configuré. Il refuse maintenant proprement : 400 sans signature, 503 sans configuration,
  401 si la signature est fausse.

### 9. Shopify
- Testé sans boutique :
  - les 4 webhooks (commandes et RGPD) refusent un HMAC faux (401) ;
  - le retour OAuth invalide renvoie vers le dashboard avec un message d'erreur ;
  - la connexion sans session est refusée (401).
- Aucune boutique n'est connectée en base. Rien n'a été modifié côté Shopify.

### 10. Landing — auto-évaluation
- Prix affichés : Pro 29 €, Agency 59 €, Expert « à partir de 59 € », tous lus depuis une source
  unique.
- Accessibilité :
  - langue déclarée (`fr`), un seul titre principal (h1), hiérarchie des titres correcte ;
  - tous les boutons et liens ont un nom accessible, pas de lien « cliquez ici » ;
  - visuel du haut décrit pour les lecteurs d'écran ;
  - animations coupées si l'utilisateur demande moins de mouvement.
- Mobile : viewport déclaré, visuel du haut contenu dans l'écran.
- Audit IA du projet : 61/100 (contre 57 avant les corrections du 20/11). Faiblesses restantes :
  preuve sociale (3/13, il faut de vrais avis ou chiffres), vraie capture du produit (8/13),
  urgence (6/9).
- À améliorer :
  - le titre de la page est seulement « Dropvio » (peu parlant dans Google et les onglets) ;
  - quelques textes du visuel font 10 à 11 px.

### Sécurité
Voir `SECURITE_AUDIT.md`. Seule modification aujourd'hui : le refus propre du webhook Stripe
(ci-dessus). Les corrections critiques et élevées datent du 20/11 et ont été revérifiées.

## Tests faits aujourd'hui
- `npx tsc --noEmit` : aucune erreur. `npm run lint` : 0 erreur (3 avertissements déjà présents).
  `npm test` : 172 tests réussis sur 173, aucun échec.
- Les 82 appels aux routes API protégées, sans session, sont refusés ou ne renvoient aucune
  donnée privée.
- Webhook Stripe : sans signature (400), signature fausse (refusée), corps modifié (refusé),
  mauvais secret (refusé), signature valide (acceptée).
- Webhooks Shopify avec un HMAC faux : 401.
- HTML malveillant dans les deux types d'aperçu, testé dans Chromium sans interface : ni le
  cookie, ni la session, ni la page parente ne sont atteints, et l'onglet n'est pas redirigé.
- Script Stripe lancé sans clé de test : il refuse et ne crée rien.

## Décisions prises
- Pauses, crédits et budget images : valeurs actuelles conservées (ta réponse).
- Expert : pas de prix fixe dans Stripe (ta réponse).
- `robots.txt` : état actuel conservé (page de vente indexée, leçons exclues).
- `/formation` utilise le même cadre que l'outil, pour avoir le même tiroir mobile et la même
  mémoire de la barre repliée.
- Je n'ai fait aucun test d'interface dans un navigateur (règle de `CLAUDE.md`). Le test du HTML
  malveillant est un test de sécurité dans un navigateur sans interface, pas un test de
  l'interface.

## Points ouverts — ce qu'il me faut
1. **Tâche 3** : choisis le commit de référence du design dans cette liste. Attention : 107
   modifications non commitées existent aussi dans ton dossier, dont des changements de design
   faits après le 26/10 ; la référence ne peut porter que sur l'historique commité.
   ```
   bec3e72  2026-11-20 11:34  Catalogue : lecture réservée aux comptes connectés, limite Free appliquée par la base
   7366535  2026-11-20 11:08  Textes, sécurité et landing : ordre de la formation, prix centralisés, RLS, SSRF, limiteur partagé
   5dc350d  2026-10-26 12:25  Formation : corrections du contenu et version anglaise
   7be9889  2026-10-24 12:48  créateur de sites : plus de limite maximale de caractères
   61eded3  2026-10-24 12:42  génération de site : pages tronquées corrigées, prompt plafonné, barre qui ne masque plus la fiche
   281913d  2026-10-24 12:24  site builder : avis clients depuis des captures, 4 et 5 étoiles uniquement
   0888ad6  2026-10-21 17:19  site builder : format d'export dans la barre de saisie, barre calée en bas
   f18a574  2026-10-21 16:22  Retire le sélecteur de langue et la barre d'étapes de l'assistant
   3db3bd7  2026-10-21 16:21  site builder : barre de saisie façon assistant IA, retrait des choix de thème
   3ce7c1d  2026-10-20 20:28  site builder : page produit et page d'achat dessinées par l'IA au design du site
   51866cf  2026-10-20 11:34  dashboard : retrait du camembert « Budget IA du mois par fonction »
   ea77088  2026-10-18 17:59  landing : retrait du budget IA inclus sur les cartes des plans
   ce8d02f  2026-10-18 12:54  site builder : modification du site en tête de l'étape résultat
   ae13062  2026-10-18 12:28  site builder : modifier toutes les pages d'un site avec l'IA
   86747ec  2026-10-15 18:40  dashboard : ventes Shopify zoomables et camemberts de répartition
   ```
   La section « Nouveautés » demandée sera écrite une fois la référence choisie.
2. **Tâche 7** : confirme que la migration 053 est appliquée. En lecture seule, je vois que la
   table `catalogue_photos` existe, mais j'attends ta confirmation comme demandé.
3. **Tâche 8**, à faire de ton côté :
   - mettre ta clé de test `sk_test_…` dans `STRIPE_SECRET_KEY` de `.env.local` ;
   - installer la CLI Stripe (`brew install stripe/stripe-cli/stripe`, puis `stripe login`).

   Ensuite je lance le script, `stripe listen`, et les tests d'abonnement, d'annulation et de
   changement de plan. Il me faudra aussi un **compte de test Dropvio distinct du tien** : le
   webhook écrit dans la vraie base et changerait le plan du compte utilisé.
4. **Tâche 9** :
   - générer `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`) et la mettre dans `.env.local`.
     Sans elle, la connexion d'une boutique échoue ;
   - créer une boutique de développement dans Shopify Partners ;
   - la connecter depuis l'interface. Je surveille les logs pendant ton test.
5. **Tâche 10** : colle le prompt de mise à jour de la landing.
6. **Sécurité** : choisis les constats moyens et faibles à appliquer (fin de `SECURITE_AUDIT.md`).
   MO1, MO2 et FO3 demandent une migration : je l'écrirai, puis je m'arrêterai pour que tu la
   colles.

## Tests à faire de ton côté
- Barre latérale, sur PC puis sur mobile (375 px) : `/dashboard`, `/site-builder` et
  `/formation` (connecté).
  - Le tiroir s'ouvre avec le bouton ; il se ferme au clic sur le fond et sur un lien.
  - La page derrière ne défile pas quand le tiroir est ouvert.
  - Sur PC, la barre se replie, et l'état est gardé après un rechargement.
- `/formation` : les boutons disent « Acheter » sans répéter le prix.
- `/expert`, bloc « Votre recharge » : le montant n'apparaît qu'une fois.
- Paramètres, section Plan : le texte d'aide affiche bien 15 % et 30 %.
- Connexion et inscription : le libellé est « E-mail ».
