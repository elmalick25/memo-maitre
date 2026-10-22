// Couverture médiatique : combien de sites différents parlent de la même actu.
// Sert à (1) renforcer la note /10 et (2) trouver d'autres textes réels
// avant de recourir à l'IA pour le texte « Complet ».

const STOP = new Set(("the a an of to in on for and or with by from at is are was be as it its this that new how why what "
  + "le la les un une des de du d l et ou en au aux pour par sur dans avec est sont ce cette qui que plus son sa ses vos nos "
  + "show ask hn afficher").split(/\s+/));

export function titleTokens(item) {
  const t = `${item?.title || ""} ${item?.titleFr || ""}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  return new Set(t.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

// Renvoie les articles d'AUTRES sources qui traitent du même sujet.
export function findRelatedCoverage(item, all, { threshold = 0.5 } = {}) {
  if (!item || !Array.isArray(all)) return [];
  const base = titleTokens(item);
  if (base.size < 2) return [];
  const seenSources = new Set([item.sourceName || item.source]);
  const out = [];
  for (const other of all) {
    if (!other || other.id === item.id) continue;
    const src = other.sourceName || other.source;
    if (seenSources.has(src)) continue;
    const tok = titleTokens(other);
    let inter = 0;
    for (const w of base) if (tok.has(w)) inter++;
    if (inter >= 2 && similarity(base, tok) >= threshold) {
      seenSources.add(src);
      out.push(other);
    }
  }
  return out;
}

// Note affichée : pertinence de base + bonus de couverture (2 pts par site en plus).
export function coverageScore(baseScore, sourceCount) {
  const base = Math.max(0, Math.round(baseScore || 0));
  const extra = Math.max(0, (sourceCount || 1) - 1) * 2;
  return Math.min(10, base + extra);
}
