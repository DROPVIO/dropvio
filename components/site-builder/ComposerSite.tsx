"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FicheStyle } from "@/lib/style-fiche";
import { MAX_FICHIERS_INSPIRATION, useInspiration, useResumeFiche } from "./InspirationStyle";

// Barre de saisie de l'étape 1 du Site Builder, sur le modèle d'un assistant conversationnel :
// le prompt au centre, les éléments joints (produit, captures d'inspiration, corrections) en
// pièces jointes au-dessus, un « + » pour en ajouter et un bouton d'envoi qui lance la
// génération. Partagée par le mode produit unique et le mode boutique (app/site-builder/page.tsx),
// qui fournissent leurs propres pièces jointes et entrées de menu.

export type PieceJointe = {
  id: string;
  titre: string;
  sousTitre?: string;
  image?: string | null;
  icone?: string;
  // Pièce attendue mais pas encore fournie (ex. le produit) : affichée en pointillés.
  attendue?: boolean;
  onClick?: () => void;
  onRetirer?: () => void;
};

export type ActionMenu = {
  id: string;
  icone: string;
  libelle: string;
  aide?: string;
  disabled?: boolean;
} & (
  | { onClick: () => void; fichiers?: undefined }
  // Entrée qui ouvre directement le sélecteur de fichiers (ex. captures d'avis clients).
  | { onClick?: undefined; fichiers: { accept: string; multiple?: boolean; onChoix: (liste: FileList | null) => void } }
);

// Hauteur maximale du champ avant défilement : 320 px, et jamais plus de 30 % de l'écran
// pour que la barre (collante en bas) ne masque pas la page.
const LIGNES_MAX_PX = 320;
const LIGNES_MAX_PART_ECRAN = 0.3;

export default function ComposerSite({
  prompt,
  onPromptChange,
  promptManquant,
  promptMax,
  piecesJointes,
  actions,
  onFicheChange,
  fiche,
  autoMode,
  onAutoModeChange,
  peutEnvoyer,
  onEnvoyer,
  aide,
  outils,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  // Caractères manquants pour atteindre le minimum du prompt (0 : suffisant).
  promptManquant: number;
  // Longueur maximale du prompt : au-delà, le compteur passe en erreur.
  promptMax?: number;
  piecesJointes: PieceJointe[];
  actions: ActionMenu[];
  fiche: FicheStyle | null;
  onFicheChange: (fiche: FicheStyle | null) => void;
  // Absents en mode boutique : la génération « l'IA choisit le style » n'y est pas supportée.
  autoMode?: boolean;
  onAutoModeChange?: (value: boolean) => void;
  peutEnvoyer: boolean;
  onEnvoyer: () => void;
  // Ce qui manque encore pour pouvoir générer, affiché sous la barre.
  aide?: string | null;
  // Réglages supplémentaires affichés après « Style auto » (ex. format d'export), en BoutonOutil.
  outils?: ReactNode;
}) {
  const t = useTranslations("siteBuilder.builder.composer");
  const tPrompt = useTranslations("siteBuilder.builder.prompt");
  const inspiration = useInspiration(onFicheChange);
  const resumeFiche = useResumeFiche(fiche);
  const [menuOuvert, setMenuOuvert] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Le sélecteur de captures s'ouvre via un <label htmlFor> : pas de ref lue pendant le rendu.
  const fichierId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  // Hauteur ajustée au contenu (prompt pré-rempli compris), plafonnée puis défilante.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = Math.min(LIGNES_MAX_PX, Math.round(window.innerHeight * LIGNES_MAX_PART_ECRAN));
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [prompt]);

  useEffect(() => {
    if (!menuOuvert) return;
    function fermer(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) {
        setMenuOuvert(false);
      }
    }
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", fermer);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", fermer);
    };
  }, [menuOuvert]);

  function envoyer() {
    if (peutEnvoyer) onEnvoyer();
  }

  const aStyle = inspiration.apercus.length > 0 || fiche !== null;
  const tropLong = promptMax !== undefined && prompt.trim().length > promptMax;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-lg shadow-black/5 transition focus-within:border-violet-500/60 focus-within:ring-1 focus-within:ring-violet-500/30">
        {(piecesJointes.length > 0 || aStyle) && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {piecesJointes.map((p) => (
              <PieceJointeChip key={p.id} piece={p} libelleRetirer={t("retirer")} />
            ))}

            {aStyle && (
              <div
                className="group relative flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1.5 pr-3"
                title={resumeFiche ?? undefined}
              >
                <div className="flex -space-x-3">
                  {inspiration.apercus.map((src, i) => (
                    // Aperçu local (object URL) d'un fichier choisi : next/image n'apporte rien ici.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      src={src}
                      alt=""
                      className="h-10 w-10 rounded-xl border-2 border-[var(--surface)] object-cover"
                      style={{ zIndex: inspiration.apercus.length - i }}
                    />
                  ))}
                  {inspiration.apercus.length === 0 && (
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-2)] text-base">🎨</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    {inspiration.analyse ? t("analyseEnCours") : fiche ? t("styleExtrait") : t("styleNonAnalyse")}
                  </p>
                  {fiche && !inspiration.analyse && (
                    <div className="mt-0.5 flex items-center gap-1">
                      {(["fond", "encre", "accent"] as const).map((k) =>
                        fiche.palette[k] ? (
                          // Couleurs extraites d'une capture : valeurs arbitraires, inline style volontaire.
                          <span
                            key={k}
                            className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--border-strong)]"
                            style={{ background: fiche.palette[k] }}
                          />
                        ) : null
                      )}
                      <span className="text-[11px] text-[var(--text-faint)]">{fiche.typo}</span>
                    </div>
                  )}
                </div>
                {inspiration.analyse ? (
                  <span className="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                ) : (
                  <BoutonRetirer libelle={t("retirer")} onClick={inspiration.retirer} />
                )}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              envoyer();
            }
          }}
          rows={2}
          aria-label={tPrompt("label")}
          placeholder={t("placeholder")}
          className="block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-faint)] outline-none"
        />

        <div className="flex items-center gap-2 px-3 pb-3">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOuvert((o) => !o)}
              aria-label={t("ajouter")}
              aria-expanded={menuOuvert}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-xl leading-none transition ${
                menuOuvert
                  ? "border-violet-500/50 bg-violet-500/10 text-[var(--accent)] rotate-45"
                  : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              }`}
            >
              +
            </button>
            {menuOuvert && (
              <div
                role="menu"
                className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-xl shadow-black/10"
              >
                {actions.map((a) => {
                  const contenu = (
                    <>
                      <span className="text-base leading-5">{a.icone}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--text-primary)]">{a.libelle}</span>
                        {a.aide && <span className="block text-[11px] text-[var(--text-faint)]">{a.aide}</span>}
                      </span>
                    </>
                  );
                  return a.fichiers ? (
                    <label
                      key={a.id}
                      htmlFor={`${fichierId}-${a.id}`}
                      role="menuitem"
                      aria-disabled={a.disabled}
                      onClick={(e) => {
                        if (a.disabled) e.preventDefault();
                        // Fermeture différée : voir le label des images d'inspiration ci-dessous.
                        setTimeout(() => setMenuOuvert(false), 0);
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                        a.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                      }`}
                    >
                      {contenu}
                    </label>
                  ) : (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      disabled={a.disabled}
                      onClick={() => {
                        setMenuOuvert(false);
                        a.onClick();
                      }}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {contenu}
                    </button>
                  );
                })}
                <label
                  htmlFor={fichierId}
                  role="menuitem"
                  aria-disabled={inspiration.analyse}
                  onClick={(e) => {
                    if (inspiration.analyse) e.preventDefault();
                    // Fermeture différée : retirer le label du DOM pendant le clic empêcherait
                    // le navigateur d'ouvrir le sélecteur de fichiers.
                    setTimeout(() => setMenuOuvert(false), 0);
                  }}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--surface-2)] ${
                    inspiration.analyse ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                  }`}
                >
                  <span className="text-base leading-5">🖼️</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text-primary)]">{t("imagesInspiration")}</span>
                    <span className="block text-[11px] text-[var(--text-faint)]">
                      {t("imagesInspirationAide", { max: MAX_FICHIERS_INSPIRATION })}
                    </span>
                  </span>
                </label>
              </div>
            )}
            {actions.map((a) =>
              a.fichiers ? (
                <input
                  key={a.id}
                  id={`${fichierId}-${a.id}`}
                  type="file"
                  accept={a.fichiers.accept}
                  multiple={a.fichiers.multiple}
                  className="hidden"
                  onChange={(e) => {
                    a.fichiers.onChoix(e.target.files);
                    e.target.value = "";
                  }}
                />
              ) : null
            )}
            <input
              id={fichierId}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                inspiration.ajouter(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {onAutoModeChange && (
            <BoutonOutil actif={Boolean(autoMode)} onClick={() => onAutoModeChange(!autoMode)} title={t("styleAutoAide")}>
              <span>🤖</span>
              {t("styleAuto")}
            </BoutonOutil>
          )}
          {outils}

          <span
            className={`ml-auto hidden text-[11px] sm:inline ${
              tropLong ? "font-semibold text-[var(--danger)]" : promptManquant > 0 ? "text-[var(--text-faint)]" : "text-[var(--accent)]"
            }`}
          >
            {tropLong
              ? tPrompt("compteurMax", { count: prompt.trim().length, max: promptMax ?? 0 })
              : promptManquant > 0
              ? tPrompt("compteurManquant", { count: prompt.trim().length, manquant: promptManquant })
              : tPrompt("compteur", { count: prompt.trim().length })}
          </span>

          <button
            type="button"
            onClick={envoyer}
            disabled={!peutEnvoyer}
            aria-label={t("envoyer")}
            title={t("envoyer")}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-md shadow-violet-900/30 transition hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-[var(--surface-3)] disabled:to-[var(--surface-3)] disabled:text-[var(--text-faint)] disabled:shadow-none sm:ml-0"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {inspiration.erreurs.map((e) => (
        <p key={e} className="px-2 text-xs text-[var(--danger)]">{e}</p>
      ))}
      <p className="px-2 text-[11px] text-[var(--text-faint)]">
        {aide ?? t("raccourci")}
      </p>
    </div>
  );
}

// Pastille de réglage de la barre d'outils (« Style auto », format d'export…).
export function BoutonOutil({
  actif = false,
  onClick,
  title,
  children,
}: {
  actif?: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      title={title}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
        actif
          ? "border-violet-500 bg-violet-500/10 text-[var(--accent)]"
          : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

function BoutonRetirer({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={libelle}
      title={libelle}
      className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function PieceJointeChip({ piece, libelleRetirer }: { piece: PieceJointe; libelleRetirer: string }) {
  const contenu: ReactNode = (
    <>
      {piece.image ? (
        // URL d'image produit arbitraire (fournisseur) : <img> volontaire, pas de proxy next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={piece.image} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-base">
          {piece.icone ?? "📦"}
        </span>
      )}
      <span className="min-w-0 text-left">
        <span className="block max-w-[14rem] truncate text-xs font-semibold text-[var(--text-primary)]">{piece.titre}</span>
        {piece.sousTitre && (
          <span className="block max-w-[14rem] truncate text-[11px] text-[var(--text-faint)]">{piece.sousTitre}</span>
        )}
      </span>
    </>
  );

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-1.5 pr-3 transition ${
        piece.attendue
          ? "border-dashed border-[var(--border-strong)] bg-transparent"
          : "border-[var(--border)] bg-[var(--bg)]"
      } ${piece.onClick ? "hover:border-violet-500/40" : ""}`}
    >
      {piece.onClick ? (
        <button type="button" onClick={piece.onClick} className="flex items-center gap-2">
          {contenu}
        </button>
      ) : (
        <div className="flex items-center gap-2">{contenu}</div>
      )}
      {piece.onRetirer && <BoutonRetirer libelle={libelleRetirer} onClick={piece.onRetirer} />}
    </div>
  );
}
