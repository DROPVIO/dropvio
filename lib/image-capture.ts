import sharp from "sharp";

// Lecture des captures d'écran envoyées par le Site Builder (inspiration, avis clients) :
// format identifié par les octets (jamais par l'extension ni le type MIME déclaré), puis
// conversion en JPEG redimensionné avant tout envoi à Claude.
const COTE_MAX = 1600;
const QUALITE_JPEG = 85;

export type FormatImage = "jpeg" | "png" | "webp" | "gif" | "heic" | "avif" | "bmp" | "tiff";

// Signature de fichier (magic bytes). HEIC/HEIF et AVIF partagent le conteneur ISO BMFF :
// on lit la marque principale et les marques compatibles de la boîte ftyp.
export function detecterFormat(o: Buffer): FormatImage | null {
  const ascii = (debut: number, fin: number) => o.subarray(debut, fin).toString("latin1");
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "jpeg";
  if (o.length >= 8 && o.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (o.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (o.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (o.length >= 4 && (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*")) return "tiff";
  if (o.length >= 2 && ascii(0, 2) === "BM") return "bmp";
  if (o.length >= 12 && ascii(4, 8) === "ftyp") {
    const tailleBoite = Math.min(o.readUInt32BE(0), o.length);
    const marques = [ascii(8, 12)];
    for (let i = 16; i + 4 <= tailleBoite; i += 4) marques.push(ascii(i, i + 4));
    if (marques.some((m) => m === "avif" || m === "avis")) return "avif";
    if (marques.some((m) => ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(m))) return "heic";
  }
  return null;
}

// JPEG, plus grand côté ≤ 1600 px, qualité 85, orientation EXIF appliquée, transparence
// aplatie sur blanc, métadonnées retirées (comportement par défaut de sharp). Première image
// seulement pour un GIF animé ou un TIFF multipage. Lève si le format ne peut pas être décodé
// (HEIC et BMP avec le sharp installé).
export async function convertirEnJpeg(o: Buffer): Promise<Buffer> {
  return sharp(o)
    .rotate()
    .resize({ width: COTE_MAX, height: COTE_MAX, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: QUALITE_JPEG })
    .toBuffer();
}
