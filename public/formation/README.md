# public/formation/

## paged.min.js

- **Origine** : copié tel quel depuis `node_modules/pagedjs/dist/paged.min.js` (package `pagedjs`, version **0.4.3**).
- **Pourquoi un fichier statique plutôt qu'une dépendance npm** : le package `pagedjs` déclare un champ `exports` dont la condition `"import"` pointe vers sa source non bundlée (`src/index.js`), prévue pour être compilée par le pipeline de build (rollup) du projet pagedjs lui-même. Importée telle quelle via `import("pagedjs")` dans Turbopack (ou tout autre bundler tiers), cette source casse à l'exécution (`TypeError: contains.call is not a function`, une dépendance interne `dom4` mal poly-remplie). Le bundle UMD pré-construit `dist/paged.min.js` n'a pas ce problème : il est chargé directement en tant que script classique (balise `<script src="/formation/paged.min.js">`, voir `app/formation/lire/[moduleId]/PagedReader.tsx`), en dehors de toute résolution de module par le bundler.
- **API exposée** : ce build minifié expose son API sous **`window.PagedModule`** (et non `window.Paged`, comme le fait le build non minifié `dist/paged.js`) — vérifié empiriquement sur le fichier réellement servi, pas supposé depuis la documentation. Voir `PagedReader.tsx` pour l'usage (`window.PagedModule.Previewer`).
- **Mise à jour** : pour changer de version, réinstaller temporairement `pagedjs` (`npm install pagedjs@<version>`), recopier `node_modules/pagedjs/dist/paged.min.js` ici, puis désinstaller (`npm uninstall pagedjs`) — re-vérifier au passage le nom du global exposé (`Paged` vs `PagedModule` a déjà changé une fois entre builds).

## paged-reader.css

Stylesheet chargée par Paged.js pour la vue de lecture des formations (`/formation/lire/[moduleId]`) : format de page A4, marges de document, logo Dropvio en bas à droite de chaque page (`@page { @bottom-right { content: url(...) } }`), et styles typographiques du contenu markdown → HTML des leçons. Indépendante du thème clair/sombre de l'app (toujours fond blanc / texte noir, comme un document imprimé).
