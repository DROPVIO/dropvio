# Rapport de modifications

## 25 novembre — Vitesse perçue : squelettes, progression, mise à jour optimiste, préchargement

Branche `chargement-pages` (depuis `survol-sidebar`). Seuils (lib/chargement.ts) : 0–1 s rien (contenu en cache affiché, sinon écran précédent) ; 1–10 s squelette pulsé aux dimensions du contenu ; au-delà, barre de progression + temps restant ou « encore quelques secondes », mise à jour toutes les 500 ms. Pages : Mes sites, Utilisation, Quota, Ventes, emplacements de graphiques du tableau de bord et du calculateur, écran de génération du Site Builder. Création de site : avancement réel écrit par la route (étape, caractères reçus de l'IA) dans la table de la migration **071** (à appliquer), lu par GET /api/generate-site/progression toutes les 1,5 s. Mise à jour optimiste : suppression d'un site, statut d'une vente (favori et format l'étaient déjà). Préchargement : prefetch complet des liens de la barre latérale + données de la page au survol/focus ; cache client des données (60 s sans relecture, puis relecture en arrière-plan), vidé à la déconnexion.

### Décisions prises seul
- Progression réelle via une table plutôt qu'un état en mémoire : sur Vercel, la requête d'état peut arriver sur une autre instance que la génération. Sans la migration 071, l'écriture échoue sans bloquer et la barre est estimée.
- Taille attendue d'un site fixée à 60 000 caractères (hypothèse, l'historique en base ne permet pas de la mesurer) ; le temps restant n'est affiché que si l'avancement mesuré est entre 10 % et 90 % après 5 s, sinon « encore quelques secondes ».
- Pas de loading.tsx sur les pages de l'outil : sans lui, Next garde l'écran précédent pendant la navigation (règle 0–1 s). Pas de staleTimes (option expérimentale) : le cache des données couvre le retour sur une page.
- Pages non converties (Produits gagnants, Catalogue, Studio, Abonnement, tableau de bord principal) : chargements à filtres multiples ou déjà sans indicateur bloquant ; à traiter page par page si besoin.

## 25 novembre — Contraste du texte (WCAG AA) dans les deux thèmes

Branche `lisibilite-et-vitesse-percue`. Partie 1 du prompt « lisibilité et vitesse perçue » ; la partie 2 (chargement) n'est pas faite : le prompt reçu s'arrêtait après la règle « 0 à 1 seconde ».

Mesures avant correction (fond le plus défavorable : calque --surface-3) : thème clair --text-faint 2,05:1, --accent-secondary 2,94:1, --success 3,01:1, --warning 2,55:1, --danger 3,86:1 ; thème sombre --text-faint 4,34:1, --accent en texte 1,71:1, --danger 2,60:1, --success 3,85:1 ; boutons rouges sombres (#ef4444, texte blanc) 3,76:1. Les titres « Sites », « Images »… de /quota (UsageMeter) étaient en blanc codé en dur, quasi invisibles en clair.

### Décisions prises seul
- Couleurs de remplissage et couleurs de texte séparées : aucun violet ne peut porter du texte blanc ET se lire sur fond sombre à 4,5:1. Nouvelles variables --accent-text, --accent-secondary-text, --success-text, --warning-text, --danger-text dans les 4 blocs de thème (app, boutiques claires et sombres) ; les classes text-[var(--accent)] etc. des composants pointent dessus (remplacement mécanique, 266 classes dans 60 fichiers).
- Valeurs : clair --text-faint #63636c, textes #7c3aed / #1d4ed8 / #065f46 / #92400e / #b91c1c ; sombre --text-faint #b8b8c1, textes #c4b5fd / #93c5fd / #34d399 / #fbbf24 / #fca5a5 ; --danger sombre #dc2626 (boutons à texte blanc 4,83:1). Seuil retenu : 4,5:1 partout, y compris pour les gros titres (plus strict que 3:1).
- Palette de /faq : --text-3 #a19caf et --purple #a78bfa (texte et icône seulement).
- UsageMeter passé aux variables du thème. Les textes clairs sur fonds sombres fixes (lecteur de formation, bulle d'onboarding, landing) n'ont pas été touchés : ils passent déjà.
- Test lib/contraste-theme.test.ts : recalcule les contrastes à partir de app/globals.css.

## 25 novembre — Catalogue du plan Pro plafonné à 15 000 produits

Branche `limite-catalogue-pro`. Comptage en base (lecture seule) : 45 255 lignes dans `produits`, 39 975 dans `produits_dedup`, dont **4 081 affichés** (au moins 100 commandes, 21 niches). Le plafond Pro (15 000) ne retire donc aucun produit aujourd'hui ; il s'appliquera quand le catalogue affiché dépassera 15 000 produits. `produitsMax` (déjà « produits accessibles du catalogue ») passe à `CATALOGUE_MAX_PRO` = 15 000 pour Pro ; Agency et Expert restent à null. Le plafond est un ensemble fixe (lib/catalogue-plafond.ts), appliqué par le serveur à Produits gagnants (RPC de rotation, migration **070** à appliquer), à la liste Catalogue, au compteur et aux suggestions de produits. Textes (4 langues) : tarifs de la landing et de /abonnement, fenêtre de l'audit, FAQ de la landing et page /faq, via `{catalogueMax}`.

### Décisions prises seul
- Réutilisation de `produitsMax` plutôt qu'un nouveau champ `catalogueMax` : c'est déjà la limite « catalogue » (lue par /api/usage, le compteur et les deux routes de liste). Constante nommée `CATALOGUE_MAX_PRO`.
- Ordre de référence du plafond : commandes décroissantes, puis id croissant (ordre de la liste Catalogue et ancien ordre fixe avant la rotation de 047). La rotation quotidienne ne peut pas servir : elle change chaque jour, et un plafond par requête laisserait un compte Pro parcourir tout le catalogue jour après jour ou filtre après filtre. Pro voit donc les 15 000 produits les plus commandés ; la rotation et les filtres s'appliquent à l'intérieur.
- La borne (dernier produit autorisé) est gardée 5 minutes en mémoire : elle ne bouge qu'avec les commandes du catalogue.
- Sans la migration 070, la route reste fonctionnelle : la borne n'est transmise aux RPC que si le catalogue dépasse 15 000 produits, et en cas d'absence de la fonction elle retombe sur un repli plus strict (produits ayant plus de commandes que la borne), jamais plus large.
- Le compteur du catalogue (`/api/catalogue/compte`) comptait les 39 975 produits dédoublonnés, alors que seuls ceux d'au moins 100 commandes sont affichés : il applique désormais le même plancher que les listes (4 081 aujourd'hui).
- Agency : ligne « Catalogue complet, sans plafond » ajoutée à ses fonctionnalités, puisque « Tout le plan Pro » ne le dit plus.
- La fiche d'un produit par son id (`/api/catalogue/[id]`) n'est pas plafonnée : elle sert aussi aux produits déjà copiés en boutique, et un id hors plafond n'apparaît dans aucune liste Pro.

## 24 novembre — Audit de la landing (juridique, design) et parcours de résiliation / renonciation

Branche `audit-landing-et-parcours-legal`. Landing : prix affichés « TTC/mois » (4 langues) ; marques Nielsen Norman Group, Unbounce et McKinsey retirées (caution non vérifiable) ; textes inexacts corrigés (le catalogue ne filtre ni délai de livraison ni vendeur ; Dropvio ne passe pas les commandes chez le fournisseur ; le suivi part vers Shopify quand le marchand saisit le numéro ; « votre SAV se vide », « quasi illimitée », « sous 24 h » retirés) ; exemple de marge corrigé (TVA 20 % et frais Stripe UE réellement déduits : 21,00 € au lieu de 27,04 €) ; maquettes signalées « Exemple illustratif », l'exemple d'audit « Contenu généré par IA », le hero « Aperçus illustratifs, données fictives » ; un seul appel à l'action « Créer mon compte » (nav, hero, étapes, bas de page) ; « Débloque » → « Débloquez » ; contrastes relevés (#777 → #666, #8a8a94 → #6b6b75). Pied de page : lien « Cookies » vers /confidentialite#cookies (ancre posée sur les titres h2 des pages juridiques, texte inchangé). Inscription : ligne d'information avec lien vers la politique de confidentialité ; « réessaie » → « réessayez ». Paramètres : lien « Renoncer au contrat ici » ajouté à côté de « Résilier mon abonnement » (dans les 14 jours).

### Décisions prises seul
- « TTC » ajouté sans connaître le régime de TVA (CGV « À COMPLÉTER ») : en franchise en base, le prix payé reste le prix final, la mention reste exacte.
- Appel à l'action unique « Créer mon compte » plutôt que « Trouver mon premier produit » / « Calculer ma marge réelle » : honnête (le plan se choisit après l'inscription) et identique partout. Les boutons des cartes de tarifs gardent leur libellé par plan.
- « Support prioritaire sous 24 h » → « Support prioritaire » : aucun processus ne garantit un délai.
- Exemple de marge recalculé sur le mode France (1,5 % + 0,25 €, TVA 20 % incluse) au lieu d'un exemple US présenté en euros.
- Pas de case à cocher à l'inscription : la création du compte repose sur le contrat, pas sur un consentement ; une ligne d'information suffit. Les cases d'achat (ConsentementAchat) restent décochées par défaut.
- Lien « Cookies » vers la section de la politique de confidentialité : il n'existe pas de page cookies dédiée et je n'en rédige pas.
- `verifier-landing.mjs` (Playwright) non lancé : contrôles faits par requêtes HTTP sur le serveur de dev.

## 23 novembre — Marquage IA, plafond d'audits Agency, renonciation dans l'espace client

**Plafond Agency** : Pro = 30 audits → 2,5 × 30 = 75. Coût API maximal (30 sites × 0,234 € + audits × 0,1646 €, sortie max_tokens entière, entrée estimée à 10 000 / 20 000 tokens) : 19,36 € à 75 audits > 14 € → plafond ramené à **42 audits** (13,93 €). Textes mis à jour dans les 4 langues, message « Passez à Agency » calculé depuis la constante.

**Marquage IA (AI Act art. 50)** : chaque image générée (`generateImage`, lib/media/index.ts) reçoit des métadonnées sans réencodage — JPEG : EXIF (ImageDescription, Software, DateTime) + XMP ; PNG : tEXt/iTXt (AI-Generated, Software, Creation Time, Description) + XMP ; WebP : XMP (VP8X). Le XMP porte `DigitalSourceType = trainedAlgorithmicMedia` (IPTC), le fournisseur, le modèle et la date. Pas de C2PA. Mention visible « Contenu généré par IA » (4 langues) : pied de page des sites générés et modifiés (langue du site), sous les résultats d'audit, sous le nom/la description générés (Site Builder, boutique) et après une réécriture IA des fiches produits.

**Résiliation / renonciation** : bouton « Résilier mon abonnement » sur /abonnement (parcours existant : bouton → « Confirmer la résiliation » → confirmation + e-mail, fin de période). Nouveau bouton « Renoncer au contrat ici » sur /abonnement pendant 14 jours après la souscription → /renonciation (identifiant du compte, date de souscription, motif facultatif) → arrêt immédiat de l'abonnement, remboursement intégral automatique via Stripe, e-mail de confirmation. Migration **069** à appliquer (colonnes du parcours connecté sur `demandes_retractation`).

### Décisions prises seul
- « Coût maximal du plan Agency » = sites + audits au plafond (comme le calibrage précédent à 15,60 €) ; les images ont leur budget séparé et ne sont pas comptées. Hypothèse d'entrée (10 000 / 20 000 tokens) reprise des tests existants : l'entrée d'un audit n'est pas plafonnée dans le code. La correction HTML d'un audit (24 000 tokens de sortie, même quota) n'est pas comptée dans ce coût.
- Métadonnées écrites octet par octet (pas de réencodage par sharp) : pixels identiques, vérifié par les tests. Un fichier impossible à marquer est renvoyé tel quel (journalisé) plutôt que de faire échouer une génération payée.
- Mention des sites : ajoutée à la fin du dernier `<footer>` (sinon un pied créé avant `</body>`), idempotente ; les sites générés avant ce changement ne la portent qu'après une modification IA.
- Textes : mention affichée sous le champ dès qu'un nom ou une description a été rempli par l'IA, retirée quand le formulaire produit est réinitialisé.
- Renonciation : remboursement **automatique** de tous les paiements des factures payées de l'abonnement (clé d'idempotence par paiement), abonnement arrêté immédiatement (`subscriptions.cancel`). Le formulaire est pré-rempli ; l'identifiant et la date doivent correspondre au compte. Délai : jusqu'à la fin du 14e jour (heure de Paris) après la date de souscription Stripe (`start_date`).
- Table : les demandes restent dans `demandes_retractation` (067) et `resiliations` (068) ; 069 ajoute les colonnes manquantes plutôt qu'une nouvelle table. Sans 069, la demande est enregistrée avec les colonnes de 067.
- Libellé « Résilier votre contrat » remplacé par « Résilier mon abonnement » partout où il apparaissait (abonnement, paramètres, quota, pied de page, titre de /resiliation).

## 23 novembre — Calculateur UK/US : cases « carte émise hors du pays » (+1,5 % Stripe) et « paiement dans une autre devise » (+1 % de conversion), décochées par défaut, donc résultats inchangés sans elles ; la douane US devient un montant manuel en $ par commande, déduit de la marge (anciennes simulations : l'ancien % informatif n'est pas relu) ; case nexus, taux d'État et affichage en £/$ conservés. Choix validés par vous avant l'implémentation. Au passage : `usStateTaxUnknown` (FR) passé au vouvoiement.

## 22 novembre — Expert : 90 audits par mois (au lieu de 100), soit ≈ 0,165 € × 90 ≈ 14,85 € ≤ 15,60 € ; sites, réserve de 50 sites Opus et prix inchangés. Aucun texte n'affichait « 100 audits » : la ligne « Audit IA quasi illimité » des tarifs Expert devient « 90 audits IA par mois » (4 langues). Constat non corrigé : `dashboard.calculateur.margeCibleInatteignable` est encore au tutoiement (« Réduis… »).

## Séance du 22 novembre (suite) — quotas Agency ramenés dans le budget Claude

Choix retenu : baisser les quotas Agency pour qu'ils tiennent dans 15,60 € au coût maximal par
appel. **Agency : 30 sites et 50 audits par mois** (au lieu de 50 et 100), soit
30 × 0,23 € + 50 × 0,165 € ≈ 15,15 €.

### Fichiers modifiés

- `lib/plan-limits.ts` : quotas Agency 30 sites / 50 audits, avec le calcul en commentaire.
- `lib/expert-pricing.ts` : l'enveloppe de tokens Expert reprenait le quota de sites Agency.
  Pour ne pas modifier le plan Expert, elle est figée à `SITES_ENVELOPPE_EXPERT = 50` sites Opus
  (prix, plafonds de sites Expert inchangés).
- `app/api/audit-site/route.ts`, `app/api/audit-site/html/route.ts` : « Passez à Agency pour
  50 audits par mois. » (au lieu de « Passe Agency pour 100 audits », au tutoiement).
- `messages/{fr,en,es,it}.json` : tarifs de la landing, page Abonnement et FAQ (30 sites, 50 audits).
- Tests : `lib/expert-pricing.test.ts` (enveloppe figée à 50) et nouveau test dans
  `lib/ai-budget.test.ts` (30 sites + 50 audits ≤ 15,60 € au coût plafond).

### Points signalés

- **Expert : 100 audits par mois, non modifié** (vous n'avez parlé que d'Agency). Au coût
  plafond, 100 × 0,165 € ≈ 16,50 € dépasse son budget Claude de 15,60 €. À baisser à 90 ou
  moins si vous voulez la même garantie.
- Les comptes Agency déjà au-delà de 30 sites ou 50 audits ce mois-ci sont bloqués jusqu'au
  1er du mois prochain (leurs sites et audits existants restent intacts).
- Un commentaire historique de la migration 037a mentionne encore « 50 sites » : laissé tel quel.

### Vérifications

tsc, lint, `npm test` (230 tests, 229 réussis, 1 ignoré, 0 échec), build sans avertissement.

## Séance du 22 novembre (suite) — budget Claude Agency et Expert : 2,6 × Pro

Budget Claude mensuel d'Agency et d'Expert : **15,60 €** (6 € × 2,6) au lieu de 28 €. Seul le
budget Claude change ; budget Pro (6 €), budgets images (1,50 € / 3,50 € / 0 €) et prix des
sites Expert inchangés.

### Fichiers modifiés

- `lib/plan-limits.ts` : `AI_BUDGET_PRO_EUR = 6` (seule valeur saisie),
  `MULTIPLICATEUR_BUDGET_CLAUDE_AGENCY_EXPERT = 2.6` (commentée), Agency et Expert = Pro × 2,6
  arrondi au centime.
- `lib/ai-budget.test.ts` : valeurs attendues 15,60 € (au lieu de 28 €), seuil du test « budget
  images épuisé » passé de 27,99 € à 15,59 €, et nouveau test : Agency = Expert = Pro × 2,6,
  budgets images inchangés, affichage « 15,60 € ».
- Aucun texte à réécrire : la FAQ, la landing et les tarifs affichent le montant à partir de la
  constante (`lib/prix.ts`, format français « 15,60 € »). Aucune autre trace de 28 € liée au
  budget dans `lib/`, `app/`, `components/`, `messages/`, `content/`.

### Points signalés

- **Uniquement des appels Claude** : `MODELE_PAR_FONCTION` (`lib/ai-budget.ts`) ne contient que
  des modèles Claude (Sonnet 5.5, Sonnet 4.6, Opus 5.5, Haiku 4.5, Opus 4.8 en relais) ; les
  images (OpenAI) sont à `null`, hors budget. Rien à exclure.
- **Expert** : les sites Expert sont générés hors budget (`horsBudget`, payés à l'unité) ;
  `lib/expert-pricing.ts` et `lib/expert-quota.ts` ne dépendent pas du budget Claude. Rien changé.
- **Quotas Agency / Expert (non modifiés) qui ne tiennent plus au maximum dans 15,60 €.** Coût
  plafond par appel (sortie `max_tokens` entièrement consommée, entrée estimée par moi) :
  - site (Sonnet 5.5, 1,80 € / 9 € par million) : 24 000 × 9 € / M = 0,216 € + ~10 000 tokens
    d'entrée × 1,80 € / M = 0,018 € → **≈ 0,23 €** ; 50 sites ≈ **11,70 €** ;
  - audit (Sonnet 4.6, 2,70 € / 13,50 € par million) : 8 192 × 13,50 € / M = 0,111 € +
    ~20 000 tokens d'entrée × 2,70 € / M = 0,054 € → **≈ 0,165 €** ; 100 audits ≈ **16,50 €** ;
  - total des deux quotas ≈ **28 €** : ils semblent calibrés sur l'ancien budget. Avec 15,60 €,
    les 100 audits seuls peuvent dépasser le budget, et 50 sites + 100 audits ne sont plus
    atteignables au plafond. Le coût réel est souvent inférieur au plafond (le budget compte les
    tokens réellement consommés), mais un compte Agency très actif sera arrêté par le budget
    avant ses quotas. Les limites glissantes suivent aussi : 15 % par jour = 2,34 €, 30 % par
    7 jours = 4,68 €.

### Vérifications

`npx tsc --noEmit`, `npm run lint`, `npm test` (229 tests, 228 réussis, 1 ignoré, 0 échec),
`npm run build` sans avertissement. La FAQ affiche « 15,60 € de budget IA » pour Agency.

## Séance du 22 novembre (suite) — e-mails d'accusé (Resend)

1. **Migrations 066 et 068** alignées sur la base : policies en `(select auth.uid()) = user_id`.
   Rien d'autre de modifié.
2. **Accusés par e-mail** : paquet officiel `resend`, `lib/email.ts` (`envoyerEmail`), gabarits
   `lib/emails/accuse-retractation.ts` et `lib/emails/confirmation-resiliation.ts` (HTML simple
   sans image externe + version texte, champs saisis échappés), un test chacun plus
   `lib/email.test.ts`. L'écran d'accusé affiche « Un e-mail de confirmation vous a été envoyé
   à … » seulement si l'envoi a réussi ; sinon le texte actuel suivi de « Conservez cette
   référence. ». `RESEND_API_KEY` et `EMAIL_EXPEDITEUR` ajoutés à `.env.example` sans valeur.
3. **Vérifications** : tsc, lint, 227 tests réussis (1 ignoré, 0 échec), build sans
   avertissement. Sans clé Resend, `POST /api/retractation` valide → 200 avec
   `emailEnvoye: false`, accusé affiché, seulement un avertissement en console.

### Décisions prises seul

- **Écran de résiliation sans e-mail** : la consigne demande d'ajouter « Conservez cette
  référence. » au texte actuel, qui disait déjà « Conservez ce numéro de référence… ». J'ai
  appliqué la consigne à la lettre ; les deux phrases se suivent (à alléger si vous le souhaitez).
- **E-mails en français uniquement**, quelle que soit la langue de l'interface, comme demandé.
- **Résiliation** : l'e-mail part à l'adresse du compte Supabase ; sans adresse, rien n'est envoyé.
- **Demande de test en base** : le test sans clé a créé une vraie demande
  `RET-20261122-VBQPU3` (Test Smoke, test-smoke@example.com). Je ne l'ai pas supprimée ; pour
  la clore : `npx tsx scripts/demandes-retractation.ts --traiter RET-20261122-VBQPU3`.
- L'avertissement `npm warn allow-scripts` affiché par `npm install` existait déjà (esbuild,
  fsevents, @swc/core…) : il ne vient pas de `resend`.

### Ce qui reste pour vous

- Renseigner `RESEND_API_KEY` et `EMAIL_EXPEDITEUR` (domaine vérifié dans Resend) en local et
  sur Vercel.
- Aucune nouvelle migration.

## Séance du 22 novembre — paiement, rétractation, résiliation, pages juridiques

Branche : `fix/sans-plan-free-et-corrections`. Un commit par étape (message commençant par son
numéro). Après chaque étape : `npx tsc --noEmit` et `npm test` réussis.
Poussée sur GitHub : https://github.com/DROPVIO/dropvio/tree/fix/sans-plan-free-et-corrections

### Ce qui a été fait

1. **Ménage** : `~/package-lock.json` (84 octets, sans `package.json` ni `node_modules` à côté)
   supprimé ; plus d'avertissement de lockfile au build. Migration 064 : `search_path` figé sur
   les deux fonctions de trigger signalées par Supabase.
2. **Webhook Stripe** (`app/api/webhooks/stripe/route.ts`, `lib/stripe-webhook.ts`) :
   idempotence (table `stripe_evenements`), plan déduit du prix (`STRIPE_PRICE_PRO` /
   `STRIPE_PRICE_AGENCY`), passage Pro ↔ Agency, past_due / unpaid → sans accès, résiliation
   programmée (`annulation_fin_periode`), suppression → plan nul, `invoice.paid` (fin de
   période), `invoice.payment_failed` (statut + bandeau). 15 tests avec signature simulée.
   Liste des événements à cocher dans Stripe : commentaire de `.env.example`.
3. **Durée maximale 800 s** sur les routes longues :
   - `app/api/generate-site/route.ts`
   - `app/api/modifier-site/route.ts`
   - `app/api/boutiques/[id]/generer-contenu/route.ts`
   - `app/api/audit-site/route.ts`
   - `app/api/audit-site/html/route.ts`
   - `app/api/media/generer/route.ts`
4. **Consentement avant paiement** : deux cases non cochées et obligatoires (textes exacts
   fournis) sur /abonnement, /formation et /quota, avec liens /cgv et /confidentialite. Preuve
   enregistrée côté serveur (table `consentements_achat` : compte, type d'achat, textes exacts,
   date, IP). Les quatre routes de paiement renvoient 400 `consentement_requis` sans les deux cases.
5. **Rétractation** : page publique /retractation (« Se rétracter du contrat »), sans connexion.
   Formulaire → récapitulatif → « Confirmer la rétractation » → accusé avec référence
   `RET-AAAAMMJJ-XXXXXX`. Compte connecté : liste de ses achats des 14 derniers jours. Table
   `demandes_retractation` (statut `recue` / `traitee`), lisible seulement côté serveur. Aucun
   remboursement automatique. Suivi : `npx tsx scripts/demandes-retractation.ts` (`--toutes`,
   `--traiter RET-…`).
6. **Résiliation en trois clics** : lien « Résilier votre contrat » → /resiliation
   (récapitulatif : offre, date de fin) → « Confirmer la résiliation » (API Stripe,
   `cancel_at_period_end = true`) → écran final avec date de fin et référence `RES-…`. Accusés
   dans la table `resiliations`. Liens dans les paramètres, /abonnement, /quota et le pied de
   page. Le portail Stripe reste pour le changement d'offre et de carte.
7. **Pages juridiques** : /mentions-legales, /cgv et /confidentialite affichent
   `content/legal/<page>.md`. Pied de page commun à toutes les pages (publiques et outil),
   hors vitrines des marchands.
8. **Vérifications** : voir ci-dessous.

### Décisions prises seul

- **Accusé de rétractation sans e-mail** : l'application n'envoie aucun e-mail aujourd'hui (seuls
  les e-mails d'authentification Supabase existent). L'accusé s'affiche à l'écran avec sa
  référence et la date. **L'envoi par e-mail reste à brancher** (Resend ou autre), dans
  `app/api/retractation/route.ts` et `app/api/resiliation/route.ts`.
- **Paiement bloqué tant que la migration 066 n'est pas appliquée** : si la preuve de
  consentement ne peut pas être enregistrée, le paiement est refusé (erreur 500 avec référence).
  Sans preuve, pas de paiement.
- **Résiliation enregistrée chez Stripe même si la table `resiliations` manque** (migration 068
  pas appliquée) : l'accusé est quand même affiché, l'erreur est écrite dans les logs.
- **Essai de 3 jours non modifié** : une résiliation pendant l'essai programme simplement la fin
  à la date de fin d'essai (`cancel_at_period_end`) ; la durée et le fonctionnement de l'essai
  ne changent pas. Le récapitulatif affiche « Fin de l'essai ».
- **Expert** : son abonnement Stripe est résiliable par le même parcours ; un accès ouvert à la
  main (sans abonnement Stripe) renvoie un message dédié.
- **/resiliation demande une connexion** (sans exiger d'offre active) ; /retractation n'en
  demande pas. Le lien « Résilier votre contrat » du pied de page n'apparaît qu'avec une session.
- **Textes juridiques retirés de `messages/`** :
  - la politique de confidentialité existante (FR) a été **déplacée telle quelle** dans
    `content/legal/confidentialite.md`, sans relecture. Elle est au tutoiement et ne mentionne
    pas OpenAI (la ligne était masquée sur le site) : à revoir par vous ;
  - mentions légales et CGV : le fichier ne contient que les titres de section existants, avec
    « [À COMPLÉTER PAR LENNY] » ;
  - les anciens textes des trois pages, **dans les quatre langues**, sont conservés dans
    `content/legal/archives/textes-messages-2026-11.md` (non publié) : rien n'est perdu ;
  - les pages juridiques n'existent plus qu'en une version (celle du fichier), quelle que soit
    la langue de l'interface.
- **Liens juridiques en double retirés** des pieds de page de la landing et de la page Expert
  (le pied de page commun les affiche juste en dessous). FAQ et contact restent.
- **Textes qui renvoyaient vers le portail pour résilier** corrigés : bouton de /quota
  (« Gérer mon abonnement ») et réponse FAQ « changer de plan » (4 langues).

### Vérifications (étape 8)

- `npx tsc --noEmit`, `npm run lint`, `npm test` (221 tests, 220 réussis, 1 ignoré, 0 échec)
  et `npm run build` : tous réussis, sans avertissement de lockfile.
- Sans session : /retractation, /mentions-legales, /cgv, /confidentialite → 200.
- Paiement sans consentement → 400 : couvert par le test « paiement sans les deux
  consentements : 400 consentement_requis » (`lib/consentements.test.ts`). En appel HTTP sans
  session, les quatre routes de paiement répondent d'abord 401 (connexion exigée avant tout).
- /resiliation sans session → redirection vers /login ; `POST /api/retractation` vide → 400.

### Migrations à appliquer (dans l'ordre)

#### 064_search_path_fonctions.sql

```sql
-- 064 — search_path fixé sur deux fonctions de trigger (avertissement de sécurité Supabase
-- « function_search_path_mutable »). Déjà appliquée en base.
alter function public.proteger_colonnes_facturation() set search_path = public;
alter function public.figer_config_expert() set search_path = public;
```

#### 065_webhook_stripe.sql

```sql
-- 065 — Webhook Stripe : idempotence et résiliation programmée.
--
-- 1. stripe_evenements : un même event.id reçu deux fois n'est appliqué qu'une fois
--    (lib/stripe-webhook.ts). Écrite uniquement par le serveur (service role).
-- 2. profils.annulation_fin_periode : abonnement résilié à la fin de la période en cours
--    (cancel_at_period_end côté Stripe), affiché sur /abonnement, /parametres et /resiliation.
-- 3. proteger_colonnes_facturation protège aussi cette nouvelle colonne contre une
--    modification par l'utilisateur.

create table if not exists stripe_evenements (
  id text primary key,
  type text not null,
  traite_le timestamptz not null default now()
);

alter table stripe_evenements enable row level security;
-- Aucune policy : table réservée au service role.

alter table profils add column if not exists annulation_fin_periode boolean not null default false;

create or replace function public.proteger_colonnes_facturation()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := null;
      new.stripe_customer_id := null;
      new.stripe_subscription_id := null;
      new.abonnement_statut := null;
      new.essai_fin := null;
      new.periode_fin := null;
      new.essai_utilise := false;
      new.annulation_fin_periode := false;
    else
      new.plan := old.plan;
      new.stripe_customer_id := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
      new.abonnement_statut := old.abonnement_statut;
      new.essai_fin := old.essai_fin;
      new.periode_fin := old.periode_fin;
      new.essai_utilise := old.essai_utilise;
      new.annulation_fin_periode := old.annulation_fin_periode;
    end if;
  end if;
  return new;
end;
$function$;
```

#### 066_consentements_achat.sql

```sql
-- 066 — Preuve du consentement avant paiement (droit de rétractation).
-- Écrite uniquement par le serveur (service role, lib/consentements-serveur.ts) ; chaque
-- utilisateur peut lire les siennes. Aucune modification ni suppression par l'utilisateur.

create table if not exists consentements_achat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type_achat text not null check (type_achat in (
    'abonnement_pro', 'abonnement_agency', 'abonnement_expert', 'recharge_expert',
    'formation_courte', 'formation_longue', 'formation_bundle'
  )),
  texte_case_1 text not null,
  texte_case_2 text not null,
  langue text not null default 'fr',
  adresse_ip text,
  created_at timestamptz not null default now()
);

create index if not exists consentements_achat_user_idx on consentements_achat (user_id, created_at desc);

alter table consentements_achat enable row level security;

drop policy if exists "select_own" on consentements_achat;
create policy "select_own" on consentements_achat
  for select to authenticated
  using (auth.uid() = user_id);
-- Aucune policy d'écriture : seul le service role écrit.
```

#### 067_demandes_retractation.sql

```sql
-- 067 — Demandes de rétractation déposées en ligne (/retractation).
-- Formulaire accessible sans connexion : user_id est renseigné seulement si la personne était
-- connectée. Écrite et lue uniquement par le serveur (service role) : aucune policy. Le
-- remboursement éventuel est traité à la main dans Stripe, puis statut passe à 'traitee'.

create table if not exists demandes_retractation (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  nom text not null,
  email text not null,
  achat text not null,
  achat_ref text,
  date_achat date not null,
  statut text not null default 'recue' check (statut in ('recue', 'traitee')),
  adresse_ip text,
  created_at timestamptz not null default now(),
  traitee_le timestamptz
);

create index if not exists demandes_retractation_statut_idx on demandes_retractation (statut, created_at desc);

alter table demandes_retractation enable row level security;
-- Aucune policy : table réservée au service role (liste : scripts/demandes-retractation.ts).
```

#### 068_resiliations.sql

```sql
-- Accusés de résiliation (parcours /resiliation) : preuve de la demande de résiliation
-- d'un abonnement, avec sa référence et la date de fin d'accès annoncée.
-- Écriture réservée au serveur (service role) ; chaque compte lit ses propres accusés.
create table if not exists public.resiliations (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  plan                    text not null check (plan in ('pro', 'agency', 'expert')),
  stripe_subscription_id  text not null,
  fin_acces               timestamptz,
  adresse_ip              text,
  created_at              timestamptz not null default now()
);

create index if not exists resiliations_user_idx on public.resiliations (user_id, created_at desc);

alter table public.resiliations enable row level security;

drop policy if exists resiliations_select_own on public.resiliations;
create policy resiliations_select_own on public.resiliations
  for select to authenticated
  using (auth.uid() = user_id);
```

### Ce qui reste pour vous

- Appliquer les migrations 064 à 068 (SQL ci-dessus), puis me confirmer.
- Rédiger les textes de `content/legal/mentions-legales.md`, `cgv.md` et revoir
  `confidentialite.md`.
- Dans Stripe (je n'y ai pas touché) : cocher les événements du webhook listés dans
  `.env.example`. Si vous voulez que la résiliation passe uniquement par /resiliation, désactiver
  l'option « Annuler l'abonnement » dans la configuration du portail client.
- Choisir et brancher l'envoi d'e-mails pour les accusés de rétractation et de résiliation.
- Votre décision sur l'essai de 3 jours (non modifié).
- Tester dans le navigateur : cases de consentement (/abonnement, /formation, /quota), parcours
  /retractation et /resiliation, pied de page.

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
