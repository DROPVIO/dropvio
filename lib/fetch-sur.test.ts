import test from "node:test";
import assert from "node:assert/strict";
import { FetchSurRefuse, fetchSur, ipInterdite, type AdresseResolue, type Requeteur, type Resolveur } from "./fetch-sur";

// Aucun accès réseau : la résolution DNS et la requête sont remplacées.
const PUBLIQUE: AdresseResolue = { address: "93.184.216.34", family: 4 };
const resolveur = (table: Record<string, AdresseResolue[]>): Resolveur => async (hote) => table[hote] ?? [];
const repondre = (status: number, entetes: Record<string, string> = {}): Requeteur => async () => new Response(status === 200 ? "ok" : null, { status, headers: entetes });

async function refuse(url: string, options: Parameters<typeof fetchSur>[2] = {}) {
  await assert.rejects(fetchSur(url, {}, { requeteur: repondre(200), ...options }), FetchSurRefuse, url);
}

test("IP littérales interdites refusées", async () => {
  for (const url of ["http://127.0.0.1/", "http://10.1.2.3/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://0.0.0.0/", "http://100.64.0.1/", "http://[fe80::1]/", "http://[fd00::1]/"]) {
    await refuse(url);
  }
});

test("localhost refusé", async () => {
  await refuse("http://localhost:3000/");
  await refuse("http://api.localhost/");
});

test("protocoles autres que http et https refusés", async () => {
  await refuse("file:///etc/passwd");
  await refuse("ftp://example.com/");
});

test("domaine qui résout vers une IP privée refusé", async () => {
  await refuse("https://interne.example/", { resolveur: resolveur({ "interne.example": [{ address: "192.168.1.10", family: 4 }] }) });
});

test("domaine dont UNE des IP est privée refusé", async () => {
  await refuse("https://mixte.example/", { resolveur: resolveur({ "mixte.example": [PUBLIQUE, { address: "10.0.0.5", family: 4 }] }) });
});

test("redirection vers 127.0.0.1 refusée", async () => {
  await assert.rejects(
    fetchSur("https://public.example/", {}, { resolveur: resolveur({ "public.example": [PUBLIQUE] }), requeteur: repondre(302, { location: "http://127.0.0.1/admin" }) }),
    FetchSurRefuse
  );
});

test("trop de redirections refusé", async () => {
  await assert.rejects(
    fetchSur("https://public.example/", {}, { resolveur: resolveur({ "public.example": [PUBLIQUE] }), requeteur: repondre(302, { location: "https://public.example/encore" }) }),
    FetchSurRefuse
  );
});

test("IP publique acceptée, et la requête part vers l'adresse validée", async () => {
  let ipUtilisee: string | null = null;
  const reponse = await fetchSur("https://public.example/page", {}, {
    resolveur: resolveur({ "public.example": [PUBLIQUE] }),
    requeteur: async (url, ip) => {
      ipUtilisee = ip.address;
      assert.equal(url.hostname, "public.example");
      return new Response("bonjour", { status: 200 });
    },
  });
  assert.equal(reponse.status, 200);
  assert.equal(await reponse.text(), "bonjour");
  assert.equal(ipUtilisee, PUBLIQUE.address);
});

test("classement des adresses", () => {
  assert.equal(ipInterdite("8.8.8.8"), false);
  assert.equal(ipInterdite("2606:4700:4700::1111"), false);
  assert.equal(ipInterdite("172.20.0.1"), true);
  assert.equal(ipInterdite("224.0.0.1"), true);
  assert.equal(ipInterdite("::ffff:10.0.0.1"), true);
  assert.equal(ipInterdite("::ffff:8.8.8.8"), false);
});
