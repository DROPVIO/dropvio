# Audit de sécurité — Dropvio

Date : 21 novembre 2026. Branche : `fix/textes-securite-landing`.
Périmètre : base Supabase (RLS, vues, fonctions, stockage), routes `app/api`, webhooks Stripe et
Shopify, secrets, HTML généré et importé, URL fournies par l'utilisateur, limites de débit,
téléversements.

Cet audit reprend celui du 20 novembre (migrations 055, 056 et 057, appliquées et vérifiées), et
revérifie chaque point sur le code et la base actuels.

## Résumé

| Gravité | Ouverts | Corrigés |
|---|---|---|
| Critique | 0 | 1 |
| Élevé | 0 | 5 |
| Moyen | 0 (2 corrigés, migrations 058 et 059 à appliquer) | 6 |
| Faible | 6 (à décider) | 3 |

Aucun constat critique ou élevé n'est ouvert. Les constats moyens et faibles restants sont
proposés en fin de fichier : dis-moi lesquels appliquer.

## Constats corrigés

### Critique

**C1 — Catalogue entier lisible sans compte.**
- Où : vue `produits_dedup`, tables `produits` et `snapshots_produits` (base) ;
  `app/api/aliexpress/products/route.ts`.
- Risque : la vue s'exécutait avec les droits de son propriétaire et était lisible par `anon` ;
  les tables avaient une policy `using (true)`. Avec la clé anon publique, n'importe qui lisait
  les 45 255 produits, liens AliExpress compris. La route de liste utilisait le client anonyme.
- Correction : migration 057 (vue en `security_invoker`, plus aucun droit `anon`, lecture
  réservée aux comptes connectés selon leur plan) ; route passée sur la session de
  l'utilisateur avec connexion obligatoire.
- Vérifié le 21/11 : sans compte, les trois objets et les deux fonctions `produits_rotation*`
  renvoient `401 permission denied`.

### Élevé

**E1 — Compteurs d'usage modifiables par l'utilisateur.**
- Où : tables `usage_mensuel` et `usage_ia_journal` ; `lib/ai-budget.ts`,
  `app/api/audit-site/route.ts`, `app/api/audit-site/html/route.ts`,
  `app/api/finder/alternatives/route.ts`.
- Risque : les policies `insert_own` / `update_own` permettaient de remettre à zéro son budget IA,
  son budget images et ses quotas d'audit.
- Correction : écritures par le service role ; migration 055 (il ne reste que `select_own`).
- Vérifié : une écriture réelle par le chemin de production a bien fait bouger les compteurs.

**E2 — Bucket public `site-images` ouvert en écriture.**
- Où : policy `Upload authentifié site-images` sur `storage.objects`.
- Risque : tout compte connecté pouvait y déposer n'importe quel fichier (HTML, SVG avec script),
  sans limite de taille, dans un bucket public.
- Correction : migration 055 (policy retirée, bucket limité aux images de 10 Mo).

**E3 — SSRF par redirection.**
- Où : `app/api/spy/route.ts`, `app/api/audit-site/from-url/route.ts`.
- Risque : l'adresse était vérifiée au départ, mais les redirections étaient suivies sans
  contrôle. Une page publique qui redirige vers `169.254.169.254` ou le réseau interne passait.
- Correction : `fetchUrlExterne` (`lib/ssrf-guard.ts:89`) suit les redirections à la main et
  revalide chaque étape avec `isUrlAllowed` (`lib/ssrf-guard.ts:45`).

**E4 — Pré-remplissage AliExpress sans authentification.**
- Où : `app/api/aliexpress/product-from-url/route.ts`.
- Risque : catalogue interrogeable sans compte.
- Correction : connexion obligatoire, lecture avec la session (RLS du plan).

**E5 — Limites de débit inefficaces sur Vercel.**
- Où : `lib/rate-limit.ts:33` et les 16 routes coûteuses.
- Risque : chaque instance avait son propre compteur en mémoire, donc la limite réelle était
  multipliée par le nombre d'instances (coût IA non maîtrisé).
- Correction : compteur partagé en base (migration 056, fonction `rate_limit_consommer`),
  avec la mémoire en premier niveau. Limites ajoutées sur `upload-image` (60/h) et
  `inspiration` (20/h).
- Vérifié : une nouvelle instance, dont la mémoire est vide, est bien refusée par la base.

### Moyen

- **M1 — Aucun en-tête de sécurité global.** Correction : `next.config.ts:46` ajoute `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` et `frame-ancestors`. Ce dernier bloque l'affichage de
  l'app dans une iframe, sauf par elle-même et par l'admin Shopify.
- **M2 — HTML importé renvoyé depuis notre domaine.** Où : `app/api/audit-site/html/route.ts:193`.
  Correction : `Content-Security-Policy: sandbox` et `nosniff` sur la réponse.
- **M3 — Export HTML.** Où : `app/api/boutiques/[id]/export-html/route.ts`. Correction : seules les
  feuilles de style servies par l'app elle-même sont récupérées.
- **M4 — Lectures du catalogue depuis le navigateur.** Où : `app/dashboard/page.tsx`,
  `app/produits-gagnants/page.tsx`. Correction : passées par `/api/catalogue/compte` et
  `/api/catalogue/croissance`.

### Faible

- **F1 — Webhook Stripe en erreur 500 quand la configuration est absente.**
  - Où : `app/api/webhooks/stripe/route.ts:22-31`.
  - Risque : le client Stripe était créé avant la vérification de la signature ; sans clé, la
    route plantait (500). Aucune donnée n'était traitée, mais le refus n'était pas net.
  - Correction (21/11) : signature absente → 400, configuration absente → 503, signature
    invalide → 401. La signature reste vérifiée sur le corps brut avant tout traitement.
- **F2 — `/api/aliexpress/products`.** Connexion désormais exigée (voir C1).
- **F3 — Formation.** Le contenu payant des leçons n'est jamais envoyé à un visiteur (vérifié : 0
  leçon sur 53).

## Points vérifiés et conformes

- **RLS** : activé sur toutes les tables de `public`. Aucune policy d'écriture sans `auth.uid()`,
  aucune lecture `using (true)` restante. Les tables sans policy (`aliexpress_tokens`,
  `shopify_connections`, `notifications`, `commandes_a_preparer`, `shopify_incidents`,
  `catalogue_free`, `rate_limites`) ne sont accessibles qu'au service role.
- **Profils** : le trigger `proteger_colonnes_facturation` empêche un utilisateur de changer son
  plan ou ses colonnes de facturation.
- **Fonctions qui s'exécutent avec les droits du propriétaire** : celles qui prennent un
  `p_user_id` (`outils_credits_reserver`, `rate_limit_consommer`…) sont réservées au service role.
- **Routes API** : 82 appels sans session sur toutes les routes non publiques. 78 sont refusés
  (401, 403 ou redirection). Les 4 autres ne renvoient aucune donnée privée :
  - `/api/plan` renvoie `free` ;
  - `/api/expert/paiement-action` renvoie `url: null` ;
  - `/api/formation` renvoie la liste des leçons sans leur contenu ;
  - `/api/sites-generes/[id]` renvoie 404 (voir F4).
- **Webhook Stripe** : signature vérifiée sur le corps brut avant tout traitement. Sans signature,
  avec une fausse, avec un corps modifié ou un mauvais secret : rejeté ; seule la signature
  valide passe (testé).
- **Webhooks Shopify** (commandes et les 3 webhooks RGPD) : HMAC vérifié sur le corps brut avec
  comparaison à temps constant ; un HMAC faux donne 401 (testé). Retour OAuth : HMAC et état
  vérifiés.
- **Secrets** :
  - aucune clé dans le code, le dossier `public/`, les logs ou les réponses d'API ;
  - aucune clé dans les 100 derniers commits ;
  - `.env.local` est ignoré par git ;
  - le service role n'est importé par aucun composant client ;
  - les seules variables `NEXT_PUBLIC_` sont publiques par nature (URL et clé anon Supabase,
    domaine, drapeau d'affichage).
- **HTML généré par l'IA** (testé dans Chromium sans interface, avec un HTML qui tente d'exécuter
  un script, de lire le cookie et la session, de modifier la page parente et de rediriger) :
  - aperçu du Site Builder (`app/site-builder/page.tsx:1499`, `TemplateEditor.tsx:608`,
    `sandbox="allow-same-origin"` sans scripts) : aucun script ne s'exécute ;
  - aperçu multipage (`components/site-builder/ApercuPages.tsx:143`, `sandbox="allow-scripts"`
    sans `allow-same-origin`) : le script tourne dans un cadre isolé, sans accès à la page
    parente, au cookie ni à la session, et sans redirection ;
  - aucune page de l'app n'insère de HTML généré (`dangerouslySetInnerHTML` sert uniquement au
    JSON-LD échappé et aux leçons de la formation, notre propre contenu) ;
  - les fichiers HTML ne sont proposés qu'en téléchargement.
- **Téléversements** :
  - `upload-image` : 8 Mo, ré-encodage sharp qui valide le vrai type, nom aléatoire préfixé par
    l'utilisateur ;
  - import vers la médiathèque : type vérifié par les premiers octets
    (`media/import/confirmer/route.ts:33`), chemin contrôlé par une expression régulière, 10 Mo,
    bucket privé ;
  - `avis-capture` et `inspiration` : 15 Mo, format détecté par les octets puis conversion en
    JPEG.

## Constats ouverts — à décider

Les constats faibles ci-dessous ne sont pas appliqués : dis-moi lesquels faire. FO3 demande une migration.

### Moyen — corrigés le 21/11, en attente d'application des migrations

**MO1 — Limites de plan contournables par l'API REST.** Corrigé par la migration
`059_limite_produits_boutique.sql`, à appliquer.
- Où : table `boutique_produits` (policy `insert_own`).
- Avant : la limite n'était appliquée que par `app/api/boutiques/[id]/produits/route.ts` ; un
  ajout direct par l'API dépassait `produitsBoutiqueMax`.
- Correction :
  - un trigger refuse tout ajout au-delà de la limite (Free 0, Pro et Agency 200, Expert
    illimité seulement avec une période en cours) ;
  - la ligne de la boutique est verrouillée pendant le contrôle, ce qui empêche deux ajouts
    simultanés de dépasser la limite ensemble ;
  - la route traduit le refus en 403 avec le message de limite habituel.
- Les limites sont recopiées dans le SQL : un commentaire dans `lib/plan-limits.ts` le rappelle.

**MO2 — Plan Expert expiré.** Corrigé dans le code ; la partie base attend la migration
`058_expert_expire_catalogue.sql`.
- Où : `middleware.ts` (fonction `readProfil`) et fonction SQL `a_un_plan_payant`.
- Correction :
  - le middleware traite un Expert sans période en cours comme un compte Free ; la règle est
    dans `lib/plan-effectif.ts` et couverte par 4 tests unitaires ;
  - la migration 058 applique la même règle au RLS du catalogue : un Expert expiré retombe sur
    la sélection Free.

### Faible

- **FO1 — Messages d'erreur techniques renvoyés au navigateur.** 55 réponses d'API renvoient le
  message brut de la base (exemples : `app/api/media/route.ts:33`,
  `app/api/sites-generes/[id]/route.ts:201`). Proposition : message générique côté client, détail
  dans les logs.
- **FO2 — `/api/sites-generes/[id]` sans session répond 404 au lieu de 401**
  (`app/api/sites-generes/[id]/route.ts:28`). Aucune fuite (le RLS bloque). Proposition : vérifier
  la session d'abord.
- **FO3 — `handle_new_user` exécutable par `anon`.** C'est une fonction de trigger, que l'API ne
  peut pas appeler directement. Proposition : retirer le droit d'exécution à `anon` et
  `authenticated` (migration).
- **FO4 — Changement d'adresse DNS entre la vérification et l'appel.** `isUrlAllowed` résout le nom,
  puis `fetch` le résout à nouveau. Proposition : appeler l'adresse IP vérifiée, ou passer par un
  proxy de sortie. Risque faible sur Vercel.
- **FO5 — Limites de l'authentification.** La connexion et l'inscription passent directement par
  Supabase Auth. Proposition : vérifier dans le tableau de bord Supabase les limites de débit et
  activer un CAPTCHA sur l'inscription.
- **FO6 — Hôtes de photos trop larges.** `lib/media/images-produits.ts:12` accepte toute adresse
  `*.supabase.co`, donc le stockage public de n'importe quel projet Supabase. Une telle photo
  n'est affichée qu'à l'utilisateur qui l'a choisie, mais peut servir d'image de référence envoyée
  à OpenAI. Proposition : n'accepter que l'hôte du projet (`NEXT_PUBLIC_SUPABASE_URL`).

Pas de route de partage dans l'application : le point « limites de débit sur le partage » est
sans objet.
