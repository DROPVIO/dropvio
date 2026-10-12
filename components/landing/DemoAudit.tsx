"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORT_EMAIL } from "@/lib/contact";

/* Démonstration de l'audit IA, jouable directement depuis la landing.
 *
 * Rien n'est envoyé au serveur : on valide la saisie, on joue une seconde d'analyse, puis on
 * explique que l'audit n'est pas encore ouvert. La maquette ouvrait ici un Stripe Checkout
 * pour un essai Pro de 3 jours — il n'existe ni essai ni abonnement dans le code, donc la
 * modale renvoie vers le support, exactement comme components/ParametresModal.tsx.
 *
 * La maquette réduisait aussi la fenêtre par paliers de densité pour la faire tenir dans
 * 100vh. Remplacé par une mise en page qui s'écoule normalement : sur un écran bas la section
 * s'allonge au lieu d'être rognée, et il n'y a plus de boucle de mesure. */

const RE_URL = /^(https?:\/\/)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d{2,5})?(\/[^\s]*)?$/i;
const RE_CODE = /<(html|body|div)[\s>/]/i;

type Phase = "repos" | "analyse" | "modale";
type Champ = "url" | "html";

export default function DemoAudit() {
  const t = useTranslations("landing.demo");
  const tPrix = useTranslations("landing.pricing");
  // Clés déjà traduites, réutilisées pour le bouton d'abonnement désactivé :
  //   dashboard.nav.soon            → bientôt / soon / pronto / presto
  //   parametres.plan.chooseTooltip → explication + adresse du support
  // La modale d'abonnement (Stripe) vit sur la branche backup/wip-complet-2026-10-12 et sera
  // rebranchée ici avec le chantier abonnement.
  const tSoon = useTranslations("dashboard.nav");
  const tPlan = useTranslations("parametres.plan");
  const titreId = useId();

  const [phase, setPhase] = useState<Phase>("repos");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [nomFichier, setNomFichier] = useState("");
  const [champ, setChamp] = useState<Champ>("url");
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [recap, setRecap] = useState("");

  const urlRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const dlgRef = useRef<HTMLDivElement>(null);
  const avantModale = useRef<HTMLElement | null>(null);

  const focusChamp = useCallback(() => {
    (champ === "html" ? htmlRef : urlRef).current?.focus();
  }, [champ]);

  const ouvreModale = useCallback(() => {
    avantModale.current = document.activeElement as HTMLElement | null;
    setPhase("modale");
  }, []);

  /** Valide puis lance la fausse analyse. `prefere` permet à Entrée dans un champ de forcer
   *  ce champ comme source, même si l'autre est rempli. */
  const lance = useCallback(
    (prefere?: Champ | "fichier") => {
      if (phase === "analyse") return;
      const veut = prefere ?? champ;

      let label = "";
      if (veut === "fichier" && nomFichier) {
        label = nomFichier;
      } else if (veut === "html" ? html.trim() : !url.trim() && html.trim()) {
        if (RE_CODE.test(html)) label = nomFichier || t("chars", { n: html.length.toLocaleString() });
      } else if (url.trim()) {
        if (RE_URL.test(url.trim())) {
          const u = url.trim();
          label = /^https?:\/\//i.test(u) ? u : `https://${u}`;
          setUrl(label);
        }
      }

      if (!label) {
        setErreur(true);
        focusChamp();
        return;
      }
      setErreur(false);
      setRecap(label);
      setPhase("analyse");
    },
    [phase, champ, nomFichier, html, url, t, focusChamp]
  );

  // L'analyse simulée dure une seconde, puis la modale explique où en est l'audit.
  useEffect(() => {
    if (phase !== "analyse") return;
    const id = window.setTimeout(ouvreModale, 1000);
    return () => window.clearTimeout(id);
  }, [phase, ouvreModale]);

  // Verrou de défilement + restitution du focus : une modale qui laisse la page défiler
  // derrière elle et perd le focus au retour est inutilisable au clavier.
  useEffect(() => {
    if (phase !== "modale") return;
    const avant = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    // Le focus va sur le dialogue lui-même (tabIndex={-1}) : le lecteur d'écran annonce son
    // titre via aria-labelledby, et Tab entre ensuite dans le piège à focus.
    dlgRef.current?.focus();
    return () => {
      document.documentElement.style.overflow = avant;
      avantModale.current?.focus?.();
    };
  }, [phase]);

  const lisFichier = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      if (!/\.html?$/i.test(f.name)) {
        setErreur(true);
        return;
      }
      const r = new FileReader();
      r.onload = (e) => {
        setHtml(String(e.target?.result ?? ""));
        setNomFichier(f.name);
        setChamp("html");
        setErreur(false);
        // Pas de passage par lance() : le contenu vient d'être lu, il n'est pas encore dans
        // l'état, et un .html valide n'a rien à revalider.
        setRecap(f.name);
        setPhase("analyse");
      };
      r.onerror = () => setErreur(true);
      r.readAsText(f);
    },
    []
  );

  const ferme = () => setPhase("repos");

  const toucheDlg = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      ferme();
      return;
    }
    if (e.key !== "Tab") return;
    const f = dlgRef.current?.querySelectorAll<HTMLElement>("a[href], button");
    if (!f?.length) return;
    const premier = f[0];
    const dernier = f[f.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const analyse = phase === "analyse";

  return (
    <section className="border-y border-[#eee] bg-white">
      <div className="mx-auto box-border max-w-[1240px] px-4 py-[clamp(48px,6cqw,96px)] sm:px-6">
        <div className="max-w-[640px]">
          <h2
            data-rv="up"
            style={{ "--dl": "0ms" } as React.CSSProperties}
            className="m-0 text-[clamp(28px,3cqw,44px)] font-[650] leading-[1.1] tracking-[-0.03em] text-[#111]"
          >
            {t("title")}
          </h2>
          <p data-rv="up" style={{ "--dl": "80ms" } as React.CSSProperties} className="mt-3 text-[clamp(15px,1.4cqw,18px)] leading-[1.5] text-[#555]">
            {t("subtitle")}
          </p>
        </div>

        {/* ── La fenêtre ──────────────────────────────────────────────── */}
        <div data-rv="zoom" style={{ "--dl": "160ms" } as React.CSSProperties} className="mt-8">
          <div
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("input,textarea,button,label,[data-drop]")) focusChamp();
            }}
            className="relative flex cursor-text flex-col overflow-hidden rounded-[10px] bg-[#0E0D12] text-[#F4F4F6]"
            style={{ boxShadow: "0 0 0 1px rgba(17,17,17,0.08), 0 24px 48px -28px rgba(20,20,35,0.45)" }}
          >
            <div className="flex h-9 flex-none items-center gap-[7px] border-b border-white/10 bg-[#16151c] px-[14px]">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-[9px] w-[9px] rounded-full bg-white/[0.18]" />
              ))}
            </div>

            <div className="px-[14px] pb-6 pt-4 sm:px-8 sm:py-7">
              <div className="mb-4">
                <div className="text-[22px] font-bold leading-[1.3] sm:text-[28px]">{t("winTitle")}</div>
                <p className="mt-1.5 text-[15px] leading-[1.5] text-[#B4B4BE] sm:text-[16px]">{t("winSub")}</p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#16151c] p-[14px] sm:gap-4 sm:p-6">
                <div className="flex min-h-[30px] items-center justify-between gap-2">
                  <span className="text-[17px] font-semibold">{t("htmlLabel")}</span>
                  {html.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setHtml("");
                        setNomFichier("");
                      }}
                      className="cursor-pointer rounded-lg border border-white/[0.14] bg-transparent px-3 py-1.5 font-[inherit] text-[15px] text-[#B4B4BE]"
                    >
                      {t("clear")}
                    </button>
                  )}
                </div>

                {/* Zone de dépôt */}
                <div
                  data-drop=""
                  role="button"
                  tabIndex={0}
                  onClick={() => fichierRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fichierRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSurvol(true);
                  }}
                  onDragLeave={() => setSurvol(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSurvol(false);
                    lisFichier(e.dataTransfer.files?.[0]);
                  }}
                  className="box-border flex min-h-[52px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-[#0b0a0f] px-[14px] py-4 text-center sm:min-h-[88px]"
                  style={{ borderColor: survol ? "#8b5cf6" : "rgba(255,255,255,0.18)" }}
                >
                  <div className="text-[17px] leading-[1.35]">
                    {nomFichier ? `📄 ${nomFichier}` : t("dropTitle")}
                  </div>
                  <div className="mt-1 text-[15px] text-[#B4B4BE]">
                    {nomFichier ? t("dropSubDone") : t("dropSub")}
                  </div>
                  <input
                    ref={fichierRef}
                    type="file"
                    accept=".html,.htm,text/html"
                    className="hidden"
                    onChange={(e) => {
                      lisFichier(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* URL */}
                <div className="flex flex-col gap-2">
                  <label htmlFor={`${titreId}-url`} className="text-[17px] font-semibold">
                    {t("urlLabel")} <span className="font-normal text-[#B4B4BE]">{t("urlOptional")}</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`${titreId}-url`}
                      ref={urlRef}
                      data-dv-url=""
                      type="url"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setErreur(false);
                      }}
                      onFocus={() => setChamp("url")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lance("url");
                        }
                      }}
                      aria-invalid={erreur}
                      aria-describedby={erreur ? `${titreId}-err` : undefined}
                      placeholder={t("urlPlaceholder")}
                      className="box-border h-[52px] min-w-0 flex-1 rounded-xl border bg-[#0b0a0f] px-4 font-[inherit] text-[17px] text-[#F4F4F6] outline-none focus:border-[#8b5cf6]"
                      style={{ borderColor: erreur ? "#F87171" : "rgba(255,255,255,0.14)" }}
                    />
                    <button
                      type="button"
                      onClick={() => lance("url")}
                      className="box-border h-[52px] flex-none cursor-pointer rounded-xl border border-[#a78bfa]/35 bg-[#a78bfa]/[0.14] px-[18px] font-[inherit] text-[16px] font-semibold text-[#C4B5FD]"
                    >
                      {t("fetch")}
                    </button>
                  </div>
                  {erreur && (
                    <p id={`${titreId}-err`} role="alert" className="m-0 text-[16px] leading-[1.45] text-[#F87171]">
                      {t("urlError")}
                    </p>
                  )}
                  <p className="m-0 mt-0.5 text-[16px] leading-[1.45] text-[#D4D4DC]">{t("proNote")}</p>
                </div>

                <div className="border-t border-white/10" />

                <textarea
                  ref={htmlRef}
                  data-dv-code=""
                  data-dv-scroll=""
                  value={html}
                  onChange={(e) => {
                    setHtml(e.target.value);
                    setNomFichier("");
                    setErreur(false);
                  }}
                  onFocus={() => setChamp("html")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && html.trim()) {
                      e.preventDefault();
                      lance("html");
                    }
                  }}
                  rows={4}
                  aria-label={t("htmlLabel")}
                  placeholder={"<!DOCTYPE html>\n<html>\n  <body>\n  </body>\n</html>"}
                  className="dv-mono box-border w-full resize-none overflow-y-auto rounded-xl border border-white/[0.14] bg-[#0b0a0f] px-4 py-3.5 text-[15px] leading-[1.5] text-[#F4F4F6] outline-none focus:border-[#8b5cf6]"
                />
                {html.length > 0 && (
                  <div className="-mt-1.5 text-[15px] text-[#B4B4BE]">{t("chars", { n: html.length.toLocaleString() })}</div>
                )}

                <button
                  type="button"
                  onClick={() => lance()}
                  disabled={analyse}
                  className="flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border-0 bg-[#7c3aed] font-[inherit] text-[18px] font-semibold text-white hover:bg-[#8b5cf6] disabled:cursor-default"
                >
                  {analyse && (
                    <span
                      aria-hidden
                      className="box-border inline-block h-4 w-4 rounded-full border-2 border-white/35 border-t-white"
                      style={{ animation: "dv-spin .8s linear infinite" }}
                    />
                  )}
                  <span>{analyse ? t("running") : t("run")}</span>
                </button>
              </div>
            </div>

            {analyse && (
              <div
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 h-12 border-b-2 border-[#7c3aed]"
                style={{
                  top: -48,
                  background: "linear-gradient(to bottom, rgba(124,58,237,0), rgba(124,58,237,0.10))",
                  animation: "dv-scan 2.2s cubic-bezier(.45,0,.55,1) infinite",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Modale : l'audit n'est pas encore ouvert ─────────────────── */}
      {phase === "modale" && (
        <div
          onClick={ferme}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0E0D12]/55 p-0 backdrop-blur-[5px] sm:items-center sm:p-6"
          style={{ animation: "dv-fade .2s ease both" }}
        >
          <div
            ref={dlgRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titreId}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={toucheDlg}
            className="relative box-border max-h-full w-full overflow-auto rounded-t-[20px] bg-white px-[18px] pb-4 pt-[22px] text-[#111] outline-none sm:max-w-[520px] sm:rounded-[20px] sm:p-7 sm:pb-5"
            style={{
              boxShadow: "0 30px 80px -20px rgba(14,13,18,0.5)",
              animation: "dv-pop .2s ease both",
            }}
          >
            <button
              type="button"
              aria-label={t("notNow")}
              onClick={ferme}
              className="absolute right-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent font-[inherit] text-2xl leading-none text-[#52525B] hover:bg-[#F4F4F5]"
            >
              ×
            </button>

            <h3 id={titreId} className="m-0 pr-10 text-[22px] font-[650] leading-[1.2] tracking-[-0.02em]">
              {t("modalTitle")}
            </h3>

            <div className="mt-3.5 rounded-[10px] bg-[#F6F6F8] px-3.5 py-2.5">
              <div className="text-xs text-[#52525B]">{t("pageLabel")}</div>
              <div className="mt-0.5 truncate text-sm font-medium">{recap}</div>
            </div>

            <div className="mt-4 rounded-[14px] border border-[#7c3aed] px-4 py-3.5 sm:px-[18px] sm:py-4">
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[17px] font-bold">{t("planName")}</span>
                <span className="rounded-full bg-[#7c3aed] px-2.5 py-1 text-xs font-semibold text-white">{tPrix("recommended")}</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-[3px] tabular-nums">
                <span className="text-[40px] font-bold leading-[1.05] tracking-[-0.04em] text-[#7c3aed]">{t("price")}</span>
                <span className="text-base text-[#52525B]">{t("perMonth")}</span>
              </div>
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 tabular-nums sm:gap-2">
                {(["f1", "f2", "f3", "f4", "f5"] as const).map((k) => (
                  <li key={k} className="flex items-baseline gap-2.5 text-[15px] leading-[1.4]">
                    <span aria-hidden className="flex-none font-bold text-[#7c3aed]">✓</span>
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Désactivé tant que l'abonnement n'est pas ouvert. */}
            <button
              type="button"
              disabled
              title={tPlan("chooseTooltip", { email: SUPPORT_EMAIL })}
              className="mt-4 block w-full cursor-not-allowed rounded-[10px] border-0 bg-[#E4E4E7] px-4 py-[15px] text-center text-base font-semibold capitalize text-[#71717a]"
            >
              {tSoon("soon")}
            </button>
            <p className="m-0 mt-2.5 text-sm leading-[1.45] text-[#3F3F46]">{t("modalNote")}</p>

            <div className="mt-2.5 flex justify-center">
              <button
                type="button"
                onClick={ferme}
                className="cursor-pointer border-0 bg-none px-3 py-2 font-[inherit] text-sm text-[#52525B] underline underline-offset-[3px]"
              >
                {t("notNow")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
