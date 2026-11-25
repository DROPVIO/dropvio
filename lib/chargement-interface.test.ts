import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const css = lire("app/globals.css");

describe("chargement — squelette et réduction des animations", () => {
  it("squelette pulsé, pulsation coupée avec prefers-reduced-motion", () => {
    assert.match(css, /\.dv-squelette \{[^}]*animation: dv-squelette-pulsation/);
    assert.match(css, /@keyframes dv-squelette-pulsation/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.dv-squelette \{ animation: none; \}\s*\.dv-progression-barre \{ transition: none; \}/);
  });

  it("l'indicateur suit les seuils : rien, squelette, puis barre de progression", () => {
    const composant = lire("components/chargement/IndicateurChargement.tsx");
    assert.ok(composant.includes('if (phase === "aucun") return null;'));
    assert.ok(composant.includes('phase === "progression" ? <BarreProgression'));
    assert.ok(composant.includes('role="progressbar"'));
    assert.ok(composant.includes("window.setInterval(() => setMaintenant(Date.now()), INTERVALLE_MAJ_MS)"));
  });

  it("pages : squelette aux dimensions du contenu, plus de spinner seul", () => {
    const pages: Record<string, string> = {
      "app/mes-sites/page.tsx": "<SqueletteSites />",
      "app/dashboard/utilisation/page.tsx": "<SqueletteUtilisation />",
      "app/quota/page.tsx": "<SqueletteQuota />",
      "app/ventes/page.tsx": "<SqueletteVentes />",
    };
    for (const [chemin, squelette] of Object.entries(pages)) {
      const page = lire(chemin);
      assert.ok(page.includes("<IndicateurChargement") && page.includes(squelette), chemin);
      assert.doesNotMatch(page, /animate-spin/, chemin);
    }
    for (const chemin of ["app/dashboard/page.tsx", "app/tools/calculateur-marge/page.tsx"]) {
      assert.ok(lire(chemin).includes("<EmplacementGraphique"), chemin);
    }
  });

  it("textes du chargement dans les 4 langues", () => {
    for (const langue of ["fr", "en", "es", "it"]) {
      const c = JSON.parse(lire(`messages/${langue}.json`)).chargement;
      for (const cle of ["enCours", "quelquesSecondes", "restantSecondes", "restantMinutes"]) assert.ok(c[cle], `${langue}.${cle}`);
      for (const etape of ["preparation", "redaction", "relance", "gabarits", "termine", "libelle"]) assert.ok(c.creation[etape], `${langue}.creation.${etape}`);
    }
    assert.equal(JSON.parse(lire("messages/fr.json")).chargement.quelquesSecondes, "Encore quelques secondes");
  });
});

describe("création de site — progression en temps réel", () => {
  it("la génération envoie un identifiant de suivi ; l'écran sonde la route d'état", () => {
    const builder = lire("app/site-builder/page.tsx");
    assert.ok(builder.includes("crypto.randomUUID()") && builder.includes("JSON.stringify({ ...payload, suiviId })"));
    assert.ok(builder.includes("<ProgressionCreation"));
    const progression = lire("components/site-builder/ProgressionCreation.tsx");
    assert.ok(progression.includes("/api/generate-site/progression?id=") && progression.includes("INTERVALLE_SONDAGE_MS"));
  });

  it("la route écrit l'avancement pendant la génération, sans bloquer", () => {
    const route = lire("app/api/generate-site/route.ts");
    assert.ok(route.includes("progression?.progres(html.length + chunk.length)"));
    assert.equal(route.match(/void progression\.terminer\(reussie\)/g)?.length, 2);
    assert.ok(lire("app/api/generate-site/progression/route.ts").includes('.eq("user_id", user.id)'));
    assert.ok(lire("supabase/migrations/071_progression_generation_site.sql").includes("enable row level security"));
  });
});

describe("mise à jour optimiste", () => {
  it("Mes sites : suppression immédiate, liste précédente remise si l'envoi échoue", () => {
    const page = lire("app/mes-sites/page.tsx");
    const bloc = page.slice(page.indexOf("async function handleDelete"), page.indexOf("async function handleToggleFavori"));
    assert.ok(bloc.indexOf("listeSites.modifier") < bloc.indexOf("await fetch"));
    assert.ok(bloc.includes("listeSites.remettre(precedent)") && bloc.includes('echec(t("errorDelete"))'));
  });

  it("Ventes : statut changé avant l'envoi, ancien statut remis avec un message si l'envoi échoue", () => {
    const page = lire("app/ventes/page.tsx");
    const bloc = page.slice(page.indexOf("async function changerStatut"), page.indexOf("const choisirFiltre"));
    assert.ok(bloc.indexOf("lecture.modifier") < bloc.indexOf("await fetch"));
    assert.equal(bloc.match(/lecture\.remettre\(precedent\)/g)?.length, 2);
    assert.ok(bloc.includes('t("erreurStatut")'));
  });
});

describe("changements de page — préchargement et cache", () => {
  it("liens de la barre latérale : préchargement complet, données au survol et au focus", () => {
    const sidebar = lire("components/Sidebar.tsx");
    assert.equal(sidebar.match(/prefetch=\{true\}/g)?.length, 2);
    assert.equal(sidebar.match(/onMouseEnter=\{\(\) => prechargerDonneesPage\(/g)?.length, 2);
    assert.equal(sidebar.match(/onFocus=\{\(\) => prechargerDonneesPage\(/g)?.length, 2);
  });

  it("cache vidé à la déconnexion (bouton, abonnement, session expirée)", () => {
    for (const chemin of ["lib/auth.ts", "components/AuthButton.tsx", "app/abonnement/page.tsx", "components/AppShell.tsx"]) {
      assert.ok(lire(chemin).includes("viderCache()"), chemin);
    }
  });
});
