// Progression réelle de la création d'un site (table progression_generation_site, migration 071).
// Écrite par POST /api/generate-site, lue par GET /api/generate-site/progression, interrogée par
// le Site Builder toutes les 1,5 s. Toute écriture est « au mieux » : une erreur (table absente,
// réseau) est journalisée une fois puis le suivi se coupe, sans jamais faire échouer la création.

import type { SupabaseClient } from "@supabase/supabase-js";

export const ETAPES_GENERATION = ["preparation", "redaction", "relance", "gabarits", "termine", "erreur"] as const;
export type EtapeGeneration = (typeof ETAPES_GENERATION)[number];

/** Intervalle minimal entre deux écritures du nombre de caractères (au plus 1 par seconde). */
export const INTERVALLE_ECRITURE_MS = 1_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Identifiant de suivi envoyé par le client : un uuid, sinon null (pas de suivi). */
export function idSuiviValide(valeur: unknown): string | null {
  return typeof valeur === "string" && UUID.test(valeur) ? valeur.toLowerCase() : null;
}

export function estEtapeGeneration(valeur: unknown): valeur is EtapeGeneration {
  return typeof valeur === "string" && (ETAPES_GENERATION as readonly string[]).includes(valeur);
}

type ClientEcriture = Pick<SupabaseClient, "from">;

export class SuiviProgressionSite {
  private actif: boolean;
  private derniereEcriture = 0;
  private file: Promise<void> = Promise.resolve();
  private etapeCourante: EtapeGeneration = "preparation";
  private appel = 0;
  private caracteres = 0;

  constructor(
    private readonly admin: ClientEcriture,
    private readonly userId: string,
    private readonly id: string | null,
    private readonly maintenant: () => number = Date.now
  ) {
    this.actif = id !== null;
  }

  /** Démarre le suivi : efface les anciennes lignes du compte (plus d'un jour) puis écrit
   *  l'étape « preparation ». */
  demarrer(): Promise<void> {
    if (!this.actif) return Promise.resolve();
    const hier = new Date(this.maintenant() - 86_400_000).toISOString();
    this.enchainer(async () => {
      await this.admin.from("progression_generation_site").delete().eq("user_id", this.userId).lt("cree_le", hier);
    });
    return this.ecrire(true);
  }

  etape(etape: EtapeGeneration, appel?: number): Promise<void> {
    this.etapeCourante = etape;
    if (appel !== undefined) this.appel = appel;
    return this.ecrire(true);
  }

  /** Nombre de caractères de HTML reçus : écrit au plus une fois par seconde. */
  progres(caracteres: number): void {
    this.caracteres = caracteres;
    if (this.maintenant() - this.derniereEcriture >= INTERVALLE_ECRITURE_MS) void this.ecrire(false);
  }

  terminer(reussie: boolean): Promise<void> {
    return this.etape(reussie ? "termine" : "erreur");
  }

  private ecrire(forcer: boolean): Promise<void> {
    if (!this.actif || !this.id) return Promise.resolve();
    if (!forcer && this.maintenant() - this.derniereEcriture < INTERVALLE_ECRITURE_MS) return this.file;
    this.derniereEcriture = this.maintenant();
    const ligne = {
      id: this.id,
      user_id: this.userId,
      etape: this.etapeCourante,
      caracteres: this.caracteres,
      appel: this.appel,
      maj_le: new Date(this.derniereEcriture).toISOString(),
    };
    return this.enchainer(async () => {
      const { error } = await this.admin.from("progression_generation_site").upsert(ligne);
      if (error) throw error;
    });
  }

  /** Écritures en série (l'ordre des étapes est garanti) ; la première erreur coupe le suivi. */
  private enchainer(tache: () => Promise<void>): Promise<void> {
    this.file = this.file.then(async () => {
      if (!this.actif) return;
      try {
        await tache();
      } catch (err) {
        this.actif = false;
        console.warn("[progression-site] suivi désactivé (migration 071 absente ?) :", (err as { message?: string })?.message ?? err);
      }
    });
    return this.file;
  }
}
