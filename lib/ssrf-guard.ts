import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1", "::"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  if (a === 127) return true;                        // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (incl. métadonnées cloud 169.254.169.254)
  if (a === 0) return true;                          // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;               // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 (unique local)
  if (lower.startsWith("fe80")) return true;                        // fe80::/10 (link-local)
  if (lower.startsWith("::ffff:")) {
    // Adresse IPv4-mappée en IPv6 — on revérifie la partie IPv4.
    return isPrivateIPv4(lower.replace("::ffff:", ""));
  }
  return false;
}

// Normalise une URL saisie par l'utilisateur : espace de tête/fin retiré, slash final
// retiré, protocole https:// ajouté si absent. Même règle pour le Spy concurrent et
// l'audit IA "depuis une URL" — évite que les deux divergent avec le temps.
export function normalizeUrl(input: string): string {
  let url = input.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  return url;
}

// Valide le protocole puis résout le hostname pour bloquer tout ce qui pointe
// vers une IP privée/interne — empêche le serveur d'être utilisé comme proxy
// SSRF vers le réseau local ou les métadonnées cloud (AWS/GCP).
export async function isUrlAllowed(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  const literalFamily = isIP(hostname);
  if (literalFamily === 4) {
    return !isPrivateIPv4(hostname);
  }
  if (literalFamily === 6) {
    return !isPrivateIPv6(hostname);
  }

  try {
    const results = await lookup(hostname, { all: true });
    for (const { address, family } of results) {
      if (family === 4 && isPrivateIPv4(address)) return false;
      if (family === 6 && isPrivateIPv6(address)) return false;
    }
  } catch {
    return false;
  }

  return true;
}
