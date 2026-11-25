import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INTERVALLE_ECRITURE_MS, SuiviProgressionSite, idSuiviValide } from "./progression-site";

type Ecriture = { table: string; op: string; ligne?: Record<string, unknown> };

/** Faux client Supabase : enregistre les écritures, peut échouer à la demande. */
function fauxAdmin(echec = false) {
  const ecritures: Ecriture[] = [];
  const admin = {
    from: (table: string) => ({
      upsert: async (ligne: Record<string, unknown>) => {
        ecritures.push({ table, op: "upsert", ligne });
        return { error: echec ? { message: "relation does not exist" } : null };
      },
      delete: () => ({
        eq: () => ({
          lt: async () => {
            ecritures.push({ table, op: "delete" });
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { admin: admin as unknown as ConstructorParameters<typeof SuiviProgressionSite>[0], ecritures };
}

const ID = "3f2b8c1e-9d4a-4b7e-8c2f-1a2b3c4d5e6f";

describe("progression de création — identifiant de suivi", () => {
  it("uuid accepté, tout le reste refusé (aucun suivi)", () => {
    assert.equal(idSuiviValide(ID.toUpperCase()), ID);
    for (const v of [undefined, null, "", "abc", 42, `${ID}x`]) assert.equal(idSuiviValide(v), null, String(v));
  });
});

describe("progression de création — écriture de l'avancement réel", () => {
  it("étapes écrites dans l'ordre, caractères au plus une fois par seconde", async () => {
    let maintenant = 10_000;
    const { admin, ecritures } = fauxAdmin();
    const suivi = new SuiviProgressionSite(admin, "user-1", ID, () => maintenant);
    await suivi.demarrer();
    await suivi.etape("redaction", 1);
    for (let i = 1; i <= 10; i++) {
      maintenant += 100; // 10 morceaux de texte en 1 s
      suivi.progres(i * 1_000);
    }
    maintenant += INTERVALLE_ECRITURE_MS;
    suivi.progres(20_000);
    await suivi.terminer(true);

    const lignes = ecritures.filter((e) => e.op === "upsert").map((e) => e.ligne!);
    assert.equal(ecritures[0].op, "delete"); // anciennes lignes du compte effacées d'abord
    assert.deepEqual(lignes.map((l) => l.etape), ["preparation", "redaction", "redaction", "redaction", "termine"]);
    assert.ok(lignes.every((l) => l.id === ID && l.user_id === "user-1"));
    assert.deepEqual(lignes.map((l) => l.caracteres), [0, 0, 10_000, 20_000, 20_000]);
  });

  it("sans identifiant : aucune écriture", async () => {
    const { admin, ecritures } = fauxAdmin();
    const suivi = new SuiviProgressionSite(admin, "user-1", null);
    await suivi.demarrer();
    await suivi.etape("redaction", 1);
    suivi.progres(5_000);
    await suivi.terminer(true);
    assert.equal(ecritures.length, 0);
  });

  it("table absente (migration 071) : le suivi se coupe sans lever d'erreur", async () => {
    const { admin, ecritures } = fauxAdmin(true);
    const avertissement = console.warn;
    console.warn = () => {};
    try {
      const suivi = new SuiviProgressionSite(admin, "user-1", ID);
      await suivi.demarrer();
      await suivi.etape("redaction", 1);
      await suivi.terminer(false);
      assert.equal(ecritures.filter((e) => e.op === "upsert").length, 1);
    } finally {
      console.warn = avertissement;
    }
  });
});
