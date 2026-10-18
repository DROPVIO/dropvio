import type { SiteCtx, TextesSite } from "@/lib/site-textes";

// Site boutique multi-pages : chaque page est un HTML standalone (même <head>, même navbar,
// même footer), et la navigation pointe vers des fichiers, plus vers des ancres. Les pages
// sont ASSEMBLÉES à partir de ce que le code connaît déjà au moment de l'injection (grille du
// catalogue, grilles des collections, scripts de commande), et non obtenues en analysant le
// HTML final : la coquille écrite par Claude n'est découpée qu'en blocs stables (avant le
// catalogue, la section #catalogue réduite au marqueur, le footer). Aucune dépendance serveur.
//
// Pas encore branché sur la génération (app/api/generate-site/route.ts) : voir la liste « ce
// qui reste » du chantier. Stockage : sites_generes.pages (040_sites_generes_pages.sql), la
// page d'accueil restant aussi dans html_content.

// Clé → HTML standalone. « accueil » est toujours présente.
export type PagesSite = { accueil: string } & Record<string, string>;

export const CLE_ACCUEIL = "accueil";
export const CLE_CATALOGUE = "catalogue";

// Pages exploitables d'un site (objet clé → HTML non vide), seulement s'il y en a au moins
// deux ; sinon null : le site s'affiche et se traite comme une seule page (html_content).
export function pagesSiMultiples(pages: unknown): Record<string, string> | null {
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return null;
  const entrees = Object.entries(pages).filter(([, html]) => typeof html === "string" && html.trim() !== "");
  return entrees.length > 1 ? reparerPages(Object.fromEntries(entrees) as Record<string, string>) : null;
}

// Pages envoyées par le client : objet clé → HTML non vide, clés limitées à [a-z0-9-] (elles
// deviennent des noms de fichiers et des handles Shopify).
export function pagesValides(pages: unknown): pages is Record<string, string> {
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return false;
  const entrees = Object.entries(pages);
  return (
    entrees.length > 0 &&
    entrees.every(([cle, html]) => /^[a-z0-9-]+$/.test(cle) && typeof html === "string" && html.trim() !== "")
  );
}

// Nom de fichier d'une page : index.html pour l'accueil (servi par défaut par tout
// hébergement statique), <clé>.html sinon.
export function fichierPage(cle: string): string {
  return cle === CLE_ACCUEIL ? "index.html" : `${cle}.html`;
}

// Clé limitée à [a-z0-9-], rendue unique par rapport à celles déjà prises (mutées ici).
export function cleDePage(brut: string, prises: Set<string>): string {
  const base =
    brut
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page";
  let cle = base;
  for (let n = 2; prises.has(cle); n++) cle = `${base}-${n}`;
  prises.add(cle);
  return cle;
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Structure d'une page : où commence et finit le contenu propre à la page ─────────────
// Le découpage ne peut pas se faire au texte « </nav> » : la navbar est souvent imbriquée
// (<header><div class="row">logo <nav>…</nav> bouton</div></header>), et couper juste après
// </nav> laissait les </div></header> dans le contenu de l'accueil. Les autres pages
// recevaient alors leur contenu et leur footer À L'INTÉRIEUR de l'en-tête (affichés à côté du
// logo), et le fichier téléchargé fermait trop tôt le bloc de l'accueil. On reconstruit donc
// l'arbre des éléments du <body> et on prend l'ancêtre commun le plus proche de la <nav> et
// du <footer> : ses enfants qui contiennent la nav et le footer sont la « coquille » haute et
// basse, et tout ce qui se trouve entre eux est le contenu de la page. Une page mal assemblée
// par l'ancienne version (contenu resté dans l'en-tête) donne aussi le bon contenu : nav et
// footer y ont pour ancêtre commun l'en-tête, et le contenu est entre les deux.

type Noeud = { tag: string; debut: number; fin: number; parent: Noeud | null };

const VIDES = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const JETON =
  /<!--[\s\S]*?-->|<(script|style|template|textarea|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)(?:\s(?:"[^"]*"|'[^']*'|[^'">])*)?(\/?)>/g;

// Éléments du <body> (bornes absolues dans html), avec leur parent. Les éléments non fermés
// se terminent à </body>, comme le fait le navigateur.
function analyserCorps(html: string, debut: number, fin: number): Noeud[] {
  const noeuds: Noeud[] = [];
  const pile: Noeud[] = [];
  const morceau = html.slice(debut, fin);
  JETON.lastIndex = 0;
  for (let m = JETON.exec(morceau); m; m = JETON.exec(morceau)) {
    if (m[2]) {
      const tag = m[2].toLowerCase();
      const i = pile.map((n) => n.tag).lastIndexOf(tag);
      if (i === -1) continue;
      while (pile.length > i) pile.pop()!.fin = debut + m.index + m[0].length;
    } else if (m[3]) {
      const tag = m[3].toLowerCase();
      const noeud: Noeud = { tag, debut: debut + m.index, fin: debut + m.index + m[0].length, parent: pile[pile.length - 1] ?? null };
      noeuds.push(noeud);
      if (!VIDES.has(tag) && m[4] !== "/") pile.push(noeud);
    }
  }
  for (const n of pile) n.fin = fin;
  return noeuds;
}

function ancetres(n: Noeud): Noeud[] {
  const chaine: Noeud[] = [];
  for (let a: Noeud | null = n; a; a = a.parent) chaine.unshift(a);
  return chaine;
}

type StructurePage = {
  debutBody: number; // juste après <body…>
  finBody: number; // position de </body>
  hautDebut: number; // début de la coquille haute (élément qui contient la nav)
  hautFin: number; // fin de la coquille haute = début du contenu propre
  basDebut: number; // fin du contenu propre = début de la coquille basse (footer)
  basFin: number; // fin de la coquille basse
};

export function structurePage(html: string): StructurePage | null {
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) return null;
  const debutBody = body.index + body[0].length;
  const fermeture = html.toLowerCase().lastIndexOf("</body>");
  const finBody = fermeture >= debutBody ? fermeture : html.length;
  const noeuds = analyserCorps(html, debutBody, finBody);
  const nav = noeuds.find((n) => n.tag === "nav");
  if (!nav) return null;
  const footers = noeuds.filter((n) => n.tag === "footer" && n.debut > nav.debut);
  const footer = footers[footers.length - 1];

  const cheminNav = ancetres(nav);
  if (!footer) {
    // Sans footer : la coquille haute est l'élément de premier niveau qui contient la nav.
    const haut = cheminNav[0];
    return { debutBody, finBody, hautDebut: haut.debut, hautFin: haut.fin, basDebut: finBody, basFin: finBody };
  }
  const cheminFooter = ancetres(footer);
  let commun = 0;
  while (commun < cheminNav.length && commun < cheminFooter.length && cheminNav[commun] === cheminFooter[commun]) commun++;
  const haut = cheminNav[commun] ?? nav;
  const bas = cheminFooter[commun] ?? footer;
  if (bas.debut < haut.fin) return null;
  return { debutBody, finBody, hautDebut: haut.debut, hautFin: haut.fin, basDebut: bas.debut, basFin: bas.fin };
}

type CoquilleDecoupee = {
  tete: string; // du début jusqu'à <body…> inclus
  avantNav: string; // entre <body> et <nav>
  nav: string; // <nav>…</nav>
  accueil: string; // après la nav jusqu'à <section id="catalogue"> exclu (hero + bandeau…)
  entre: string; // après la section #catalogue jusqu'au footer (normalement vide)
  footer: string; // <footer>…</footer>, vide s'il n'y en a pas
  fin: string; // après le footer jusqu'à </body> exclu (scripts de la coquille)
  fermeture: string; // </body></html> et la suite
};

// Découpe la coquille du mode boutique (sortie de Claude, éventuellement déjà passée par
// l'injection des tokens et du CSS de grille). La coquille décrit en principe l'accueil seul :
// sans section #catalogue, tout ce qui suit la navbar jusqu'au footer est l'accueil. Une
// ancienne coquille avec #catalogue (réduite à son marqueur GRILLE_PRODUITS) reste acceptée,
// la section étant alors exclue de l'accueil. Renvoie null si body ou nav manque, ou si une
// section #catalogue est présente sans son marqueur : l'appelant garde alors une seule page.
export function decouperCoquille(html: string): CoquilleDecoupee | null {
  const st = structurePage(html);
  if (!st) return null;
  const { debutBody, finBody, hautDebut, hautFin, basDebut, basFin } = st;
  const aFooter = basFin > basDebut;

  // Zone propre à la page : entre la coquille haute et la coquille basse.
  const catalogue = /<section\b[^>]*\bid=["']catalogue["'][^>]*>/i.exec(html.slice(hautFin, basDebut));
  let debutCatalogue = basDebut;
  let finCatalogue = basDebut;
  if (catalogue) {
    debutCatalogue = hautFin + catalogue.index;
    // La section #catalogue ne doit contenir que le marqueur : elle se ferme au premier
    // </section> qui le suit.
    const marqueur = html.indexOf("<!-- GRILLE_PRODUITS -->", debutCatalogue);
    if (marqueur === -1 || marqueur > basDebut) return null;
    const fermetureSection = html.indexOf("</section>", marqueur);
    if (fermetureSection === -1) return null;
    finCatalogue = fermetureSection + "</section>".length;
    if (basDebut < finCatalogue) return null;
  }

  return {
    tete: html.slice(0, debutBody),
    avantNav: html.slice(debutBody, hautDebut),
    nav: html.slice(hautDebut, hautFin),
    accueil: html.slice(hautFin, debutCatalogue),
    entre: html.slice(finCatalogue, basDebut),
    footer: aFooter ? html.slice(basDebut, basFin) : "",
    fin: html.slice(aFooter ? basFin : basDebut, finBody),
    fermeture: html.slice(finBody),
  };
}

export type EntreeNav = { cle: string; titre: string };

// Liens de navigation vers les pages : href="index.html", "catalogue.html",
// "collection-<slug>.html" — jamais d'ancre. Même classe que les liens de la navbar d'origine ;
// la page courante porte aria-current="page".
export function genererNav(pages: EntreeNav[], classe?: string, cleActive?: string): string {
  const attrClasse = classe ? ` class="${echapper(classe)}"` : "";
  return pages
    .map(
      (p) =>
        `<a href="${fichierPage(p.cle)}"${attrClasse}${p.cle === cleActive ? ' aria-current="page"' : ""}>${echapper(p.titre)}</a>`
    )
    .join("\n");
}

const LIEN = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
function href(lien: string): string | undefined {
  return /\bhref=["']([^"']*)["']/i.exec(lien)?.[1];
}
function classeDe(lien: string): string | undefined {
  return /\bclass=["']([^"']*)["']/i.exec(lien)?.[1];
}

// Remplace, dans la navbar d'origine, les liens de navigation écrits par Claude — sous forme
// d'ancre (#accueil, #catalogue, #collection-…) ou de page (index.html, catalogue.html,
// collection-….html) — et le marqueur NAV_COLLECTIONS par les liens vers les pages, insérés à
// la place du premier lien retiré. Un lien vers le catalogue n'est retiré que s'il a la même
// classe que le lien Accueil : le bouton CTA « Voir les produits » reste. Les autres liens
// (logo, CTA) restent ; leurs ancres sont ensuite réécrites par reecrireAncres.
export function navAvecPages(nav: string, pages: EntreeNav[], cleActive?: string): string {
  const liens = nav.match(LIEN) ?? [];
  const versAccueil = (h?: string) => h === "#accueil" || h === "index.html";
  const versCatalogue = (h?: string) => h === "#catalogue" || h === "catalogue.html";
  const lienAccueil = liens.find((l) => versAccueil(href(l)));
  const classe = classeDe(lienAccueil ?? liens.find((l) => versCatalogue(href(l))) ?? "");
  const aRetirer = (l: string) => {
    const h = href(l);
    return (
      versAccueil(h) ||
      /^(#collection-[a-z0-9-]+|collection-[a-z0-9-]+\.html)$/i.test(h ?? "") ||
      (versCatalogue(h) && classeDe(l) === classe)
    );
  };

  let insere = false;
  const nouveauxLiens = genererNav(pages, classe, cleActive);
  let result = nav.replace(LIEN, (l) => {
    if (!aRetirer(l)) return l;
    if (insere) return "";
    insere = true;
    return nouveauxLiens;
  });
  result = result.replace("<!-- NAV_COLLECTIONS -->", insere ? "" : nouveauxLiens);
  if (!insere && !nav.includes("<!-- NAV_COLLECTIONS -->")) {
    // Le segment peut englober la nav dans son en-tête (<header>…<nav>…</nav>…</header>).
    const fin = result.toLowerCase().lastIndexOf("</nav>");
    if (fin !== -1) result = `${result.slice(0, fin)}${nouveauxLiens}\n${result.slice(fin)}`;
  }
  return result;
}

// Réécrit les ancres qui désignent une page (href="#accueil", "#catalogue", "#collection-…")
// en liens vers son fichier, seulement si la page existe. Les autres ancres (internes à une
// page) ne changent pas.
export function reecrireAncres(html: string, cles: Set<string>): string {
  return html.replace(/\bhref=(["'])#([a-z0-9-]+)\1/gi, (tout, guillemet: string, cible: string) =>
    cles.has(cible) ? `href=${guillemet}${fichierPage(cible)}${guillemet}` : tout
  );
}

export type ContenusBoutique = {
  // Contenu injecté dans la section #catalogue (grille complète, titre compris).
  catalogue: string;
  // Une entrée par collection non vide : titre affiché et contenu (titre + grille).
  collections: { slug: string; titre: string; html: string }[];
  // Scripts de commande de toutes les grilles, ajoutés à chaque page (ils ignorent les
  // éléments absents de la page).
  scripts: string;
  // Textes déjà renseignés pour les pages légales (voir PAGES_LEGALES).
  legales?: ContenusLegaux;
};

// Pages légales de tout site généré (boutique et produit unique), produites par le code et
// jamais remplies par l'IA : vierges (navbar, titre, footer) sauf si un texte a déjà été
// renseigné — aujourd'hui, seules les mentions légales d'une boutique (boutiques.mentions_legales).
// motif : reconnaît le lien correspondant dans le footer écrit par Claude, dans l'une des
// langues de site (fr, en, es, it). titre : clé du titre dans siteContenu.pages.
export const PAGES_LEGALES = [
  {
    cle: "mentions-legales",
    titre: "mentionsLegales",
    motif: /mentions?\s+l[ée]gales?|legal\s+notice|imprint|aviso\s+legal|note\s+legali/i,
  },
  {
    cle: "cgv",
    titre: "cgv",
    motif: /\bcgv\b|conditions\s+g[ée]n[ée]rales|terms|t[ée]rminos|condiciones|condizioni|termini/i,
  },
  {
    cle: "confidentialite",
    titre: "confidentialite",
    motif: /confidentialit[ée]|donn[ée]es\s+personnelles|privacy|privacidad|riservatezza/i,
  },
] as const satisfies readonly { cle: string; titre: keyof TextesSite["pages"]; motif: RegExp }[];

export type ContenusLegaux = { mentionsLegales?: string | null };

// Titre d'une page connue (accueil, catalogue, page légale) dans la langue du site ;
// undefined sinon (collections : leur titre vient de la catégorie).
export function titrePageConnue(cle: string, pages: TextesSite["pages"]): string | undefined {
  if (cle === CLE_ACCUEIL) return pages.accueil;
  if (cle === CLE_CATALOGUE) return pages.catalogue;
  const legale = PAGES_LEGALES.find((p) => p.cle === cle);
  return legale ? pages[legale.titre] : undefined;
}

function pageLegale(cle: string, titre: string, texte?: string | null): string {
  const t = texte?.trim();
  return `<section id="${cle}" class="page-legale" style="min-height:60vh;max-width:820px;margin:0 auto;padding:120px 24px 80px;">
  <h1>${echapper(titre)}</h1>${
    t ? `\n  <div class="page-legale-texte" style="margin-top:24px;white-space:pre-line;line-height:1.7;">${echapper(t)}</div>` : ""
  }
</section>`;
}

// Liens légaux du footer : chaque lien dont le texte désigne une page légale pointe vers son
// fichier. Si le footer n'en contient aucun, une ligne de liens légaux y est ajoutée.
export function footerAvecPagesLegales(footer: string, pages: TextesSite["pages"]): string {
  if (!footer) return footer;
  const trouvees = new Set<string>();
  const result = footer.replace(LIEN, (lien) => {
    const texte = lien.replace(/<[^>]*>/g, " ");
    const page = PAGES_LEGALES.find((p) => p.motif.test(texte));
    if (!page) return lien;
    trouvees.add(page.cle);
    const cible = fichierPage(page.cle);
    return /\bhref=["'][^"']*["']/i.test(lien)
      ? lien.replace(/\bhref=(["'])[^"']*\1/i, `href="${cible}"`)
      : lien.replace(/^<a\b/i, `<a href="${cible}"`);
  });
  if (trouvees.size > 0) return result;
  const liens = PAGES_LEGALES.map((p) => `<a href="${fichierPage(p.cle)}">${echapper(pages[p.titre])}</a>`).join(" · ");
  return result.replace(/<\/footer>\s*$/i, `<div class="liens-legaux">${liens}</div>\n</footer>`);
}

// Sur une page autre que l'accueil, les ancres internes (href="#x") visent des sections de
// l'accueil : elles deviennent index.html#x (href="#" seul → index.html).
function ancresVersAccueil(html: string): string {
  return html.replace(/\bhref=(["'])#([^"']*)\1/gi, (_tout, guillemet: string, ancre: string) =>
    `href=${guillemet}${fichierPage(CLE_ACCUEIL)}${ancre ? `#${ancre}` : ""}${guillemet}`
  );
}

// Assemble les pages d'un site boutique : « accueil » (tout ce que la coquille place avant le
// catalogue : hero, bandeau…), « catalogue » (grille complète), puis une page
// « collection-<slug> » par collection, et les trois pages légales (hors navbar, liées depuis
// le footer). Sans collection : accueil + catalogue + pages légales. null si la coquille ne
// peut pas être découpée (le site reste alors en une seule page).
export function assemblerPagesBoutique(coquille: string, contenus: ContenusBoutique, ctx: SiteCtx): PagesSite | null {
  const d = decouperCoquille(coquille);
  if (!d) return null;

  const prises = new Set<string>([CLE_ACCUEIL, CLE_CATALOGUE, ...PAGES_LEGALES.map((p) => p.cle)]);
  const corps: { cle: string; titre: string; contenu: string; legale?: boolean }[] = [
    { cle: CLE_ACCUEIL, titre: ctx.t.pages.accueil, contenu: `${d.accueil}${d.entre}` },
    { cle: CLE_CATALOGUE, titre: ctx.t.pages.catalogue, contenu: `<section id="${CLE_CATALOGUE}">${contenus.catalogue}</section>` },
  ];
  for (const c of contenus.collections) {
    const cle = cleDePage(`collection-${c.slug}`, prises);
    corps.push({ cle, titre: c.titre, contenu: `<section id="${cle}" class="collection">${c.html}</section>` });
  }
  for (const p of PAGES_LEGALES) {
    const texte = p.cle === "mentions-legales" ? contenus.legales?.mentionsLegales : null;
    const titre = ctx.t.pages[p.titre];
    corps.push({ cle: p.cle, titre, contenu: pageLegale(p.cle, titre, texte), legale: true });
  }

  const nav: EntreeNav[] = corps.filter((p) => !p.legale).map(({ cle, titre }) => ({ cle, titre }));
  const cles = new Set(corps.map((p) => p.cle));
  const footer = footerAvecPagesLegales(d.footer, ctx.t.pages);
  const pages: Record<string, string> = {};
  for (const p of corps) {
    const html = `${d.tete}${d.avantNav}${navAvecPages(d.nav, nav, p.cle)}${p.contenu}${footer}${d.fin}${contenus.scripts}\n${d.fermeture}`;
    const reecrit = reecrireAncres(html, cles);
    pages[p.cle] = p.legale ? ancresVersAccueil(reecrit) : reecrit;
  }
  return pages as PagesSite;
}

// Site produit unique : l'accueil est la page générée telle quelle (liens légaux du footer
// pointés vers leurs pages), plus les trois pages légales vierges, avec la même navbar et le
// même footer. null si la page ne se découpe pas (pas de <body> ou de <nav>) : elle reste
// alors seule, comme avant.
export function assemblerPagesProduit(html: string, ctx: SiteCtx): PagesSite | null {
  const d = decouperCoquille(html);
  if (!d) return null;
  const footer = footerAvecPagesLegales(d.footer, ctx.t.pages);
  const pages: Record<string, string> = {
    [CLE_ACCUEIL]: `${d.tete}${d.avantNav}${d.nav}${d.accueil}${d.entre}${footer}${d.fin}${d.fermeture}`,
  };
  for (const p of PAGES_LEGALES) {
    pages[p.cle] = ancresVersAccueil(
      `${d.tete}${d.avantNav}${d.nav}${pageLegale(p.cle, ctx.t.pages[p.titre])}${footer}${d.fin}${d.fermeture}`
    );
  }
  return pages as PagesSite;
}

// ─── Réparation des pages enregistrées par l'ancienne découpe ─────────────────────────────
// Reconstruit chaque page (sauf l'accueil, toujours correct) avec la coquille de l'accueil
// (head, en-tête et navbar, footer, scripts) et le contenu propre à la page. Sans effet sur une
// page déjà correcte : elle a la même coquille et le même contenu. Le lien de la page courante
// porte aria-current ; sur les pages légales, les ancres de la coquille renvoient à l'accueil.
export function reparerPages(pages: Record<string, string>): Record<string, string> {
  const accueil = pages[CLE_ACCUEIL];
  const st = accueil ? structurePage(accueil) : null;
  if (!accueil || !st) return pages;
  const haut = accueil.slice(0, st.hautFin).replace(/\saria-current=(["'])page\1/gi, "");
  const bas = accueil.slice(st.basDebut);
  const legales = new Set<string>(PAGES_LEGALES.map((p) => p.cle));
  const resultat: Record<string, string> = { [CLE_ACCUEIL]: accueil };
  for (const [cle, html] of Object.entries(pages)) {
    if (cle === CLE_ACCUEIL) continue;
    const { debut, fin } = bornesContenu(html);
    const fichier = fichierPage(cle).replace(/[.]/g, "\\.");
    const hautPage = haut.replace(
      new RegExp(`(<a\\b[^>]*\\bhref=(["'])${fichier}\\2)`, "gi"),
      '$1 aria-current="page"'
    );
    const page = `${hautPage}${html.slice(debut, fin)}${bas}`;
    resultat[cle] = legales.has(cle) ? ancresVersAccueil(page) : page;
  }
  return resultat;
}

// ─── Site complet en un seul fichier HTML ───────────────────────────────────────────────
// Le téléchargement « HTML » d'un site multi-pages doit tout contenir, pas seulement
// l'accueil : ouvert depuis le disque dans n'importe quel navigateur, les boutons Accueil,
// Catalogue, collections et pages légales doivent fonctionner. Toutes les pages partagent la
// même coquille (head, navbar, footer, scripts) : on garde celle de l'accueil une seule fois
// et on y place le contenu propre à chaque page (entre la navbar et le footer) dans un bloc
// <div data-dv-page="clé">. Les liens vers « clé.html » deviennent « #dv-clé » et un petit
// script affiche le bloc demandé (le bouton Retour du navigateur suit, via le hash).

const PREFIXE_ANCRE = "dv-";

// Contenu propre d'une page : entre la fin de la première <nav> et le dernier <footer>
// (ou </body>). Sans <nav>, depuis <body>.
function bornesContenu(html: string): { debut: number; fin: number } {
  const st = structurePage(html);
  if (st) return { debut: st.hautFin, fin: st.basDebut };
  const body = /<body\b[^>]*>/i.exec(html);
  const debut = body ? body.index + body[0].length : 0;
  const finBody = html.toLowerCase().lastIndexOf("</body>");
  return { debut, fin: finBody === -1 ? html.length : finBody };
}

export function contenuDePage(html: string): string {
  const { debut, fin } = bornesContenu(html);
  return html.slice(debut, fin);
}

// Liens vers les fichiers de pages connues (index.html, catalogue.html…, avec ou sans ancre)
// → ancre interne #dv-<clé>.
function liensVersAncres(html: string, cles: Set<string>): string {
  return html.replace(/\bhref=(["'])([a-z0-9-]+)\.html(?:#[^"']*)?\1/gi, (tout, guillemet: string, nom: string) => {
    const cle = nom.toLowerCase() === "index" ? CLE_ACCUEIL : nom.toLowerCase();
    return cles.has(cle) ? `href=${guillemet}#${PREFIXE_ANCRE}${cle}${guillemet}` : tout;
  });
}

// Les pages générées ont presque toujours leur propre script de défilement doux, qui
// intercepte tous les liens « #… » et bloque leur action par défaut : un simple écouteur de
// hashchange ne voyait alors jamais le clic. Le clic est donc intercepté ici en phase de
// capture (avant tous les scripts de la page) et la page change sans dépendre du hash. Chaque
// bloc porte aussi l'id « dv-<clé> » : un script de défilement qui cherche la cible du lien la
// trouve, désormais visible, au lieu d'échouer.
const SCRIPT_NAVIGATION = `<style>[data-dv-page][hidden]{display:none!important}</style>
<script>
(function(){
  var pages = document.querySelectorAll('[data-dv-page]');
  function bloc(cle){ return document.querySelector('[data-dv-page="' + cle + '"]'); }
  function montrer(cle){
    if (!bloc(cle)) cle = '${CLE_ACCUEIL}';
    for (var i = 0; i < pages.length; i++) pages[i].hidden = pages[i].getAttribute('data-dv-page') !== cle;
    var liens = document.querySelectorAll('a[href^="#${PREFIXE_ANCRE}"]');
    for (var j = 0; j < liens.length; j++) {
      if (liens[j].getAttribute('href') === '#${PREFIXE_ANCRE}' + cle) liens[j].setAttribute('aria-current', 'page');
      else liens[j].removeAttribute('aria-current');
    }
  }
  // Page demandée par l'adresse (#dv-clé, ou ancre d'un élément d'une page).
  function depuisAdresse(defiler){
    var h = decodeURIComponent(location.hash.slice(1));
    var m = /^${PREFIXE_ANCRE}([a-z0-9-]+)$/.exec(h);
    if (m && bloc(m[1])) { montrer(m[1]); if (defiler) window.scrollTo(0, 0); return; }
    var cible = h ? document.getElementById(h) : null;
    var b = cible && cible.closest ? cible.closest('[data-dv-page]') : null;
    montrer(b ? b.getAttribute('data-dv-page') : '${CLE_ACCUEIL}');
    if (cible && defiler) cible.scrollIntoView();
  }
  function memoriser(hash){
    try { history.pushState(null, '', hash); } catch (err) { /* fichier ouvert hors http : l'adresse ne change pas */ }
  }
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var h = decodeURIComponent((a.getAttribute('href') || '').slice(1));
    var m = /^${PREFIXE_ANCRE}([a-z0-9-]+)$/.exec(h);
    if (m && bloc(m[1])) {
      e.preventDefault();
      montrer(m[1]);
      memoriser('#' + h);
      window.scrollTo(0, 0);
      return;
    }
    // Ancre vers un élément d'une page masquée (ex. « Commander » depuis une page légale).
    var cible = h ? document.getElementById(h) : null;
    var b = cible && cible.closest ? cible.closest('[data-dv-page]') : null;
    if (b && b.hidden) {
      e.preventDefault();
      montrer(b.getAttribute('data-dv-page'));
      memoriser('#' + h);
      cible.scrollIntoView();
    }
  }, true);
  window.addEventListener('popstate', function(){ depuisAdresse(true); });
  window.addEventListener('hashchange', function(){ depuisAdresse(true); });
  depuisAdresse(location.hash.length > 1);
})();
</script>`;

// Retire le target="_blank" que l'ancien Site Builder ajoutait à TOUS les liens des pages
// enregistrées (y compris « #commander » et la navigation) : sans cela, chaque clic dans le
// fichier téléchargé ouvrait un nouvel onglet. Les liens externes le gardent.
export function liensInternesSansNouvelOnglet(html: string): string {
  return html.replace(
    /<a target="_blank" rel="noopener noreferrer"(\s[^>]*?\bhref=["'](?:#|[a-z0-9-]+\.html)[^>]*>)/gi,
    "<a$1"
  );
}

export function siteEnUnFichier(pagesBrutes: Record<string, string>): string {
  const pages = Object.fromEntries(
    Object.entries(pagesBrutes).map(([cle, html]) => [cle, liensInternesSansNouvelOnglet(html)])
  );
  const accueil = pages[CLE_ACCUEIL];
  if (!accueil) return Object.values(pages)[0] ?? "";
  const cles = new Set(Object.keys(pages));
  const ordre = [CLE_ACCUEIL, ...Object.keys(pages).filter((c) => c !== CLE_ACCUEIL)];

  const { debut, fin } = bornesContenu(accueil);
  const contenuAccueil = accueil.slice(debut, fin);
  const avant = accueil.slice(0, debut);
  const apres = accueil.slice(fin);

  const blocs = ordre
    .map(
      (cle) =>
        `<div id="${PREFIXE_ANCRE}${cle}" data-dv-page="${cle}"${cle === CLE_ACCUEIL ? "" : " hidden"}>${
          cle === CLE_ACCUEIL ? contenuAccueil : contenuDePage(pages[cle])
        }</div>`
    )
    .join("\n");

  const html = liensVersAncres(`${avant}${blocs}${apres}`, cles);
  const finBody = html.toLowerCase().lastIndexOf("</body>");
  return finBody === -1
    ? `${html}${SCRIPT_NAVIGATION}`
    : `${html.slice(0, finBody)}${SCRIPT_NAVIGATION}\n${html.slice(finBody)}`;
}
