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
  return entrees.length > 1 ? (Object.fromEntries(entrees) as Record<string, string>) : null;
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
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) return null;
  const finTete = body.index + body[0].length;

  const navMatch = /<nav\b[\s\S]*?<\/nav>/i.exec(html.slice(finTete));
  if (!navMatch) return null;
  const debutNav = finTete + navMatch.index;
  const finNav = debutNav + navMatch[0].length;

  const finBody = html.toLowerCase().lastIndexOf("</body>");
  if (finBody === -1 || finBody < finNav) return null;

  const catalogue = /<section\b[^>]*\bid=["']catalogue["'][^>]*>/i.exec(html.slice(finNav));
  let debutCatalogue: number;
  let finCatalogue: number;
  if (catalogue) {
    debutCatalogue = finNav + catalogue.index;
    // La section #catalogue ne doit contenir que le marqueur : elle se ferme au premier
    // </section> qui le suit.
    const marqueur = html.indexOf("<!-- GRILLE_PRODUITS -->", debutCatalogue);
    if (marqueur === -1) return null;
    const fermetureSection = html.indexOf("</section>", marqueur);
    if (fermetureSection === -1) return null;
    finCatalogue = fermetureSection + "</section>".length;
    if (finBody < finCatalogue) return null;
  } else {
    // Accueil seul : il s'étend jusqu'au footer (ou jusqu'à </body> sans footer).
    const footerSeul = html.toLowerCase().lastIndexOf("<footer", finBody);
    debutCatalogue = footerSeul >= finNav ? footerSeul : finBody;
    finCatalogue = debutCatalogue;
  }

  const debutFooter = html.toLowerCase().lastIndexOf("<footer", finBody);
  const finFooterBalise = debutFooter >= finCatalogue ? html.toLowerCase().indexOf("</footer>", debutFooter) : -1;
  const aFooter = debutFooter >= finCatalogue && finFooterBalise !== -1 && finFooterBalise < finBody;
  const finFooter = aFooter ? finFooterBalise + "</footer>".length : finCatalogue;

  return {
    tete: html.slice(0, finTete),
    avantNav: html.slice(finTete, debutNav),
    nav: html.slice(debutNav, finNav),
    accueil: html.slice(finNav, debutCatalogue),
    entre: html.slice(finCatalogue, aFooter ? debutFooter : finCatalogue),
    footer: aFooter ? html.slice(debutFooter, finFooter) : "",
    fin: html.slice(finFooter, finBody),
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
    result = result.replace(/<\/nav>\s*$/i, `${nouveauxLiens}\n</nav>`);
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
// motif : reconnaît le lien correspondant dans le footer écrit par Claude.
export const PAGES_LEGALES = [
  { cle: "mentions-legales", titre: "Mentions légales", motif: /mentions?\s+l[ée]gales?/i },
  { cle: "cgv", titre: "CGV", motif: /\bcgv\b|conditions\s+g[ée]n[ée]rales/i },
  { cle: "confidentialite", titre: "Confidentialité", motif: /confidentialit[ée]|donn[ée]es\s+personnelles/i },
] as const;

export type ContenusLegaux = { mentionsLegales?: string | null };

// Titre lisible d'une page connue (accueil, catalogue, page légale) ; undefined sinon.
export function titrePageConnue(cle: string): string | undefined {
  if (cle === CLE_ACCUEIL) return "Accueil";
  if (cle === CLE_CATALOGUE) return "Catalogue";
  return PAGES_LEGALES.find((p) => p.cle === cle)?.titre;
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
export function footerAvecPagesLegales(footer: string): string {
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
  const liens = PAGES_LEGALES.map((p) => `<a href="${fichierPage(p.cle)}">${echapper(p.titre)}</a>`).join(" · ");
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
export function assemblerPagesBoutique(coquille: string, contenus: ContenusBoutique): PagesSite | null {
  const d = decouperCoquille(coquille);
  if (!d) return null;

  const prises = new Set<string>([CLE_ACCUEIL, CLE_CATALOGUE, ...PAGES_LEGALES.map((p) => p.cle)]);
  const corps: { cle: string; titre: string; contenu: string; legale?: boolean }[] = [
    { cle: CLE_ACCUEIL, titre: "Accueil", contenu: `${d.accueil}${d.entre}` },
    { cle: CLE_CATALOGUE, titre: "Catalogue", contenu: `<section id="${CLE_CATALOGUE}">${contenus.catalogue}</section>` },
  ];
  for (const c of contenus.collections) {
    const cle = cleDePage(`collection-${c.slug}`, prises);
    corps.push({ cle, titre: c.titre, contenu: `<section id="${cle}" class="collection">${c.html}</section>` });
  }
  for (const p of PAGES_LEGALES) {
    const texte = p.cle === "mentions-legales" ? contenus.legales?.mentionsLegales : null;
    corps.push({ cle: p.cle, titre: p.titre, contenu: pageLegale(p.cle, p.titre, texte), legale: true });
  }

  const nav: EntreeNav[] = corps.filter((p) => !p.legale).map(({ cle, titre }) => ({ cle, titre }));
  const cles = new Set(corps.map((p) => p.cle));
  const footer = footerAvecPagesLegales(d.footer);
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
export function assemblerPagesProduit(html: string): PagesSite | null {
  const d = decouperCoquille(html);
  if (!d) return null;
  const footer = footerAvecPagesLegales(d.footer);
  const pages: Record<string, string> = {
    [CLE_ACCUEIL]: `${d.tete}${d.avantNav}${d.nav}${d.accueil}${d.entre}${footer}${d.fin}${d.fermeture}`,
  };
  for (const p of PAGES_LEGALES) {
    pages[p.cle] = ancresVersAccueil(
      `${d.tete}${d.avantNav}${d.nav}${pageLegale(p.cle, p.titre)}${footer}${d.fin}${d.fermeture}`
    );
  }
  return pages as PagesSite;
}
