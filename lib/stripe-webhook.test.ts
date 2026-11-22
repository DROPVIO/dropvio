// Webhook Stripe : signature (mock), idempotence, chaque événement, et synchronisation de
// l'abonnement (plan déduit de l'identifiant de prix). Aucun appel réseau ni base réelle.
import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { abonnementDeFacture, noterEvenement, oublierEvenement, traiterEvenementStripe, verifierEvenement } from "./stripe-webhook";
import { synchroniserAbonnement } from "./abonnement";

process.env.STRIPE_PRICE_PRO = "price_pro_test";
process.env.STRIPE_PRICE_AGENCY = "price_agency_test";

// ── Faux client Supabase : enregistre les écritures, répond selon la table ──────────────────
type Ecriture = { table: string; operation: string; valeurs?: unknown; filtres: [string, unknown][] };
function fauxAdmin(options: { profil?: Record<string, unknown> | null; insertErreur?: { code: string; message: string } | null; colonneAbsente?: boolean } = {}) {
  const ecritures: Ecriture[] = [];
  let essaisUpdate = 0;
  const admin = {
    from(table: string) {
      const etat: Ecriture = { table, operation: "select", filtres: [] };
      const chaine: Record<string, unknown> = {};
      const resultat = () => {
        if (etat.operation === "insert") return { data: null, error: options.insertErreur ?? null };
        if (etat.operation === "update") {
          essaisUpdate += 1;
          const v = etat.valeurs as Record<string, unknown>;
          if (options.colonneAbsente && "annulation_fin_periode" in v) return { data: null, error: { code: "42703", message: "colonne absente" } };
          return { data: null, error: null };
        }
        if (etat.operation === "delete") return { data: null, error: null };
        if (table === "profils") return { data: options.profil ?? null, error: null };
        return { data: null, error: null };
      };
      for (const m of ["select", "eq", "lte", "gt", "order", "limit", "in"]) {
        chaine[m] = (...args: unknown[]) => {
          if (m === "eq") etat.filtres.push([String(args[0]), args[1]]);
          return chaine;
        };
      }
      for (const op of ["insert", "update", "delete", "upsert"]) {
        chaine[op] = (valeurs?: unknown) => {
          etat.operation = op;
          etat.valeurs = valeurs;
          ecritures.push(etat);
          return chaine;
        };
      }
      chaine.maybeSingle = async () => resultat();
      chaine.then = (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resultat()).then(ok, ko);
      return chaine;
    },
  };
  return { admin: admin as unknown as SupabaseClient, ecritures, essaisUpdate: () => essaisUpdate };
}

function abonnement(champs: Partial<Stripe.Subscription> & { prix?: string } = {}): Stripe.Subscription {
  const { prix = "price_pro_test", ...reste } = champs;
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    metadata: { user_id: "user_1" },
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: prix }, current_period_end: 1_800_000_000 }] },
    ...reste,
  } as unknown as Stripe.Subscription;
}

function evenement(type: string, objet: unknown, id = "evt_1"): Stripe.Event {
  return { id, type, data: { object: objet } } as unknown as Stripe.Event;
}

function espions() {
  const appels: string[] = [];
  return {
    appels,
    deps: {
      synchroniserAbonnement: (async (_a: unknown, s: Stripe.Subscription) => { appels.push(`sync:${s.id}`); }) as typeof synchroniserAbonnement,
      grantFormationAccess: (async (_a: unknown, u: string, o: string) => { appels.push(`formation:${u}:${o}`); }) as never,
      enregistrerPeriodeExpert: (async () => { appels.push("periodeExpert"); }) as never,
      enregistrerRechargeExpert: (async () => { appels.push("rechargeExpert"); }) as never,
      isRechargeExpert: ((s: Stripe.Checkout.Session) => s.metadata?.type === "recharge") as never,
      terminerAbonnementExpert: (async () => { appels.push("finExpert"); }) as never,
      lireAbonnement: async (id: string) => abonnement({ id }),
    },
  };
}

// ── Signature ────────────────────────────────────────────────────────────────────────────────
test("signature : absente, invalide ou valide (constructEvent simulé)", () => {
  const mock = {
    webhooks: {
      constructEvent: (corps: string, signature: string, secret: string) => {
        if (signature !== `bonne:${secret}`) throw new Error("signature invalide");
        return JSON.parse(corps) as Stripe.Event;
      },
    },
  };
  const corps = JSON.stringify({ id: "evt_x", type: "invoice.paid", data: { object: {} } });
  assert.equal(verifierEvenement(mock, corps, null, "whsec"), null);
  assert.equal(verifierEvenement(mock, corps, "fausse", "whsec"), null);
  assert.equal(verifierEvenement(mock, corps, "bonne:whsec", "whsec")?.id, "evt_x");
});

// ── Idempotence ──────────────────────────────────────────────────────────────────────────────
test("idempotence : nouvel événement, doublon, table absente", async () => {
  assert.equal(await noterEvenement(fauxAdmin().admin, evenement("invoice.paid", {})), "nouveau");
  assert.equal(await noterEvenement(fauxAdmin({ insertErreur: { code: "23505", message: "doublon" } }).admin, evenement("invoice.paid", {})), "deja_traite");
  const avertissement = console.warn;
  console.warn = () => {};
  assert.equal(await noterEvenement(fauxAdmin({ insertErreur: { code: "PGRST205", message: "absente" } }).admin, evenement("invoice.paid", {})), "sans_suivi");
  console.warn = avertissement;
  await assert.rejects(noterEvenement(fauxAdmin({ insertErreur: { code: "XX000", message: "panne" } }).admin, evenement("invoice.paid", {})));
});

test("idempotence : un échec retire la note de l'événement", async () => {
  const { admin, ecritures } = fauxAdmin();
  await oublierEvenement(admin, "evt_9");
  assert.deepEqual(ecritures.map((e) => [e.table, e.operation, e.filtres]), [["stripe_evenements", "delete", [["id", "evt_9"]]]]);
});

// ── Événements ───────────────────────────────────────────────────────────────────────────────
test("checkout.session.completed : abonnement → synchronisation", async () => {
  const { appels, deps } = espions();
  await traiterEvenementStripe(evenement("checkout.session.completed", { mode: "subscription", subscription: "sub_2", metadata: {} }), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["sync:sub_2"]);
});

test("checkout.session.completed : formation payée → accès accordé ; non payée → rien", async () => {
  const { appels, deps } = espions();
  const session = { mode: "payment", payment_status: "paid", metadata: { user_id: "user_1", offre: "courte" }, amount_total: 2499, id: "cs_1" };
  await traiterEvenementStripe(evenement("checkout.session.completed", session), { admin: fauxAdmin().admin, ...deps });
  await traiterEvenementStripe(evenement("checkout.session.completed", { ...session, payment_status: "unpaid" }), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["formation:user_1:courte"]);
});

test("checkout.session.completed : recharge Expert", async () => {
  const { appels, deps } = espions();
  await traiterEvenementStripe(evenement("checkout.session.completed", { mode: "payment", metadata: { type: "recharge" } }), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["rechargeExpert"]);
});

test("customer.subscription.updated : relecture puis synchronisation", async () => {
  const { appels, deps } = espions();
  await traiterEvenementStripe(evenement("customer.subscription.updated", abonnement({ id: "sub_3" })), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["sync:sub_3"]);
});

test("customer.subscription.deleted : synchronisation et fin Expert", async () => {
  const { appels, deps } = espions();
  await traiterEvenementStripe(evenement("customer.subscription.deleted", abonnement({ id: "sub_4" })), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["sync:sub_4", "finExpert"]);
});

test("invoice.paid : période Expert et renouvellement Pro / Agency", async () => {
  const { appels, deps } = espions();
  const facture = { parent: { subscription_details: { subscription: "sub_5" } } };
  await traiterEvenementStripe(evenement("invoice.paid", facture), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["periodeExpert", "sync:sub_5"]);
});

test("invoice.payment_failed : abonnement resynchronisé (statut past_due)", async () => {
  const { appels, deps } = espions();
  await traiterEvenementStripe(evenement("invoice.payment_failed", { subscription: "sub_6" }), { admin: fauxAdmin().admin, ...deps });
  assert.deepEqual(appels, ["sync:sub_6"]);
});

test("abonnementDeFacture : champ parent puis ancien champ", () => {
  assert.equal(abonnementDeFacture({ parent: { subscription_details: { subscription: "sub_a" } } } as never), "sub_a");
  assert.equal(abonnementDeFacture({ subscription: { id: "sub_b" } } as never), "sub_b");
  assert.equal(abonnementDeFacture({} as never), null);
});

// ── Synchronisation de l'abonnement ──────────────────────────────────────────────────────────
function profilEcrit(ecritures: Ecriture[]) {
  const maj = ecritures.filter((e) => e.table === "profils" && e.operation === "update");
  return maj[maj.length - 1]?.valeurs as Record<string, unknown>;
}

test("plan déduit de l'identifiant de prix, jamais du montant", async () => {
  const pro = fauxAdmin({ profil: { id: "user_1", plan: null } });
  await synchroniserAbonnement(pro.admin, abonnement({ prix: "price_pro_test" }));
  assert.equal(profilEcrit(pro.ecritures).plan, "pro");

  const agency = fauxAdmin({ profil: { id: "user_1", plan: "pro" } });
  await synchroniserAbonnement(agency.admin, abonnement({ prix: "price_agency_test" }));
  assert.equal(profilEcrit(agency.ecritures).plan, "agency");

  const inconnu = fauxAdmin({ profil: { id: "user_1", plan: "pro" } });
  await synchroniserAbonnement(inconnu.admin, abonnement({ prix: "price_inconnu" }));
  assert.equal(profilEcrit(inconnu.ecritures).plan, null);
});

test("past_due, unpaid et canceled : plus aucun plan, statut enregistré", async () => {
  for (const status of ["past_due", "unpaid", "canceled"] as const) {
    const { admin, ecritures } = fauxAdmin({ profil: { id: "user_1", plan: "pro" } });
    await synchroniserAbonnement(admin, abonnement({ status }));
    const v = profilEcrit(ecritures);
    assert.equal(v.plan, null, status);
    assert.equal(v.abonnement_statut, status);
  }
});

test("annulation programmée : plan conservé jusqu'à la fin de période, drapeau enregistré", async () => {
  const { admin, ecritures } = fauxAdmin({ profil: { id: "user_1", plan: "pro" } });
  await synchroniserAbonnement(admin, abonnement({ cancel_at_period_end: true }));
  const v = profilEcrit(ecritures);
  assert.equal(v.plan, "pro");
  assert.equal(v.annulation_fin_periode, true);
  assert.equal(v.periode_fin, new Date(1_800_000_000 * 1000).toISOString());
});

test("colonne annulation_fin_periode absente (migration 065) : le reste est quand même écrit", async () => {
  const { admin, ecritures, essaisUpdate } = fauxAdmin({ profil: { id: "user_1", plan: null }, colonneAbsente: true });
  await synchroniserAbonnement(admin, abonnement());
  assert.equal(essaisUpdate(), 2);
  const v = profilEcrit(ecritures);
  assert.equal(v.plan, "pro");
  assert.equal("annulation_fin_periode" in v, false);
});
