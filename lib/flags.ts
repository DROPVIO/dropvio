/* Drapeaux de fonctionnalité — lus à la construction (Next.js inline les NEXT_PUBLIC_* dans
 * le bundle client), donc un changement de valeur demande un redéploiement, pas seulement un
 * redémarrage. */

/** Onglet « 🎨 Éditeur de templates » du Site Builder (app/site-builder/page.tsx).
 *
 *  Cet éditeur est l'ancien mode de création, antérieur à la génération IA. Il n'est pas
 *  supprimé — ni le composant (app/site-builder/TemplateEditor.tsx), ni les templates
 *  (lib/site-templates.ts, dont dépendent les vitrines publiques via
 *  app/boutiques/[slug]/page.tsx) — seulement masqué du sélecteur de mode, pour que les
 *  nouveaux utilisateurs n'aient qu'un seul chemin de création.
 *
 *  À false (le défaut), l'onglet disparaît du sélecteur mais le mode reste joignable par
 *  ?mode=template : les liens et marque-pages existants continuent de fonctionner, et le
 *  sélecteur réapparaît alors pour ne pas enfermer l'utilisateur dans ce mode.
 *
 *  Pour le réafficher pour tout le monde : NEXT_PUBLIC_SHOW_LEGACY_TEMPLATES=true. */
export const SHOW_LEGACY_TEMPLATES = process.env.NEXT_PUBLIC_SHOW_LEGACY_TEMPLATES === "true";
