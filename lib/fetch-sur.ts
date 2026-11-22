// fetch() vers une URL fournie par l'utilisateur, protégé contre le SSRF et le DNS rebinding.
//
// 1. Seuls http et https sont acceptés.
// 2. Le nom est résolu UNE seule fois (toutes les adresses) ; la requête est refusée si une seule
//    d'entre elles est interdite (privée, loopback, link-local, multicast, 0.0.0.0/8,
//    100.64.0.0/10, métadonnées cloud, IPv6 ULA ou link-local, IPv4 interdite mappée en IPv6).
// 3. La connexion se fait sur l'adresse validée : l'Agent undici reçoit un `lookup` qui la
//    renvoie toujours, sans seconde résolution. Le nom d'hôte d'origine reste dans l'URL, donc
//    dans l'en-tête Host, le SNI et la vérification du certificat TLS.
//    Attention : le fetch d'undici ignore l'option `agent` de Node ; c'est `dispatcher` qui compte.
// 4. Redirections suivies à la main (redirect: "manual"), chaque saut repasse par 1 à 3,
//    5 sauts au maximum.
// 5. 10 s au total, réponse de 5 Mo au plus.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

export const FETCH_SUR_TIMEOUT_MS = 10_000;
export const FETCH_SUR_OCTETS_MAX = 5 * 1024 * 1024;
export const FETCH_SUR_SAUTS_MAX = 5;

export class FetchSurRefuse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchSurRefuse";
  }
}

export type AdresseResolue = { address: string; family: 4 | 6 };
export type Resolveur = (hote: string) => Promise<AdresseResolue[]>;
/** Envoie une requête vers `url` en se connectant à `ip`. Remplaçable pour les tests. */
export type Requeteur = (url: URL, ip: AdresseResolue, init: RequestInit, signal: AbortSignal) => Promise<Response>;

const resoudreParDns: Resolveur = async (hote) => {
  const resultats = await dnsLookup(hote, { all: true, verbatim: true });
  return resultats.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

// ── Adresses interdites ──────────────────────────────────────────────────────────────────

function octetsIPv4(ip: string): number[] | null {
  const parties = ip.split(".");
  if (parties.length !== 4) return null;
  const octets = parties.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

export function ipv4Interdite(ip: string): boolean {
  const o = octetsIPv4(ip);
  if (!o) return true;
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) || // link-local, dont 169.254.169.254 (métadonnées cloud)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0 && o[2] === 0) || // 192.0.0.0/24 (IETF)
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (bancs de test)
    a >= 224 // multicast (224/4) et réservé (240/4, 255.255.255.255)
  );
}

/** 8 groupes de 16 bits d'une IPv6 (forme :: et IPv4 finale acceptées), ou null. */
function groupesIPv6(ip: string): number[] | null {
  let texte = ip.toLowerCase().split("%")[0];
  const v4 = texte.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = octetsIPv4(v4[2]);
    if (!o) return null;
    texte = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const moities = texte.split("::");
  if (moities.length > 2) return null;
  const gauche = moities[0] ? moities[0].split(":") : [];
  const droite = moities.length === 2 && moities[1] ? moities[1].split(":") : [];
  const manquants = 8 - gauche.length - droite.length;
  if (moities.length === 1 ? manquants !== 0 : manquants < 1) return null;
  const tous = [...gauche, ...Array(moities.length === 2 ? manquants : 0).fill("0"), ...droite];
  const groupes = tous.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groupes.length === 8 && groupes.every((g) => !Number.isNaN(g)) ? groupes : null;
}

export function ipv6Interdite(ip: string): boolean {
  const g = groupesIPv6(ip);
  if (!g) return true;
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(8)) return true; // ::
  if (zeros(7) && g[7] === 1) return true; // ::1
  // IPv4 mappée (::ffff:a.b.c.d) ou compatible (::a.b.c.d) : on vérifie l'IPv4.
  if (zeros(5) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return ipv4Interdite(v4);
  }
  // NAT64 (64:ff9b::/96) : l'IPv4 embarquée peut être interne.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return ipv4Interdite(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  return false;
}

export function ipInterdite(ip: string): boolean {
  const famille = isIP(ip);
  if (famille === 4) return ipv4Interdite(ip);
  if (famille === 6) return ipv6Interdite(ip);
  return true;
}

// ── Résolution et requête ────────────────────────────────────────────────────────────────

async function adresseValidee(url: URL, resolveur: Resolveur): Promise<AdresseResolue> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchSurRefuse("Protocole non autorisé");
  const hote = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hote || hote === "localhost" || hote.endsWith(".localhost")) throw new FetchSurRefuse("Hôte non autorisé");

  const famille = isIP(hote);
  const adresses: AdresseResolue[] = famille ? [{ address: hote, family: famille === 6 ? 6 : 4 }] : await resolveur(hote).catch(() => []);
  if (adresses.length === 0) throw new FetchSurRefuse("Nom introuvable");
  if (adresses.some((a) => ipInterdite(a.address))) throw new FetchSurRefuse("Adresse non autorisée");
  return adresses[0];
}

const requeteParUndici: Requeteur = async (url, ip, init, signal) => {
  const agent = new Agent({
    connect: {
      // Toujours l'adresse validée : aucune seconde résolution, donc pas de DNS rebinding.
      lookup: (_hote, options, rappel) => {
        if ((options as { all?: boolean }).all) rappel(null, [{ address: ip.address, family: ip.family }]);
        else rappel(null, ip.address, ip.family);
      },
    },
  });
  try {
    const reponse = await undiciFetch(url, { ...(init as object), redirect: "manual", dispatcher: agent, signal } as Parameters<typeof undiciFetch>[1]);
    const corps = await lireAvecLimite(reponse.body as ReadableStream<Uint8Array> | null, reponse.headers.get("content-length"), signal);
    return new Response(corps, { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers as unknown as HeadersInit });
  } finally {
    await agent.close().catch(() => {});
  }
};

async function lireAvecLimite(corps: ReadableStream<Uint8Array> | null, longueur: string | null, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer> | null> {
  if (longueur && Number(longueur) > FETCH_SUR_OCTETS_MAX) throw new FetchSurRefuse("Réponse trop volumineuse");
  if (!corps) return null;
  const lecteur = corps.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  while (true) {
    if (signal.aborted) throw new FetchSurRefuse("Délai dépassé");
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > FETCH_SUR_OCTETS_MAX) {
      await lecteur.cancel().catch(() => {});
      throw new FetchSurRefuse("Réponse trop volumineuse");
    }
    morceaux.push(value);
  }
  const resultat = new Uint8Array(new ArrayBuffer(total));
  let position = 0;
  for (const m of morceaux) {
    resultat.set(m, position);
    position += m.byteLength;
  }
  return resultat;
}

/** Comme fetch(), mais refuse toute destination interne (voir l'en-tête du fichier). Lève
 *  FetchSurRefuse quand une étape est refusée. `options` sert aux tests. */
export async function fetchSur(
  url: string | URL,
  init: RequestInit = {},
  options: { resolveur?: Resolveur; requeteur?: Requeteur } = {}
): Promise<Response> {
  const resolveur = options.resolveur ?? resoudreParDns;
  const requeteur = options.requeteur ?? requeteParUndici;
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(FETCH_SUR_TIMEOUT_MS)]) : AbortSignal.timeout(FETCH_SUR_TIMEOUT_MS);

  let courante = new URL(url);
  for (let saut = 0; saut <= FETCH_SUR_SAUTS_MAX; saut++) {
    const ip = await adresseValidee(courante, resolveur);
    const reponse = await requeteur(courante, ip, init, signal);
    const destination = reponse.status >= 300 && reponse.status < 400 ? reponse.headers.get("location") : null;
    if (!destination) return reponse;
    courante = new URL(destination, courante);
  }
  throw new FetchSurRefuse("Trop de redirections");
}
