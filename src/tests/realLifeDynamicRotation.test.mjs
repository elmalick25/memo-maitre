import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES, getRotatingFallback } from '../lib/realLifeCatalog.js';

test('RealLife — Catalogue configuré avec requêtes variées et fallbacks enrichis', () => {
  const ielts = CATEGORIES.find(c => c.id === 'ielts');
  const tvseries = CATEGORIES.find(c => c.id === 'tvseries');

  assert.ok(ielts, 'Catégorie IELTS Speaking doit exister');
  assert.ok(tvseries, 'Catégorie Learn English With TV Series doit exister');

  // IELTS dispose d'une variété de requêtes
  assert.ok(Array.isArray(ielts.queries), 'ielts.queries doit être un tableau');
  assert.ok(ielts.queries.length >= 6, `ielts.queries doit contenir au moins 6 requêtes variées, reçu ${ielts.queries.length}`);

  // Toutes les requêtes sont distinctes
  const uniqueQueries = new Set(ielts.queries);
  assert.equal(uniqueQueries.size, ielts.queries.length, 'Toutes les requêtes de recherche IELTS doivent être uniques');

  // Fallback enrichi (> 12 vidéos pour supporter plusieurs lots sans doublon immédiat)
  assert.ok(Array.isArray(ielts.fallback), 'ielts.fallback doit être un tableau');
  assert.ok(ielts.fallback.length >= 12, `ielts.fallback doit contenir au moins 12 vidéos, reçu ${ielts.fallback.length}`);

  assert.ok(Array.isArray(tvseries.fallback), 'tvseries.fallback doit être un tableau');
  assert.ok(tvseries.fallback.length >= 12, `tvseries.fallback doit contenir au moins 12 vidéos, reçu ${tvseries.fallback.length}`);
});

test('RealLife — getRotatingFallback produit des vidéos différentes à chaque lot', () => {
  const ielts = CATEGORIES.find(c => c.id === 'ielts');
  const n = 6;

  const batch1 = getRotatingFallback(ielts, n, 1);
  const batch2 = getRotatingFallback(ielts, n, 2);
  const batch3 = getRotatingFallback(ielts, n, 3);

  assert.equal(batch1.length, n, 'Batch 1 doit avoir n vidéos');
  assert.equal(batch2.length, n, 'Batch 2 doit avoir n vidéos');
  assert.equal(batch3.length, n, 'Batch 3 doit avoir n vidéos');

  const ids1 = batch1.map(v => v.id);
  const ids2 = batch2.map(v => v.id);
  const ids3 = batch3.map(v => v.id);

  // Vérifier qu'aucun ID du lot 1 n'est dans le lot 2
  const overlap12 = ids1.filter(id => ids2.includes(id));
  assert.equal(overlap12.length, 0, 'Le lot 2 doit être entièrement différent du lot 1');

  // Vérifier qu'aucun ID du lot 2 n'est dans le lot 3
  const overlap23 = ids2.filter(id => ids3.includes(id));
  assert.equal(overlap23.length, 0, 'Le lot 3 doit être entièrement différent du lot 2');
});

test('RealLife — Vérification du code source pour la pagination et le renouvellement à chaque recherche', () => {
  const file = path.resolve('src/RealLife.jsx');
  const code = fs.readFileSync(file, 'utf8');

  // Gestion des tokens et numéros de pages
  assert.ok(code.includes('const [pageTokens, setPageTokens] = useState({});'), 'Doit stocker les jetons de pagination');
  assert.ok(code.includes('const [pageNumbers, setPageNumbers] = useState({});'), 'Doit stocker les numéros de lots');

  // Rotation des requêtes pour IELTS
  assert.ok(code.includes('const queriesList = Array.isArray(cat.queries)'), 'Doit lire le catalogue des requêtes variées');
  assert.ok(code.includes('const qIndex = (nextPage - 1) % queriesList.length;'), 'Doit faire une rotation des requêtes à chaque page');

  // Support de pageToken dans les appels YouTube
  assert.ok(code.includes('&pageToken='), 'Les appels API YouTube doivent passer le pageToken');

  // Support du paramètre page dans les fonctions publiques
  assert.ok(code.includes('async function searchWithoutKey(query, n, page = 1)'), 'searchWithoutKey doit accepter un paramètre page');

  // Bouton de recherche dynamique
  assert.ok(code.includes('Nouvelles vidéos (Lot'), 'Le bouton doit indiquer le renouvellement du lot');

  // Option création auto
  assert.ok(code.includes('autoCreateCards'), 'Doit avoir une option autoCreateCards');
  assert.ok(code.includes('toggleAutoCreateCards'), 'Doit avoir une fonction toggleAutoCreateCards');

  // Confinement du scroll
  assert.ok(code.includes('transcriptContainerRef'), 'Doit utiliser un ref pour le conteneur de sous-titres');
  assert.ok(code.includes('container.scrollTo'), 'Doit scroller uniquement dans le conteneur et non pas scrollIntoView global');
  assert.ok(!code.includes('lineRefs.current[currentIdx]?.scrollIntoView'), 'Ne doit plus utiliser scrollIntoView pour les sous-titres');

  // Aucun plafond de chunk
  assert.ok(!code.includes('chunks.length < 6'), 'Ne doit pas avoir de plafond chunks.length < 6');
});

test('RealLife — curateExpressions filtre les banalités et conserve les pépites B2-C2', async () => {
  const { curateExpressions } = await import('../lib/realLifeCuration.js');
  const mockCandidates = [
    { expr: 'how are you', meaning: 'comment ça va' },
    { expr: 'thank you', meaning: 'merci' },
    { expr: 'cut corners', meaning: 'prendre des raccourcis douteux' },
    { expr: 'hit the nail on the head', meaning: 'mettre le doigt dessus' },
    { expr: 'bite the bullet', meaning: 'avaler la pilule, serrer les dents' },
    { expr: 'as well', meaning: 'aussi' },
    { expr: 'burn the midnight oil', meaning: 'travailler tard la nuit' },
  ];

  const fakeClaude = async (sys, prompt) => {
    return JSON.stringify({
      selectedIds: [2, 3, 4, 6] // Seulement les idiomes, rejet de "how are you", "thank you", "as well"
    });
  };

  const curated = await curateExpressions(fakeClaude, mockCandidates, 'English Lesson');
  assert.equal(curated.length, 4, 'Doit conserver exactement 4 expressions');
  assert.equal(curated[0].expr, 'cut corners');
  assert.equal(curated[1].expr, 'hit the nail on the head');
  assert.equal(curated[2].expr, 'bite the bullet');
  assert.equal(curated[3].expr, 'burn the midnight oil');
});
