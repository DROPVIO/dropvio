import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, erreurServeur } from "@/lib/api-errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { adresseIp } from "@/lib/consentements-serveur";
import { referenceRetractation, validerDemande } from "@/lib/retractation";

// Demande de rétractation déposée en ligne. Accessible sans connexion (droit de rétractation
// exerçable pendant tout le délai) ; rattachée au compte si la personne est connectée.
// Aucun remboursement automatique : chaque demande est traitée à la main dans Stripe.
export async function POST(request: Request) {
  const ip = adresseIp(request) ?? "inconnue";
  if (!(await checkRateLimit(`retractation:${ip}`, { max: 10, windowMs: 3_600_000 }))) {
    return apiError("rate_limit", 429, "Trop de demandes en peu de temps. Réessayez dans quelques minutes.");
  }

  const validation = validerDemande(await request.json().catch(() => null));
  if (!validation.ok) {
    return apiError("retractation_invalide", 400, "Vérifiez les champs du formulaire.", { champs: validation.champs });
  }
  const { demande } = validation;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const reference = referenceRetractation(new Date(), () => randomInt(0, 1_000_000) / 1_000_000);
  const { data, error } = await createSupabaseAdminClient()
    .from("demandes_retractation")
    .insert({
      reference,
      user_id: user?.id ?? null,
      nom: demande.nom,
      email: demande.email,
      achat: demande.achat,
      achat_ref: demande.achatRef,
      date_achat: demande.dateAchat,
      adresse_ip: ip === "inconnue" ? null : ip,
    })
    .select("reference, created_at")
    .single();
  if (error || !data) return erreurServeur("api/retractation", error ?? "Insertion sans résultat");

  // L'application n'envoie pas encore d'e-mail : l'accusé est affiché avec sa référence.
  return NextResponse.json({ reference: data.reference, recueLe: data.created_at });
}
