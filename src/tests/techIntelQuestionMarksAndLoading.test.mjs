import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripMarkdownAndAsterisks, repairFrenchElisions, normalizeNewsPreview } from '../lib/newsTextPresentation.js';

test('repairFrenchElisions — répare les points d\'interrogation et caractères corrompus remplaçant les apostrophes françaises', () => {
  // Cas réels observés dans les flux et traductions :
  // "Bulle de l?IA", "l?utilisateur touche l?écran", "c?est une réécriture", "d?un", "qu?il", "aujourd?hui"
  const corrupted1 = "Bulle de l?IA : le FMI alerte sur l?économie et d?un risque qu?il c?est aujourd?hui";
  const repaired1 = repairFrenchElisions(corrupted1);
  assert.equal(repaired1, "Bulle de l'IA : le FMI alerte sur l'économie et d'un risque qu'il c'est aujourd'hui");

  // Cas avec le caractère de remplacement Unicode \uFFFD (losange avec ?)
  const corrupted2 = "Bulle de l\uFFFDIA : l\uFFFDutilisateur constate que c\uFFFDest le d\uFFFDpart";
  const repaired2 = repairFrenchElisions(corrupted2);
  assert.equal(repaired2, "Bulle de l'IA : l'utilisateur constate que c'est le d'part");

  // Cas avec espaces autour du point d'interrogation ou entités
  const corrupted3 = "menaces d ? extinction pour l ? humanite qu ? il n ? a pas";
  const repaired3 = repairFrenchElisions(corrupted3);
  assert.equal(repaired3, "menaces d'extinction pour l'humanite qu'il n'a pas");

  // Cas des guillemets corrompus avec des points d'interrogation : "? station blanche ?" -> "« station blanche »"
  const corrupted4 = "une ? station blanche ? : on insère une clé";
  const repaired4 = stripMarkdownAndAsterisks(corrupted4);
  assert.ok(repaired4.includes("« station blanche »"), `Devrait contenir « station blanche », reçu: "${repaired4}"`);
});

test('stripMarkdownAndAsterisks — décode exhaustivement les entités HTML et purge les caractères de remplacement', () => {
  const htmlSample = "L&#8217;IA et l&apos;architecture &#8220;cloud&#8221; d&#39;entreprise";
  const cleaned = stripMarkdownAndAsterisks(htmlSample);
  assert.equal(cleaned, "L'IA et l'architecture “cloud” d'entreprise");

  // Nettoyage de \uFFFD isolé ou résiduel
  const sampleWithReplacementChar = "Système d\uFFFDexploitation sécurisé";
  const cleaned2 = stripMarkdownAndAsterisks(sampleWithReplacementChar);
  assert.equal(cleaned2.includes("\uFFFD"), false);
});

test('TechIntelView — fetchAll est protégé par try/finally et garantit setLoading(false)', () => {
  const jsx = fs.readFileSync('src/components/TechIntelView.jsx', 'utf8');

  // fetchAll doit avoir un bloc try ... finally garantissant setLoading(false)
  const fetchAllIdx = jsx.indexOf('const fetchAll = useCallback(async');
  assert.ok(fetchAllIdx > 0, 'fetchAll doit être défini');

  const fetchAllCode = jsx.slice(fetchAllIdx, fetchAllIdx + 16000);
  assert.ok(fetchAllCode.includes('try {'), 'fetchAll doit débuter par un try');
  assert.ok(fetchAllCode.includes('finally {'), 'fetchAll doit avoir un bloc finally');
  assert.ok(fetchAllCode.includes('setLoading(false)'), 'setLoading(false) doit être garanti dans finally');

  // batchHydrateOfflineBodies doit être plafonné (ne pas traiter 80+ articles d\'un coup sans limite)
  assert.ok(jsx.includes('.slice(0, 10)') || jsx.includes('.slice(0, 12)') || jsx.includes('.slice(0, 8)'),
    'batchHydrateOfflineBodies doit limiter le nombre d\'articles traités simultanément');
});
