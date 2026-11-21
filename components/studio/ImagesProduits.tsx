"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { MEDIA_FORMATS, type MediaFormat } from "@/lib/media/constantes";
import { FORMAT_DEFAUT_IMAGES_PRODUITS, eligibiliteProduit, photoAutorisee, photoProduit } from "@/lib/media/images-produits";
import { planifierLot } from "@/lib/media/quota-images-regles";
import { imagesPossibles } from "@/lib/media/quota-images";
import { associerAuProduitBoutique, associerAuProduitCatalogue } from "@/lib/media/associer-client";
import type { Plan } from "@/lib/plan-limits";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { LienQuotaEpuise, MentionGenerateur } from "./GenerateurMedia";
import { BOUTON_FORMAT, BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "./styles";
import { useLotImages, type ElementLot } from "./useLotImages";
import { MessageEtatOutil, outilDisponible, useEtatOutil, useMessagePause } from "./EtatOutil";

// Outil décompté pour les pauses par outil (lib/pauses-outils.ts).
const OUTIL = "studio_images_produits" as const;

// Produit affiché dans la liste : produit d'une boutique de l'utilisateur, ou produit du
// catalogue envoyé depuis la page Catalogue (« Envoyer dans le Studio IA »).
type ProduitListe = {
  cle: string;
  type: "boutique" | "catalogue";
  id: string;
  nom: string | null;
  photo: string | null;
  sousTitre: string | null;
  eligible: { ok: true } | { ok: false; raison: "sans_nom" | "sans_photo" };
  boutiqueId?: string;
  imageUrls?: string[];
};

// « Derniers produits modifiés » : produits de boutique triés par updated_at (date d'ajout ou de
// dernière modification, mise à jour à chaque PATCH de la fiche). Les produits du catalogue
// commun n'ont pas de date de modification propre à l'utilisateur.
const DERNIERS_MODIFIES = 5;
// Produits envoyés depuis le Catalogue, conservés dans ce navigateur entre deux visites.
const CLE_ENVOYES = "dropvio-studio-catalogue-envoyes";

function lireEnvoyes(): string[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_ENVOYES) ?? "[]");
    return Array.isArray(brut) ? brut.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function ecrireEnvoyes(ids: string[]) {
  try {
    localStorage.setItem(CLE_ENVOYES, JSON.stringify(ids));
  } catch {
    // Stockage indisponible (navigation privée stricte) : la liste reste valable pour cette page.
  }
}

/** Images produits : une ou plusieurs images par produit sélectionné, générées à partir de son
 *  nom, de sa description, de sa photo et d'une consigne facultative. Pas de limite de produits :
 *  seul le quota d'images du mois limite. « Enregistrer » ajoute les images choisies au produit. */
export default function ImagesProduits({ plan, onGenere, produitCatalogue }: { plan: Plan; onGenere: () => void; produitCatalogue?: string | null }) {
  const t = useTranslations("studio.produits");
  const ts = useTranslations("studio");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const lot = useLotImages({ onImage: onGenere });

  const [boutique, setBoutique] = useState<ProduitListe[] | null>(null);
  const [catalogue, setCatalogue] = useState<ProduitListe[]>([]);
  const [chargementErreur, setChargementErreur] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [nombreASelectionner, setNombreASelectionner] = useState("10");
  const [imagesParProduit, setImagesParProduit] = useState(1);
  const [consigne, setConsigne] = useState("");
  const [formatImage, setFormatImage] = useState<MediaFormat>(FORMAT_DEFAUT_IMAGES_PRODUITS);
  const [actualisationOutil, setActualisationOutil] = useState(0);
  const { quota, etat: etatOutil } = useEtatOutil(OUTIL, actualisationOutil);
  const messagePause = useMessagePause();
  // Images générées cochées pour l'enregistrement (toutes cochées par défaut).
  const [decochees, setDecochees] = useState<Set<string>>(new Set());
  const [enregistrement, setEnregistrement] = useState<Record<string, "en_cours" | "ok" | string>>({});

  // ── Produits des boutiques de l'utilisateur, du plus récemment modifié au plus ancien ──
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return setChargementErreur(true);
      // boutiques!inner + filtre user_id : boutique_produits a aussi une policy de lecture pour
      // les boutiques publiques des AUTRES utilisateurs.
      const { data, error } = await supabase
        .from("boutique_produits")
        .select("id, nom, description, image_urls, boutique_id, updated_at, boutiques!inner(nom, user_id)")
        .eq("boutiques.user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (error) return setChargementErreur(true);
      setBoutique(
        (data ?? []).map((p) => {
          const b = (Array.isArray(p.boutiques) ? p.boutiques[0] : p.boutiques) as { nom?: string } | null;
          const eligibilite = eligibiliteProduit(p);
          return {
            cle: `b:${p.id}`,
            type: "boutique" as const,
            id: p.id,
            nom: p.nom,
            photo: photoProduit(p) ?? (Array.isArray(p.image_urls) ? (p.image_urls[0] as string | undefined) ?? null : null),
            sousTitre: b?.nom ?? null,
            eligible: eligibilite.ok ? { ok: true as const } : { ok: false as const, raison: eligibilite.raison },
            boutiqueId: p.boutique_id,
            imageUrls: Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [],
          };
        })
      );
    });
  }, []);

  // ── Produits envoyés depuis le Catalogue ──
  useEffect(() => {
    const ids = lireEnvoyes();
    if (produitCatalogue && !ids.includes(produitCatalogue)) ids.unshift(produitCatalogue);
    ecrireEnvoyes(ids);
    if (produitCatalogue) queueMicrotask(() => setSelection((s) => (s.includes(`c:${produitCatalogue}`) ? s : [...s, `c:${produitCatalogue}`])));
    Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/catalogue/${encodeURIComponent(id)}`).catch(() => null);
        const json = res?.ok ? await res.json().catch(() => null) : null;
        const p = json?.produit as { id: string; nom: string; image: string | null; imageCatalogue: string | null } | undefined;
        if (!p) return null;
        // La génération part de la photo du catalogue (hôtes autorisés), pas des photos choisies.
        const reference = p.imageCatalogue ?? p.image;
        const eligible: ProduitListe["eligible"] = !p.nom?.trim()
          ? { ok: false, raison: "sans_nom" }
          : !reference || !photoAutorisee(reference)
            ? { ok: false, raison: "sans_photo" }
            : { ok: true };
        return { cle: `c:${p.id}`, type: "catalogue" as const, id: p.id, nom: p.nom, photo: p.image, sousTitre: t("depuisCatalogue"), eligible } satisfies ProduitListe;
      })
    ).then((liste) => setCatalogue(liste.filter((p): p is NonNullable<typeof p> => p !== null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produitCatalogue]);

  function retirerDuCatalogue(id: string) {
    ecrireEnvoyes(lireEnvoyes().filter((v) => v !== id));
    setCatalogue((c) => c.filter((p) => p.id !== id));
    setSelection((s) => s.filter((cle) => cle !== `c:${id}`));
  }

  const tous = useMemo(() => [...catalogue, ...(boutique ?? [])], [catalogue, boutique]);
  const visibles = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase();
    return terme ? tous.filter((p) => `${p.nom ?? ""} ${p.sousTitre ?? ""}`.toLocaleLowerCase().includes(terme)) : tous;
  }, [tous, recherche]);
  const parCle = useMemo(() => new Map(tous.map((p) => [p.cle, p])), [tous]);

  const prix = quota?.coutImageEur ?? 0;
  // Images possibles : le plus petit du quota du mois et des crédits de l'outil sur la période.
  const plan_ = planifierLot(selection.length, imagesParProduit, imagesPossibles(quota, etatOutil), prix);
  const peutLancer = !lot.enCours && selection.length > 0 && plan_.couvert && outilDisponible(etatOutil);

  function basculer(cle: string) {
    setSelection((s) => (s.includes(cle) ? s.filter((v) => v !== cle) : [...s, cle]));
  }

  function selectionnerNombre() {
    const n = Math.max(0, Math.floor(Number(nombreASelectionner) || 0));
    setSelection(visibles.filter((p) => p.eligible.ok).slice(0, n).map((p) => p.cle));
  }

  function elementDe(cle: string): ElementLot {
    const p = parCle.get(cle)!;
    return {
      cle,
      corps: {
        ...(p.type === "boutique" ? { produitId: p.id } : { produitCatalogueId: p.id }),
        format: formatImage,
        outil: OUTIL,
        ...(consigne.trim() ? { consigne: consigne.trim() } : {}),
      },
    };
  }

  async function lancer(cles: string[]) {
    const { traites } = await lot.lancer(cles.map(elementDe), imagesParProduit);
    // Les produits traités sortent de la sélection ; les autres restent, pour relancer.
    const faits = new Set(cles.slice(0, traites));
    setSelection((s) => s.filter((cle) => !faits.has(cle)));
    setActualisationOutil((n) => n + 1);
  }

  async function enregistrer(produit: ProduitListe) {
    const ids = (lot.images[produit.cle] ?? []).map((i) => i.id).filter((id) => !decochees.has(id));
    if (ids.length === 0) return;
    setEnregistrement((e) => ({ ...e, [produit.cle]: "en_cours" }));
    const resultat =
      produit.type === "boutique"
        ? await associerAuProduitBoutique(produit.boutiqueId!, produit.id, produit.imageUrls ?? [], ids)
        : await associerAuProduitCatalogue(produit.id, ids);
    if (!resultat.ok) {
      setEnregistrement((e) => ({ ...e, [produit.cle]: apiErrorMessage(resultat.json, t("enregistrerErreur")) }));
      return;
    }
    if (produit.type === "boutique") {
      setBoutique((liste) => (liste ?? []).map((p) => (p.cle === produit.cle ? { ...p, imageUrls: resultat.urls } : p)));
    }
    lot.oublierImages(produit.cle, ids);
    setEnregistrement((e) => ({ ...e, [produit.cle]: "ok" }));
  }

  function ligne(produit: ProduitListe) {
    const coche = selection.includes(produit.cle);
    const etat = lot.etats[produit.cle];
    const generees = lot.images[produit.cle] ?? [];
    const statutEnregistrement = enregistrement[produit.cle];
    return (
      <li key={produit.cle} className="border-b border-[var(--border)] last:border-b-0">
        <div className={`flex min-h-[56px] items-center gap-3 px-3 py-2 ${produit.eligible.ok ? "hover:bg-[var(--surface-2)]" : ""}`}>
          <input
            type="checkbox"
            checked={coche}
            disabled={!produit.eligible.ok || lot.enCours}
            onChange={() => basculer(produit.cle)}
            aria-label={produit.nom ?? t("sansNomLibelle")}
            className="h-5 w-5 shrink-0 accent-violet-600"
          />
          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {produit.photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={produit.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm ${produit.eligible.ok ? "text-[var(--text-primary)]" : "text-[var(--text-faint)]"}`}>
              {produit.nom?.trim() || t("sansNomLibelle")}
            </span>
            {!produit.eligible.ok ? (
              <span className="block text-xs text-[var(--warning)]">{t(produit.eligible.raison === "sans_nom" ? "sansNom" : "sansPhoto")}</span>
            ) : etat ? (
              <span className={`block text-xs ${etat.statut === "erreur" ? "text-[var(--danger)]" : etat.statut === "ok" ? "text-[var(--success)]" : "text-[var(--text-faint)]"}`}>
                {etat.statut === "erreur" ? etat.message : t(`etat_${etat.statut}`)}
              </span>
            ) : (
              produit.sousTitre && <span className="block truncate text-xs text-[var(--text-faint)]">{produit.sousTitre}</span>
            )}
          </span>
          {produit.type === "catalogue" && !lot.enCours && (
            <button type="button" onClick={() => retirerDuCatalogue(produit.id)} className="shrink-0 text-xs text-[var(--text-faint)] hover:text-[var(--danger)]">
              {t("retirerListe")}
            </button>
          )}
        </div>

        {(generees.length > 0 || statutEnregistrement) && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pl-11">
            {generees.map((image) => {
              const retenue = !decochees.has(image.id);
              return (
                <label key={image.id} className={`relative h-16 w-16 cursor-pointer overflow-hidden rounded-lg border-2 ${retenue ? "border-violet-500" : "border-[var(--border)] opacity-50"}`}>
                  <input
                    type="checkbox"
                    checked={retenue}
                    onChange={() =>
                      setDecochees((d) => {
                        const suivant = new Set(d);
                        if (retenue) suivant.add(image.id);
                        else suivant.delete(image.id);
                        return suivant;
                      })
                    }
                    className="absolute left-1 top-1 h-3.5 w-3.5 accent-violet-600"
                    aria-label={t("garderImage")}
                  />
                  {image.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                  )}
                </label>
              );
            })}
            {generees.length > 0 && (
              <button
                type="button"
                disabled={statutEnregistrement === "en_cours" || generees.every((i) => decochees.has(i.id))}
                onClick={() => void enregistrer(produit)}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                {statutEnregistrement === "en_cours" ? t("enregistrement") : t("enregistrer")}
              </button>
            )}
            {statutEnregistrement === "ok" && <span className="text-xs text-[var(--success)]">{t("enregistre")}</span>}
            {statutEnregistrement && statutEnregistrement !== "ok" && statutEnregistrement !== "en_cours" && (
              <span className="text-xs text-[var(--danger)]">{statutEnregistrement}</span>
            )}
          </div>
        )}
      </li>
    );
  }

  const visiblesCatalogue = visibles.filter((p) => p.type === "catalogue");
  const visiblesBoutique = visibles.filter((p) => p.type === "boutique");
  const recents = recherche.trim() ? [] : visiblesBoutique.slice(0, DERNIERS_MODIFIES);
  const autres = recherche.trim() ? visiblesBoutique : visiblesBoutique.slice(DERNIERS_MODIFIES);
  const titreSection = (texte: string) => (
    <li className="sticky top-0 z-[1] border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">{texte}</li>
  );

  return (
    <div className="flex flex-col gap-5">
      <fieldset disabled={lot.enCours} className="flex min-w-0 flex-col gap-5">
        <legend className="sr-only">{t("legende")}</legend>
        <p className="text-sm text-[var(--text-muted)]">{t("aide")}</p>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="studio-recherche-produit" className="text-sm font-medium text-[var(--text-muted)]">{t("produitsTitre")}</label>
            <div className="flex items-center gap-2">
              <span aria-live="polite" className="text-xs font-semibold text-[var(--text-primary)]">{t("selectionCompte", { n: selection.length })}</span>
              {/* « + » : ouvre le Catalogue, d'où chaque produit s'envoie dans le Studio IA. */}
              <Link
                href="/produits-gagnants/catalogue"
                aria-label={t("ajouterDepuisCatalogue")}
                title={t("ajouterDepuisCatalogue")}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-strong)] text-lg leading-none text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              >
                +
              </Link>
            </div>
          </div>
          <input
            id="studio-recherche-produit"
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder={t("recherche")}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
            <label htmlFor="studio-nombre-selection">{t("selectionnerLibelle")}</label>
            <input
              id="studio-nombre-selection"
              type="number"
              min={1}
              value={nombreASelectionner}
              onChange={(e) => setNombreASelectionner(e.target.value)}
              className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            />
            <button type="button" onClick={selectionnerNombre} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]">
              {t("selectionner")}
            </button>
            {selection.length > 0 && (
              <button type="button" onClick={() => setSelection([])} className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)]">
                {t("vider")}
              </button>
            )}
          </div>

          <ul className="max-h-[420px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)]" aria-label={t("produitsTitre")}>
            {chargementErreur ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--danger)]">{t("chargementErreur")}</li>
            ) : boutique === null ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--text-faint)]">{ts("chargement")}</li>
            ) : tous.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                {t("aucunProduit")}{" "}
                <Link href="/produits-gagnants/catalogue" className="font-semibold text-[var(--accent)] underline-offset-4 hover:underline">{t("versCatalogue")}</Link>
              </li>
            ) : visibles.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">{t("rechercheVide")}</li>
            ) : (
              <>
                {visiblesCatalogue.length > 0 && titreSection(t("sectionCatalogue"))}
                {visiblesCatalogue.map(ligne)}
                {recents.length > 0 && titreSection(t("sectionRecents", { n: DERNIERS_MODIFIES }))}
                {recents.map(ligne)}
                {autres.length > 0 && titreSection(recherche.trim() ? t("sectionResultats") : t("sectionAutres"))}
                {autres.map(ligne)}
              </>
            )}
          </ul>
        </div>

        <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
          {t("consigne")}
          <textarea
            value={consigne}
            onChange={(e) => setConsigne(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t("consignePlaceholder")}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={ts("format")}>
            {(Object.keys(MEDIA_FORMATS) as MediaFormat[]).map((valeur) => (
              <button key={valeur} type="button" aria-pressed={formatImage === valeur} onClick={() => setFormatImage(valeur)} className={BOUTON_FORMAT(formatImage === valeur)}>
                {ts(`format_${valeur}`)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-muted)]">
            {t("imagesParProduit")}
            <input
              type="number"
              min={1}
              value={imagesParProduit}
              onChange={(e) => setImagesParProduit(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3" aria-live="polite">
        <p className="text-sm text-[var(--text-primary)]">
          <span className="font-semibold">{t("resume", { n: selection.length })}</span>{" "}
          <span className="text-[var(--text-muted)]">
            {t("cout", { images: plan_.images, eur: format.number(plan_.coutEur, { style: "currency", currency: "EUR" }) })}
          </span>
          {quota && <span className="text-[var(--text-muted)]"> {t("restantes", { restantes: quota.imagesRestantes })}</span>}
        </p>
        <MessageEtatOutil etat={etatOutil} />
        {!plan_.couvert && selection.length > 0 && !lot.enCours && outilDisponible(etatOutil) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--warning)]">
            <span>
              {plan_.produitsPossibles > 0
                ? t("depasse", { possibles: plan_.imagesPossibles, produits: plan_.produitsPossibles })
                : t("quotaEpuise")}
            </span>
            {plan_.produitsPossibles > 0 && (
              <button
                type="button"
                onClick={() => void lancer(selection.slice(0, plan_.produitsPossibles))}
                className="rounded-lg border border-[var(--warning)]/40 px-2.5 py-1 font-semibold text-[var(--warning)] transition hover:bg-[var(--warning)]/10"
              >
                {t("genererSeulement", { produits: plan_.produitsPossibles })}
              </button>
            )}
            {quota?.source === "expert" && <Link href="/quota" className="underline">{t("recharger")}</Link>}
          </div>
        )}
        {lot.enCours && (
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>{t("progressionProduits", { faits: lot.traites, total: lot.total })}</span>
            <button type="button" onClick={lot.arreter} className="rounded-lg border border-[var(--border-strong)] px-2.5 py-1 font-semibold text-[var(--text-primary)]">
              {t("arreter")}
            </button>
          </div>
        )}
        {lot.arret && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {lot.arret.raison === "pause"
              ? `${lot.arret.finPause ? messagePause(lot.arret.finPause) : ""} ${t("arretUtilisateur", { traites: lot.arret.traites, total: lot.arret.total })}`
              : lot.arret.raison === "quota"
              ? t("arretQuota", { traites: lot.arret.traites, total: lot.arret.total })
              : lot.arret.raison === "utilisateur"
                ? t("arretUtilisateur", { traites: lot.arret.traites, total: lot.arret.total })
                : t("arretBloquant", { traites: lot.arret.traites, total: lot.arret.total, message: lot.arret.message ?? "" })}
            <LienQuotaEpuise code={lot.codeArret} />
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" disabled={!peutLancer} onClick={() => void lancer([...selection])} className={BOUTON_PRIMAIRE}>
          {lot.enCours ? ts("generationEnCours") : t("lancer", { n: plan_.images })}
        </button>
        {selection.length > 0 && !lot.enCours && (
          <button type="button" onClick={() => setSelection([])} className={BOUTON_SECONDAIRE}>
            {t("vider")}
          </button>
        )}
        <MentionGenerateur plan={plan} />
      </div>
    </div>
  );
}
