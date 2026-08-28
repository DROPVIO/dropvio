import { notFound, redirect } from "next/navigation";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { FORMATION_MODULES } from "@/lib/formation-content";
import PagedReader from "./PagedReader";

// Vue de lecture dédiée, séparée de /formation (qui reste la page de vente/liste). Le contrôle
// d'accès reproduit exactement celui de /api/formation : contenuHtml n'est jamais envoyé au
// client tant que la collection du module n'est pas possédée par l'utilisateur connecté — un
// module inexistant donne 404, un module non possédé (ou visiteur anonyme) redirige vers
// /formation sans jamais construire la prop contenuHtml.
export default async function LireModulePage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = await params;
  const module = FORMATION_MODULES.find((m) => m.id === moduleId);
  if (!module) notFound();

  const { user, formationOwned } = await getServerUserAndPlan();
  if (!user || !formationOwned[module.collection]) {
    redirect("/formation");
  }

  return <PagedReader titre={module.titre} contenuHtml={module.contenuHtml} />;
}
