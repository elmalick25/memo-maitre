// 🧽 Réparation du texte des actus : accents mal décodés (« Ã© », « bo�te ») et
// entités HTML encodées plusieurs fois (« &amp;amp; », « &amp;#39; »).

const MOJIBAKE_RX = /[\u00C2-\u00F4][\u0080-\u00BF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;

/** Décode un texte UTF-8 qui a été lu comme Latin-1/Windows-1252 (« dÃ©jÃ  » → « déjà »). */
export function repairMojibake(text) {
  if (!text || typeof text !== "string" || !MOJIBAKE_RX.test(text)) return text || "";
  const cp1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
  // On répare segment par segment pour ne pas casser les caractères déjà corrects.
  // « à » encodé C3 A0 : l'espace insécable est souvent devenu un espace normal.
  text = text.replace(/Ã[\u00A0 ](?=\s)/g, "à").replace(/Ã\u00A0/g, "à");
  return text.replace(/(?:[\u00C2-\u00F4][\u0080-\u00BF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]{1,3})+/g, (seg) => {
    try {
      const bytes = [];
      for (const ch of seg) {
        const c = cp1252[ch] ?? ch.charCodeAt(0);
        if (c > 0xff) return seg;
        bytes.push(c);
      }
      const out = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
      return out;
    } catch { return seg; }
  });
}

/** Décode les entités HTML jusqu'à disparition (gère les doubles/triples encodages). */
export function decodeEntitiesDeep(text, decodeOnce) {
  let s = text || "";
  for (let i = 0; i < 4 && /&(?:[a-z]{2,8}|#\d{2,6}|#x[0-9a-f]{2,5});/i.test(s); i++) {
    const next = decodeOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}

// Mots français fréquents abîmés par la perte d'un accent (« bo?te », « bote », « d?di?e »).
const DAMAGED_WORDS = [
  [/\bbo[\uFFFD?]?te\b/g, "boîte"], [/\bbo[\uFFFD?]?tes\b/g, "boîtes"],
  [/\bd[\uFFFD?]di[\uFFFD?]e\b/g, "dédiée"], [/\bd[\uFFFD?]di[\uFFFD?]\b/g, "dédié"],
  [/\bd[\uFFFD?]j[\uFFFD?]\b/g, "déjà"], [/\b[\uFFFD]t[\uFFFD]\b/g, "été"],
  [/\bfran[\uFFFD]ais/g, "français"], [/\bfran[\uFFFD]aise/g, "française"],
  [/\bsoci[\uFFFD]t[\uFFFD]\b/g, "société"], [/\bs[\uFFFD]curit[\uFFFD]\b/g, "sécurité"],
  [/\bd[\uFFFD]veloppe/g, "développe"], [/\bg[\uFFFD]n[\uFFFD]r/g, "génér"],
  [/\bmod[\uFFFD]le/g, "modèle"], [/\bpremi[\uFFFD]re/g, "première"],
  [/\bm[\uFFFD]me\b/g, "même"], [/\bo[\uFFFD]\b/g, "où"], [/\bapr[\uFFFD]s\b/g, "après"],
  [/\btr[\uFFFD]s\b/g, "très"], [/\bd[\uFFFD]but/g, "début"], [/\bann[\uFFFD]e/g, "année"],
  [/\bdonn[\uFFFD]es\b/g, "données"], [/\bc[\uFFFD]t[\uFFFD]\b/g, "côté"],
  [/\b[\uFFFD]tats-Unis\b/g, "États-Unis"], [/\bint[\uFFFD]gr/g, "intégr"],
];

export function repairDamagedWords(text) {
  if (!text || typeof text !== "string") return text || "";
  let s = text;
  for (const [rx, rep] of DAMAGED_WORDS) s = s.replace(rx, rep);
  return s;
}

/** Nettoyage complet : accents + entités + mots abîmés. */
export function repairNewsText(text, decodeOnce) {
  let s = repairMojibake(text);
  if (decodeOnce) s = decodeEntitiesDeep(s, decodeOnce);
  s = repairMojibake(s);
  return repairDamagedWords(s);
}
