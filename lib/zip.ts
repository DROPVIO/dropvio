// Archive ZIP minimale (fichiers stockés sans compression), pour télécharger un site
// multi-pages en une fois : ouvert depuis le dossier décompressé (Safari décompresse les .zip
// téléchargés par défaut), index.html et ses liens relatifs (catalogue.html,
// collection-….html, pages légales) fonctionnent directement dans le navigateur.
// Format : en-têtes locaux + répertoire central + fin de répertoire (APPNOTE.TXT, méthode 0).

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(donnees: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < donnees.length; i++) crc = TABLE_CRC[(crc ^ donnees[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Date et heure au format MS-DOS des en-têtes ZIP.
function dateDos(d: Date): { heure: number; date: number } {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function creerZip(fichiers: { nom: string; contenu: string }[], maintenant = new Date()): Blob {
  const encodeur = new TextEncoder();
  const { heure, date } = dateDos(maintenant);
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let decalage = 0;

  for (const fichier of fichiers) {
    const nom = encodeur.encode(fichier.nom);
    const donnees = encodeur.encode(fichier.contenu);
    const crc = crc32(donnees);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // signature d'en-tête local
    local.setUint16(4, 20, true); // version minimale
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // méthode : stocké
    local.setUint16(10, heure, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, donnees.length, true);
    local.setUint32(22, donnees.length, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(local.buffer), nom, donnees);

    const entree = new DataView(new ArrayBuffer(46));
    entree.setUint32(0, 0x02014b50, true); // signature du répertoire central
    entree.setUint16(4, 20, true);
    entree.setUint16(6, 20, true);
    entree.setUint16(8, 0x0800, true);
    entree.setUint16(10, 0, true);
    entree.setUint16(12, heure, true);
    entree.setUint16(14, date, true);
    entree.setUint32(16, crc, true);
    entree.setUint32(20, donnees.length, true);
    entree.setUint32(24, donnees.length, true);
    entree.setUint16(28, nom.length, true);
    entree.setUint32(42, decalage, true); // position de l'en-tête local
    central.push(new Uint8Array(entree.buffer), nom);

    decalage += 30 + nom.length + donnees.length;
  }

  const tailleCentral = central.reduce((total, m) => total + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); // fin du répertoire central
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);

  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)] as BlobPart[], { type: "application/zip" });
}
