// Demandes de rétractation (table demandes_retractation, lisible seulement avec le service role).
//   npx tsx scripts/demandes-retractation.ts                   → demandes « reçues »
//   npx tsx scripts/demandes-retractation.ts --toutes          → toutes les demandes
//   npx tsx scripts/demandes-retractation.ts --traiter RET-…   → marque une demande « traitée »
// Le remboursement éventuel se fait à la main dans Stripe : ce script n'en déclenche aucun.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { createSupabaseAdminClient } from "../lib/supabase-admin";

async function main() {
  const admin = createSupabaseAdminClient();
  const args = process.argv.slice(2);
  const iTraiter = args.indexOf("--traiter");

  if (iTraiter !== -1) {
    const reference = args[iTraiter + 1];
    if (!reference) throw new Error("Indiquez la référence : --traiter RET-AAAAMMJJ-XXXXXX");
    const { data, error } = await admin
      .from("demandes_retractation")
      .update({ statut: "traitee", traitee_le: new Date().toISOString() })
      .eq("reference", reference)
      .select("reference")
      .maybeSingle();
    if (error) throw new Error(error.message);
    console.log(data ? `${reference} : traitée.` : `${reference} : introuvable.`);
    return;
  }

  let requete = admin
    .from("demandes_retractation")
    .select("reference, statut, created_at, nom, email, achat, date_achat, user_id")
    .order("created_at", { ascending: false });
  if (!args.includes("--toutes")) requete = requete.eq("statut", "recue");
  const { data, error } = await requete;
  if (error) throw new Error(error.message);
  if (!data?.length) {
    console.log("Aucune demande.");
    return;
  }
  for (const d of data) {
    console.log(`${d.reference}  ${d.statut.padEnd(7)}  reçue le ${d.created_at.slice(0, 16).replace("T", " ")}  ${d.nom} <${d.email}>  achat du ${d.date_achat} : ${d.achat}${d.user_id ? "  (compte connecté)" : ""}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
