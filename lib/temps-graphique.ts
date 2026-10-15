// Découpage du temps pour les graphiques zoomables du dashboard (components/dashboard/
// VentesDashboard.tsx). Le pas s'adapte à la plage affichée : plus on zoome, plus il est fin
// (heure, jour, semaine, mois). Tout est calculé en heure locale du navigateur, pour qu'une
// journée commence à minuit chez l'utilisateur.

export type Pas = "heure" | "jour" | "semaine" | "mois";

export const HEURE_MS = 3_600_000;
export const JOUR_MS = 24 * HEURE_MS;

/** Pas le plus fin qui garde un nombre de points lisible (≤ ~100) sur la plage. */
export function pasPourPlage(debut: number, fin: number): Pas {
  const duree = fin - debut;
  if (duree <= 4 * JOUR_MS) return "heure";
  if (duree <= 100 * JOUR_MS) return "jour";
  if (duree <= 2 * 365 * JOUR_MS) return "semaine";
  return "mois";
}

/** Début de la tranche (heure, jour, semaine commençant le lundi, mois) qui contient t. */
export function debutTranche(t: number, pas: Pas): number {
  const d = new Date(t);
  if (pas === "heure") {
    d.setMinutes(0, 0, 0);
  } else if (pas === "jour") {
    d.setHours(0, 0, 0, 0);
  } else if (pas === "semaine") {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  } else {
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
  }
  return d.getTime();
}

/** Début de la tranche suivante (gère les mois de longueurs différentes et le changement d'heure). */
export function trancheSuivante(t: number, pas: Pas): number {
  const d = new Date(t);
  if (pas === "heure") d.setHours(d.getHours() + 1);
  else if (pas === "jour") d.setDate(d.getDate() + 1);
  else if (pas === "semaine") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** Débuts de toutes les tranches qui recouvrent [debut, fin]. */
export function tranches(debut: number, fin: number, pas: Pas): number[] {
  const out: number[] = [];
  for (let t = debutTranche(debut, pas); t <= fin && out.length < 5000; t = trancheSuivante(t, pas)) out.push(t);
  return out;
}

/** Libellé court d'une tranche, pour l'axe et l'infobulle. */
export function libelleTranche(t: number, pas: Pas, intlTag: string, long = false): string {
  const d = new Date(t);
  if (pas === "heure") {
    return long
      ? d.toLocaleString(intlTag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString(intlTag, { day: "numeric", month: "short", hour: "2-digit" });
  }
  if (pas === "jour") return d.toLocaleDateString(intlTag, long ? { weekday: "short", day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  if (pas === "semaine") return d.toLocaleDateString(intlTag, { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}) });
  return d.toLocaleDateString(intlTag, { month: "short", year: long ? "numeric" : "2-digit" });
}
