export const DOCUMENT_CARD_FORMAT = Object.freeze({ id: 'SOURCE', label: 'Fiches fidèles au document' });
export const DOCUMENT_CARD_RULES = `FORMAT UNIQUE — QUESTION / RÉPONSE FIDÈLE AU DOCUMENT :
Chaque fiche teste une seule information explicitement présente dans la source.
La réponse reprend le passage pertinent avec le vocabulaire, les nombres et les conditions exacts.
Ne crée ni piège, ni exemple, ni moyen mnémotechnique absent du document. N'invente aucune sortie de code.
Les formules, le code complet et les tableaux nécessaires doivent être conservés, sans limite arbitraire de mots.
Champ source_excerpt obligatoire : citation exacte du passage qui justifie la réponse.
Une question ne doit pas dévoiler sa réponse. Plusieurs notions distinctes donnent plusieurs fiches.
Si le document ne permet pas de répondre, ne génère pas la fiche.`;
const text = value => typeof value === 'string' ? value.trim() : '';
export function normalizeLabCard(raw, { date, now, createId }) {
  if (!raw || typeof raw !== 'object') return null;
  const front = text(raw.front || raw.question);
  const back = text(raw.back || raw.answer);
  if (!front || !back) return null;
  const sourceNote = text(raw.source_excerpt) ? `Source${text(raw.sourceDoc) ? ` — ${text(raw.sourceDoc)}` : ''} :\n${text(raw.source_excerpt)}` : '';
  // example is already persisted by WatermelonDB and Firebase, unlike transient Lab metadata.
  const example = [text(raw.example || raw.hint), sourceNote].filter(Boolean).join('\n\n');
  return {
    id: text(raw.id) || createId(), front, back,
    example, category: text(raw.category) || 'Général', type: text(raw.type) || 'qa',
    imageUrl: text(raw.imageUrl || raw.image) || null, audioId: text(raw.audioId) || null, audioUrl: text(raw.audioUrl) || null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter(tag => typeof tag === 'string') : [],
    bloomLevel: text(raw.bloomLevel) || 'Understand', keyword: text(raw.keyword),
    source_excerpt: text(raw.source_excerpt), sourceDoc: text(raw.sourceDoc), source: text(raw.source),
    layers: Array.isArray(raw.layers) ? raw.layers : [],
    level: 0, nextReview: date, createdAt: now, updatedAt: now, easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [],
  };
}
export function selectDocumentCards(cards, indexes) {
  return cards.filter((_, index) => indexes.has(index));
}
export async function saveLabCards(onAddCards, cards, options = {}) {
  if (typeof onAddCards !== 'function') throw new Error('Enregistrement indisponible. Les fiches restent dans le Lab.');
  if (!cards.length) throw new Error('Aucune fiche sélectionnée.');
  const result = await onAddCards(cards, options);
  if (!result || !Number.isInteger(result.added) || !Number.isInteger(result.skipped)) throw new Error('Enregistrement non confirmé. Les fiches restent dans le Lab.');
  return result;
}
export function documentCardSignature(front) {
  return String(front || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
export function buildSourceContext(concepts) {
  return [...new Set(concepts.map(c => c.sourceText).filter(Boolean))].join('\n\n');
}
export function validateDocumentCard(card, source) {
  if (!text(card?.front) || !text(card?.back)) return false;
  const excerpt = text(card.source_excerpt);
  return Boolean(excerpt) && source.replace(/\s+/g, ' ').includes(excerpt.replace(/\s+/g, ' '));
}
