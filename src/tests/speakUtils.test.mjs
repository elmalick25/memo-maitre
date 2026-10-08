import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEnglishSpeechText, detectLanguage, getBestVoice } from '../lib/speakUtils.js';

test('extractEnglishSpeechText — Nettoie les titres d\'expression avec drapeaux et markdown', () => {
  const input = '# 🇬🇧 pick up where we left off.';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'pick up where we left off.');
});

test('extractEnglishSpeechText — Separe la phrase anglaise de la traduction française (->)', () => {
  const input = '`Can you hear me clearly on this Zoom link?` -> *M\'entends-tu clairement sur ce lien Zoom ?*';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'Can you hear me clearly on this Zoom link?');
});

test('extractEnglishSpeechText — Separe la phrase anglaise de la traduction française (↳)', () => {
  const input = '`Let\'s pick up where we left off.` ↳ *Reprenons là où on s\'était arrêtés.*';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'Let\'s pick up where we left off.');
});

test('extractEnglishSpeechText — Nettoie les prefixes de contexte', () => {
  const input = 'Tech/Workflow : `Can you hear me?` ↳ *M\'entends-tu ?*';
  const result = extractEnglishSpeechText(input);
  assert.equal(result, 'Can you hear me?');
});

test('extractEnglishSpeechText — Isole la réplique anglaise dans un dialogue A/B', () => {
  const lineA = '* **A :** `Can we play football today?` ↳ *Pouvons-nous jouer au foot ?*';
  assert.equal(extractEnglishSpeechText(lineA), 'Can we play football today?');

  const lineB = '* **B :** No, look outside! It\'s raining cats and dogs. ↳ Regarde dehors ! Il pleut des cordes.';
  assert.equal(extractEnglishSpeechText(lineB), "No, look outside! It's raining cats and dogs.");
});

test('extractEnglishSpeechText — REJETTE STRICTEMENT les sections explicatives en français (0 son français)', () => {
  assert.equal(extractEnglishSpeechText('📖 **Vrai sens :** Il pleut des cordes'), '');
  assert.equal(extractEnglishSpeechText('Traduction : Je veux que tu y croies'), '');
  assert.equal(extractEnglishSpeechText('⚠️ **Attention au piège :** Calquer le présent français'), '');
  assert.equal(extractEnglishSpeechText('🧩 **La Règle Réflexe :** Want + someone + TO + verb'), '');
  assert.equal(extractEnglishSpeechText('↳ *Pouvons-nous jouer au foot aujourd\'hui ?*'), '');
});

test('extractEnglishSpeechText — Isole la correction Live Nova', () => {
  const novaLine = '* 🟢 **En réalité, on dit :** "Can you hear me?" ✅';
  assert.equal(extractEnglishSpeechText(novaLine), 'Can you hear me?');
});

test('detectLanguage — Détecte le français pour les textes avec accents ou mots français', () => {
  assert.equal(detectLanguage('Piège classique : vouloir utiliser un pattern sans savoir le problème.'), 'fr-FR');
  assert.equal(detectLanguage('Attention à ne pas calquer le français'), 'fr-FR');
});

test('detectLanguage — Détecte l\'anglais pour les phrases idiomatiques anglaises', () => {
  assert.equal(detectLanguage('Pick up where we left off'), 'en-US');
  assert.equal(detectLanguage('Can you hear me clearly on this link?'), 'en-US');
});

test('getBestVoice — Privilégie strictement les voix locales (localService: true) en mode hors-ligne', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Google UK English Female', lang: 'en-GB', localService: false },
    { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
    { name: 'Microsoft Hortense - French', lang: 'fr-FR', localService: true },
  ];

  // En mode hors ligne, la voix Google (réseau) doit être évitée au profit de la voix locale
  const offlineVoiceEn = getBestVoice(voices, 'en-US', true);
  assert.equal(offlineVoiceEn.name, 'Microsoft David - English (United States)');
  assert.equal(offlineVoiceEn.localService, true);

  const offlineVoiceFr = getBestVoice(voices, 'fr-FR', true);
  assert.equal(offlineVoiceFr.name, 'Microsoft Hortense - French');
  assert.equal(offlineVoiceFr.localService, true);
});


