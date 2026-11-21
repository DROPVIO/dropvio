# Rapport de modifications — 21 novembre 2026

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
