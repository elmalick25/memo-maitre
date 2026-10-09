import test from 'node:test';
import assert from 'node:assert/strict';
import { getModuleCards, isAvailableModuleName, mergeModuleData } from '../lib/moduleActions.js';
import { normalizeLabCard, selectDocumentCards, saveLabCards, documentCardSignature, buildSourceContext, validateDocumentCard, DOCUMENT_CARD_FORMAT } from '../lib/lab/cardIntake.js';
import { firebaseDocToRaw, rawToCamelCase, recordToFirestore, applyRawToExpression } from '../lib/db/expressionMapper.js';
const defaults = { date: '2026-10-08', now: '2026-10-08T15:00:00Z', createId: () => 'new-id' };
test('Modules: compteur et révision incluent les mêmes fiches dues, même maîtrisées, hors pause', () => {
 const cards = [{ category: 'A', level: 7, nextReview: '2026-10-07' }, { category: 'A', paused: true, nextReview: '2026-10-07' }, { category: 'B', nextReview: '2026-10-07' }];
 assert.deepEqual(getModuleCards(cards, 'A', (review, date) => review <= date, '2026-10-08').due, [cards[0]]);
});
test('Modules: noms vides et doublons insensibles à la casse refusés', () => {
 assert.equal(isAvailableModuleName([{ name: 'English' }], ' english '), false);
 assert.equal(isAvailableModuleName([], '  '), false);
 assert.equal(isAvailableModuleName([{ name: 'English' }], 'Biologie'), true);
});
test('Modules: fusion conserve toutes les fiches et leurs médias', () => {
 const cards = [{ id: '1', category: 'A', imageUrl: 'image' }, { id: '2', category: 'B' }];
 const merged = mergeModuleData([{ name: 'A' }, { name: 'B' }], cards, 'A', 'B');
 assert.deepEqual(merged.categories, [{ name: 'B' }]);
 assert.deepEqual(merged.expressions, [{ ...cards[0], category: 'B' }, cards[1]]);
 assert.equal(cards[0].category, 'A');
 assert.throws(() => mergeModuleData([{ name: 'A' }], cards, 'A', 'A'));
});
test('Lab: photos, audio et source conservés par la normalisation', () => {
 const card = normalizeLabCard({ front: ' Q ', back: ' R ', imageUrl: 'data:image/png;base64,AA', audioId: 'audio-123', source_excerpt: 'R', sourceDoc: 'Cours', tags: ['cours'] }, defaults);
 assert.equal(card.imageUrl, 'data:image/png;base64,AA'); assert.equal(card.audioId, 'audio-123'); assert.equal(card.source_excerpt, 'R'); assert.deepEqual(card.tags, ['cours']); assert.equal(card.level, 0); assert.equal(card.nextReview, '2026-10-08');
});
test('Lab: aucune fiche vide ne peut être enregistrée', () => {
 assert.equal(normalizeLabCard({ front: 'Q', back: ' ' }, defaults), null);
 assert.equal(normalizeLabCard({ front: {}, back: 'R' }, defaults), null);
});
test('PDF: désélectionner toutes les fiches n’en ajoute aucune', () => {
 const cards = [{ front: '1' }, { front: '2' }];
 assert.deepEqual(selectDocumentCards(cards, new Set()), []);
 assert.deepEqual(selectDocumentCards(cards, new Set([1])), [cards[1]]);
});
test('Lab: succès interdit sans confirmation ou en cas d’échec', async () => {
 await assert.rejects(saveLabCards(undefined, [{ front: 'Q' }]));
 await assert.rejects(saveLabCards(() => undefined, [{ front: 'Q' }]));
 await assert.rejects(saveLabCards(async () => { throw new Error('Échec'); }, [{ front: 'Q' }]));
 assert.deepEqual(await saveLabCards(async () => ({ added: 1, skipped: 0 }), [{}]), { added: 1, skipped: 0 });
});
test('PDF: seul le format source et une citation présente sont acceptés', () => {
 assert.equal(DOCUMENT_CARD_FORMAT.id, 'SOURCE');
 assert.equal(validateDocumentCard({ front: 'Définition ?', back: 'réponse', source_excerpt: 'la récursivité' }, 'La fonction utilise la récursivité.'), true);
 assert.equal(validateDocumentCard({ front: 'Q', back: 'R', source_excerpt: 'invention' }, 'cours'), false);
 assert.equal(validateDocumentCard({ front: 'Q', back: 'R' }, 'cours'), false);
});
test('PDF: les notions en fin de document gardent leur passage sans troncature au début', () => {
 const tail = 'z'.repeat(17000) + 'NOTION FINALE';
 assert.equal(buildSourceContext([{ sourceText: tail }]), tail);
});
test('PDF: des questions longues partageant leur début restent distinctes', () => {
 assert.notEqual(documentCardSignature('Comment fonctionne ce mécanisme particulier pour A ?'), documentCardSignature('Comment fonctionne ce mécanisme particulier pour B ?'));
});
test('Audio: référence préservée sur toutes les conversions de synchronisation', () => {
 const raw = firebaseDocToRaw({ id: '1', front: 'Q', back: 'R', audioId: 'audio-123' });
 assert.equal(raw.audio_id, 'audio-123'); assert.equal(rawToCamelCase(raw).audioId, 'audio-123');
 const exp = { _raw: {} }; applyRawToExpression(exp, raw);
 assert.equal(exp.audioId, 'audio-123'); assert.equal(recordToFirestore(exp).audioId, 'audio-123');
});
