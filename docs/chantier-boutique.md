# Chantier : mode boutique multi-produits du Site Builder

Spécification du parcours « Créer mon site » depuis une boutique qui contient plusieurs produits.
Les numéros de ligne correspondent à l'état du code au 11 octobre 2026, avec les modifications
non commitées de `app/site-builder/boutique/[id]/page.tsx` et `app/site-builder/page.tsx`.

## 1. État actuel

Le mode boutique existe de bout en bout côté builder et côté API, mais rien ne l'active.

| Point | Constat | Où |
|---|---|---|
| Hand-off jamais écrit | `writeBoutiqueDraft` est défini mais n'est appelé nulle part dans le projet. | `lib/site-builder-handoff.ts:32-39` |
| `multi=1` jamais posé | Le builder ne lit le brouillon que si l'URL contient `multi=1`, et aucun code ne construit d'URL avec ce paramètre. | lecture : `app/site-builder/page.tsx:99-101` |
| Pas de lien AliExpress dans le type | `ProduitBoutique` contient `nom`, `description`, `image`, `prixVente` et `prixOriginal`, sans lien AliExpress. La table `boutique_produits` n'a pas non plus de colonne de lien, seulement `source_produit_id` (référence vers `produits`). | `lib/site-templates.ts:317-323`, `supabase/migrations/012_boutiques.sql:33-50` |
| Prompt limité à 10 produits | Seuls les 10 premiers produits (nom et prix) sont décrits au modèle pour donner le ton. La grille réelle est injectée par code pour **tous** les produits reçus. | `app/api/generate-site/route.ts:476-480` (aperçu), `:154-169` (`injectProductGrid`) |
| Plafond de 30 produits | `BOUTIQUE_PRODUITS_CAP = 30`. Seul l'éditeur de produits du builder l'applique (bouton « Ajouter » désactivé) : ni l'API ni le hand-off ne tronquent la liste. | `lib/site-builder-handoff.ts:11`, `components/site-builder/BoutiqueProduitsEditor.tsx:29,62` |
| `sessionStorage` à usage unique | `readAndClearBoutiqueDraft` supprime l'entrée dès la première lecture. Un rechargement du builder retombe sur le mode produit unique, vide. | `lib/site-builder-handoff.ts:43-54` |

Autres constats utiles pour la suite :

- **Le bouton actuel « 🤖 Créer mon site »** (`handleCreerMonSite`, `app/site-builder/boutique/[id]/page.tsx:454`) enregistre la description et la palette, puis ouvre le builder **en mode produit unique**. L'URL contient alors `name`, `description`, `image` (celle du premier produit qui en a une), `prixVente`/`prixOriginal` (ceux du premier produit qui a un prix) et `colorPrimary`/`colorSecondary`/`colorAccent`. Le builder lit ces couleurs comme palette initiale (`app/site-builder/page.tsx`, `initialPaletteFromParams`) et ces prix comme valeurs initiales des champs prix.
- **La page boutique n'a qu'une page de produits en mémoire**, 20 par défaut (`DEFAULT_PAGE_SIZE`, ligne 44, `fetchProducts`, ligne 370). Transmettre « tous les produits » demande donc un chargement complet, que l'état actuel de la page ne contient pas.
- **Le payload boutique du builder** (`app/site-builder/page.tsx:396-405`) envoie déjà `produits`, la palette et `style` à `/api/generate-site`, qui bascule sur `handleGenerateBoutique` (`route.ts:426`).
- **Choisir un style remplace la palette** : un clic sur un style met `draftPalette` à `s.defaultPalette` (`app/site-builder/page.tsx:921-923`), et « Enregistrer » copie cette palette dans `palette` (`:1002-1003`). La palette de la boutique est donc perdue dès qu'on change de style.
- **Les sites boutique ne sont pas régénérables à l'identique** : en mode boutique, les champs de régénération (description, prix, palette, style) ne sont pas enregistrés dans `sites_generes` (`app/site-builder/page.tsx:452-462`).

## 2. Objectif

Depuis une boutique de plusieurs produits, « 🤖 Créer mon site » ouvre le Site Builder en mode boutique, prérempli avec :

- tous les produits de la boutique, dans la limite qui sera retenue (voir décisions ouvertes) ;
- pour chaque produit : nom, description, image, `prixVente` et `prixOriginal` ;
- la palette de la boutique (primaire, secondaire, accent).

L'utilisateur arrive sur le bandeau « 🏪 Mode boutique » avec la liste des produits modifiable, puis génère une page catalogue dont la grille contient les vrais prix et les vraies images.

## 3. Étapes

### Étape 1 : charger tous les produits de la boutique

- **Fichiers :** `app/site-builder/boutique/[id]/page.tsx`, éventuellement `app/api/boutiques/[id]/produits/route.ts` en lecture seule (pour connaître la limite maximale de `limit`).
- **Changement :** une fonction qui récupère tous les produits de la boutique, indépendamment de la pagination affichée (appels successifs ou un seul appel avec un `limit` élevé, selon la décision sur la limite).
- **Test :** sur une boutique de 25 produits, la fonction renvoie 25 éléments, alors que la liste affichée n'en montre que 20.

### Étape 2 : convertir les produits au format `ProduitBoutique`

- **Fichiers :** `app/site-builder/boutique/[id]/page.tsx` ou un petit module dans `lib/`.
- **Changement :** conversion `BoutiqueProduct` → `ProduitBoutique` : `image_urls[0]` devient `image` (ou `null`), `prix_vente`/`prix_original` (nombres) deviennent `prixVente`/`prixOriginal` (chaînes, au format attendu par `productGridSection`), et une description absente devient `""`.
- **Test :** test unitaire de la conversion. Un produit sans image donne `image: null`, un produit sans prix barré donne `prixOriginal: ""`, et `prix_vente: 19.9` donne la chaîne attendue par la grille.

### Étape 3 : écrire le brouillon et poser `multi=1`

- **Fichiers :** `app/site-builder/boutique/[id]/page.tsx` (`handleCreerMonSite`, `buildSiteBuilderPrefillUrl`).
- **Changement :** après l'enregistrement de la description et de la palette, `handleCreerMonSite` appelle `writeBoutiqueDraft({ boutiqueId, nomBoutique, descriptionBoutique, produits, totalProduitsBoutique })`, puis navigue vers le builder avec `multi=1`, `boutiqueId` et les trois couleurs. Le bouton « Génération IA » de la section produit unique ne change pas.
- **Test :** dans le navigateur, après le clic, l'URL contient `multi=1`. Dans le builder, le bandeau affiche « Mode boutique — <nom> : N produits importés », et la clé `dropvio-site-builder-boutique-draft` a disparu de `sessionStorage`.

### Étape 4 : garder la palette de la boutique en mode boutique

- **Fichiers :** `app/site-builder/page.tsx`.
- **Changement :** la palette initiale vient déjà de l'URL. Il reste à appliquer la décision sur le comportement du style (voir décisions ouvertes, point 5).
- **Test :** arrivée depuis une boutique de palette `#112233 / #445566 / #778899`. Les trois couleurs s'affichent dans le panneau de palette, et la requête `POST /api/generate-site` les envoie dans `colorPrimary`, `colorSecondary` et `colorAccent`.

### Étape 5 : appliquer la limite de produits

- **Fichiers :** `lib/site-builder-handoff.ts` (constante), `app/site-builder/boutique/[id]/page.tsx` (troncature avant `writeBoutiqueDraft`), éventuellement `app/api/generate-site/route.ts` (contrôle côté serveur, qui touche une route API et doit donc être validé à part).
- **Changement :** la liste transmise est tronquée à la limite retenue, et `totalProduitsBoutique` garde le total réel.
- **Test :** sur une boutique de 35 produits avec une limite de 30, le bandeau affiche « 30 produits importés sur 35 au total (plafond de 30 atteint) ».

### Étape 6 : vérifier la génération boutique de bout en bout

- **Fichiers :** aucun nouveau changement, c'est l'étape de validation.
- **Changement :** aucun.
- **Test :** générer une page depuis une boutique de 12 produits. Le HTML final contient 12 cartes `.grille-carte`, avec les prix et les images de la base. Les couleurs `--site-accent`, `--site-accent-2` et `--site-bg-alt` correspondent à la palette de la boutique. Le site apparaît dans « Mes sites » avec `boutique_id` renseigné.

### Étape 7 : gérer le rechargement et le retour arrière

- **Fichiers :** `app/site-builder/page.tsx`, `lib/site-builder-handoff.ts`.
- **Changement :** selon la décision sur le transport, soit un message clair quand `multi=1` est présent mais que le brouillon a déjà été consommé (aujourd'hui, retour silencieux au mode produit unique vide), soit une relecture possible.
- **Test :** recharger le builder après l'arrivée en mode boutique. On obtient le comportement retenu, et jamais un formulaire produit unique vide sans explication.

## 4. Décisions ouvertes

Ces points ne sont pas tranchés ici.

1. **Transport des produits :** URL, `sessionStorage` (le mécanisme déjà prévu, à usage unique) ou API (le builder recharge les produits à partir de `boutiqueId`). Les critères : taille de l'URL, survie au rechargement, données à jour, et pas de nouvelle route sans validation.
2. **Limite de produits :** garder `BOUTIQUE_PRODUITS_CAP = 30`, en choisir une autre, ou aucune. Il faut aussi décider si l'API doit appliquer la limite elle-même, puisqu'aujourd'hui elle ne le fait pas.
3. **Prix injectés par code ou par le modèle :** aujourd'hui, la grille (prix, images) est injectée par code, et le modèle ne voit qu'un aperçu de 10 produits avec consigne de ne pas citer les prix exacts. Faut-il garder ce partage, ou laisser le modèle écrire des fiches produit ?
4. **Lien AliExpress dans le type :** ajouter un lien à `ProduitBoutique`, ce qui suppose de savoir d'où il vient, puisque `boutique_produits` n'a que `source_produit_id`, ou s'en passer en mode boutique.
5. **Effet du style choisi sur la palette de la boutique :** aujourd'hui, choisir un style remplace la palette par celle du style. Options possibles : le style ne change que le ton et garde la palette de la boutique ; il la remplace comme aujourd'hui ; ou un bouton permet de revenir à la palette de la boutique.

## 5. Risques

- **Régression du mode produit unique :** le builder partage l'état (`palette`, `productName`, `description`, prix) et `handleGenerate` entre les deux modes, et c'est la présence de `boutiqueDraft` qui choisit le payload. À vérifier à chaque étape : une arrivée sans `multi=1`, que ce soit depuis la section « Génération IA » de la boutique, le lien « Éditeur de templates » ou `?regenerate=<id>` depuis « Mes sites », doit continuer à préremplir et générer exactement comme avant.
- **Sites déjà créés :** les sites boutique enregistrés dans `sites_generes` n'ont pas de champs de régénération. « Regénérer » depuis « Mes sites » ne peut pas reconstruire un site boutique, et ce chantier ne change rien aux sites existants. Si le format de `ProduitBoutique` change (point 4), les sites déjà générés ne sont pas concernés : seul leur HTML est stocké.
- **Export Shopify :** `app/api/sites-generes/[id]/shopify-push/route.ts` pousse le HTML tel quel (mode `html`) ou converti en section Liquid (mode `liquid`, `lib/html-to-liquid.ts`). La grille boutique ajoute ses propres scripts de commande (`produitsCheckoutScripts`). Il faut vérifier qu'ils survivent à la conversion Liquid et fonctionnent dans une page Shopify. C'est distinct de `app/api/boutiques/[id]/shopify-push`, qui pousse les produits de la boutique et non le site généré.
