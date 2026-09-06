// Limite de troncature du HTML envoyé à l'audit IA — partagée entre l'affichage client
// (app/audit/page.tsx) et les deux routes qui appellent Claude (app/api/audit-site/route.ts
// pour le scoring, app/api/audit-site/html/route.ts pour la correction), pour que ce que
// l'UI annonce corresponde toujours exactement à ce qui est réellement envoyé.
//
// Portée à 100 000 (depuis 20 000) après mesure réelle : à ce plafond, la route de
// correction a besoin de max_tokens: 24000 pour compléter naturellement (testé sur une
// vraie page à 100 000 caractères — stop_reason: max_tokens et sortie tronquée à 16000,
// stop_reason: end_turn et sortie complète à 20 480/24000 tokens). Le scoring
// (max_tokens: 8192) n'a pas eu besoin d'être remonté : sa sortie ne grandit pas avec la
// taille de l'entrée (mesuré entre 20k et 200k caractères plus tôt ce soir, ~3300-4244
// tokens de sortie dans tous les cas), contrairement à la correction qui doit reproduire
// une bonne partie du HTML d'origine.
export const AUDIT_HTML_MAX_CHARS = 100_000;
