import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aPeriodeManuelleActive } from "./expert-quota";
import { OPENAI_IMAGE_MODEL } from "./media/openai";
import {
  EXPERT_BASE_EUR,
  EXPERT_MODELS,
  IMAGE_PRICE_EUR,
  parseExpertSelection,
  siteUnitPriceEur,
  type ExpertSelection,
} from "./expert-pricing";

// Stripe finalise une facture de renouvellement environ une heure après la fin de période.
// La fin stockée dans expert_periodes inclut cette marge pour que l'abonné ne perde pas son
// accès pendant ce délai : à l'affichage, retirer cette durée pour retrouver la date Stripe.
export const EXPERT_MARGE_RENOUVELLEMENT_MS = 2 * 60 * 60 * 1000;

// Identifiants fixes : un même produit Stripe sert à tous les abonnés, seuls le prix unitaire
// et la quantité de chaque ligne varient. Créés au premier besoin, en mode test comme en live.
const EXPERT_PRODUCTS = {
  base: { id: "dropvio_expert_base", name: "Plan Expert : base Agency" },
  sites: { id: "dropvio_expert_sites", name: "Plan Expert : sites par mois" },
  images: { id: "dropvio_expert_images", name: "Plan Expert : images par mois" },
} as const;

type ExpertLigneKey = keyof typeof EXPERT_PRODUCTS;
type ExpertLigne = { key: ExpertLigneKey; unitAmount: number; quantity: number };

// Statuts pour lesquels un abonnement est encore en cours côté Stripe : "canceled" et
// "incomplete_expired" sont les seuls états définitivement terminés.
const SUBSCRIPTION_TERMINEE: Stripe.Subscription.Status[] = ["canceled", "incomplete_expired"];

let produitsPrets = false;

async function ensureExpertProducts(stripe: Stripe): Promise<void> {
  if (produitsPrets) return;
  await Promise.all(
    Object.values(EXPERT_PRODUCTS).map(async (product) => {
      try {
        await stripe.products.retrieve(product.id);
      } catch (error) {
        if (!(error instanceof Stripe.errors.StripeError) || error.code !== "resource_missing") throw error;
        await stripe.products.create(product);
      }
    })
  );
  produitsPrets = true;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

// Les lignes à zéro sont omises : Stripe ne les afficherait que comme du bruit.
export function expertLignes(selection: ExpertSelection): ExpertLigne[] {
  const lignes: ExpertLigne[] = [
    { key: "base", unitAmount: toCents(EXPERT_BASE_EUR), quantity: 1 },
    { key: "sites", unitAmount: toCents(siteUnitPriceEur(selection.model)), quantity: selection.sites },
    { key: "images", unitAmount: toCents(IMAGE_PRICE_EUR), quantity: selection.images },
  ];
  return lignes.filter((ligne) => ligne.quantity > 0);
}

function priceData(ligne: ExpertLigne) {
  return {
    currency: "eur",
    product: EXPERT_PRODUCTS[ligne.key].id,
    recurring: { interval: "month" as const },
    unit_amount: ligne.unitAmount,
  };
}

// La configuration voyage dans les metadata de l'abonnement : Stripe les recopie sur chaque
// facture, ce qui garantit que la période enregistrée correspond à ce qui a été facturé.
export function expertMetadata(userId: string, selection: ExpertSelection): Record<string, string> {
  return {
    plan: "expert",
    user_id: userId,
    model: selection.model,
    sites: String(selection.sites),
    images: String(selection.images),
  };
}

export function parseExpertMetadata(
  metadata: Stripe.Metadata | null | undefined
): { userId: string; selection: ExpertSelection } | null {
  if (metadata?.plan !== "expert" || !metadata.user_id) return null;
  const selection = parseExpertSelection({
    model: metadata.model,
    sites: Number(metadata.sites),
    images: Number(metadata.images),
  });
  return selection ? { userId: metadata.user_id, selection } : null;
}

export async function findSubscriptionEnCours(stripe: Stripe, customerId: string): Promise<Stripe.Subscription | null> {
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return data.find((subscription) => !SUBSCRIPTION_TERMINEE.includes(subscription.status)) ?? null;
}

export async function createExpertCheckoutSession(
  stripe: Stripe,
  params: {
    customerId: string;
    userId: string;
    selection: ExpertSelection;
    origin: string;
  }
): Promise<Stripe.Checkout.Session> {
  await ensureExpertProducts(stripe);
  const { customerId, userId, selection, origin } = params;

  // Une seule session ouverte par client : deux onglets ne peuvent pas payer deux abonnements.
  const { data: ouvertes } = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
  await Promise.all(
    ouvertes.filter((session) => session.mode === "subscription").map((session) => stripe.checkout.sessions.expire(session.id))
  );

  const metadata = { ...expertMetadata(userId, selection), execution_immediate_at: new Date().toISOString() };
  const { label } = EXPERT_MODELS[selection.model];

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    line_items: expertLignes(selection).map((ligne) => ({ price_data: priceData(ligne), quantity: ligne.quantity })),
    metadata,
    subscription_data: { metadata },
    custom_text: {
      submit: {
        message: `${label} : ${selection.sites} sites et ${selection.images} images par mois. Vous avez demandé l'exécution immédiate du service.`,
      },
    },
    success_url: `${origin}/dashboard?expert=success`,
    cancel_url: `${origin}/#expert`,
  });
}

export async function createExpertRechargeSession(
  stripe: Stripe,
  params: {
    customerId: string | null;
    email: string | null;
    userId: string;
    periodeId: string;
    selection: ExpertSelection;
    origin: string;
  }
): Promise<Stripe.Checkout.Session> {
  await ensureExpertProducts(stripe);
  const { customerId, email, userId, periodeId, selection, origin } = params;
  const metadata = {
    ...expertMetadata(userId, selection),
    recharge: "1",
    periode_id: periodeId,
    execution_immediate_at: new Date().toISOString(),
  };

  return stripe.checkout.sessions.create({
    mode: "payment",
    ...(customerId ? { customer: customerId } : { customer_email: email ?? undefined }),
    client_reference_id: userId,
    line_items: expertLignes(selection)
      .filter((ligne) => ligne.key !== "base")
      .map((ligne) => ({
        price_data: { currency: "eur", product: EXPERT_PRODUCTS[ligne.key].id, unit_amount: ligne.unitAmount },
        quantity: ligne.quantity,
      })),
    metadata,
    success_url: `${origin}/quota?recharge=success`,
    cancel_url: `${origin}/quota`,
  });
}

export function isRechargeExpert(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.recharge === "1";
}

// Une ligne par type de crédit acheté. La contrainte unique sur la session Stripe évite un
// doublon si le webhook est livré plusieurs fois.
export async function enregistrerRechargeExpert(admin: SupabaseClient, session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;

  const config = parseExpertMetadata(session.metadata);
  const periodeId = session.metadata?.periode_id;
  if (!config || !periodeId) {
    throw new Error(`Recharge Expert payée mais inexploitable : ${session.id}`);
  }

  const { userId, selection } = config;
  const modeles: Partial<Record<ExpertLigneKey, { type: string; modele: string }>> = {
    sites: { type: "site", modele: selection.model },
    images: { type: "image", modele: OPENAI_IMAGE_MODEL },
  };
  const lignes = expertLignes(selection).flatMap((ligne) => {
    const credit = modeles[ligne.key];
    if (!credit) return [];
    return [{
      ...credit,
      user_id: userId,
      periode_id: periodeId,
      quantite: ligne.quantity,
      prix_paye_centimes: ligne.unitAmount * ligne.quantity,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: idOf(session.payment_intent),
    }];
  });

  const { error } = await admin
    .from("expert_credits")
    .upsert(lignes, { onConflict: "stripe_checkout_session_id,type,modele", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// Applique la configuration à la prochaine facture : aucun prorata, le mois en cours reste figé.
export async function programmerConfigExpert(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  userId: string,
  selection: ExpertSelection
): Promise<void> {
  await ensureExpertProducts(stripe);
  const lignes = expertLignes(selection);
  const produitDe = (item: Stripe.SubscriptionItem) =>
    typeof item.price.product === "string" ? item.price.product : item.price.product.id;

  const items: Stripe.SubscriptionUpdateParams.Item[] = lignes.map((ligne) => {
    const existant = subscription.items.data.find((item) => produitDe(item) === EXPERT_PRODUCTS[ligne.key].id);
    return { ...(existant ? { id: existant.id } : {}), price_data: priceData(ligne), quantity: ligne.quantity };
  });
  const produitsConserves: string[] = lignes.map((ligne) => EXPERT_PRODUCTS[ligne.key].id);
  for (const item of subscription.items.data) {
    if (!produitsConserves.includes(produitDe(item))) items.push({ id: item.id, deleted: true });
  }

  await stripe.subscriptions.update(subscription.id, {
    items,
    metadata: expertMetadata(userId, selection),
    proration_behavior: "none",
  });
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

// Crée la période payée, à la souscription comme à chaque renouvellement. stripe_invoice_id
// étant unique, une livraison en double du webhook ne crée pas de seconde période.
export async function enregistrerPeriodeExpert(admin: SupabaseClient, invoice: Stripe.Invoice): Promise<void> {
  if (invoice.billing_reason !== "subscription_create" && invoice.billing_reason !== "subscription_cycle") return;

  const details = invoice.parent?.subscription_details;
  if (details?.metadata?.plan !== "expert") return;

  const config = parseExpertMetadata(details.metadata);
  const subscriptionId = idOf(details.subscription);
  const ligne = invoice.lines.data.find((item) => item.parent?.type === "subscription_item_details");
  if (!config || !subscriptionId || !ligne) {
    throw new Error(`Facture Expert payée mais inexploitable : ${invoice.id}`);
  }

  const { userId, selection } = config;
  const { error: periodeError } = await admin.from("expert_periodes").upsert(
    {
      user_id: userId,
      modele: selection.model,
      sites: selection.sites,
      images: selection.images,
      prix_total_centimes: invoice.total,
      stripe_subscription_id: subscriptionId,
      stripe_invoice_id: invoice.id,
      periode_debut: new Date(ligne.period.start * 1000).toISOString(),
      periode_fin: new Date(ligne.period.end * 1000 + EXPERT_MARGE_RENOUVELLEMENT_MS).toISOString(),
    },
    { onConflict: "stripe_invoice_id", ignoreDuplicates: true }
  );
  if (periodeError) throw new Error(periodeError.message);

  const { error: profilError } = await admin
    .from("profils")
    .update({ plan: "expert", stripe_customer_id: idOf(invoice.customer) })
    .eq("id", userId);
  if (profilError) throw new Error(profilError.message);

  // Une demande faite après la création de cette facture reste programmée pour la suivante.
  const { error: suivanteError } = await admin
    .from("expert_config_suivante")
    .delete()
    .eq("user_id", userId)
    .eq("modele", selection.model)
    .eq("sites", selection.sites)
    .eq("images", selection.images);
  if (suivanteError) throw new Error(suivanteError.message);
}

// Les crédits restent en base : l'abonné les retrouve s'il se réabonne.
export async function terminerAbonnementExpert(admin: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
  const config = parseExpertMetadata(subscription.metadata);
  if (!config || (await aPeriodeManuelleActive(admin, config.userId))) return;
  const { error } = await admin.from("profils").update({ plan: null }).eq("id", config.userId).eq("plan", "expert");
  if (error) throw new Error(error.message);
}
