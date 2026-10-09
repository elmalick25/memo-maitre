import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('novaMemory — Profil apprenant par défaut et construction du prompt de continuité', async () => {
  const { DEFAULT_NOVA_PROFILE, getNovaLearnerProfile, buildContinuityPrompt } = await import('../lib/english/novaMemory.js');

  assert.ok(DEFAULT_NOVA_PROFILE.studentName, 'Le profil par défaut doit avoir un prénom');
  assert.ok(Array.isArray(DEFAULT_NOVA_PROFILE.interests), 'Le profil par défaut doit avoir des centres d’intérêt');

  const profile = getNovaLearnerProfile();
  assert.equal(profile.studentName, 'Malick');

  const customProfile = {
    studentName: 'Malick',
    background: 'Computer Science student',
    interests: ['AI & LLMs', 'Tech Startups'],
    recentTopics: [
      { date: '2026-10-09', topic: 'Web app architecture and morning routines', keyFacts: 'Wakes up at 6am to code' }
    ],
    linguisticGaps: ['Can you hear me vs Do you hear me'],
  };

  const continuityStr = buildContinuityPrompt(customProfile);
  assert.match(continuityStr, /Malick/, 'Doit inclure le prénom');
  assert.match(continuityStr, /Web app architecture/, 'Doit rappeler la discussion précédente');
  assert.match(continuityStr, /Wakes up at 6am/, 'Doit rappeler le fait concret');
  assert.match(continuityStr, /AI & LLMs/, 'Doit mentionner les centres d’intérêt');
});

test('novaVoicePrompt — Contient la règle de scaffolding pour les incompréhensions ("I don\'t understand")', () => {
  const vpPath = path.resolve('src/lib/english/novaVoicePrompt.js');
  const src = fs.readFileSync(vpPath, 'utf8');

  assert.ok(
    src.includes('IF THE STUDENT DOES NOT UNDERSTAND OR ASKS FOR CLARIFICATION'),
    'Doit inclure une consigne dédiée quand l\'élève ne comprend pas'
  );
  assert.ok(
    src.includes('Demystify the word or idea using very simple everyday English'),
    'Doit simplifier le langage et le niveau CEFR'
  );
});

test('EnglishPractice — Intègre la mémoire de Nova, la continuité et le bouton Tap-to-Card', () => {
  const epPath = path.resolve('src/EnglishPractice.jsx');
  const src = fs.readFileSync(epPath, 'utf8');

  assert.ok(src.includes('getNovaLearnerProfile'), 'Doit importer getNovaLearnerProfile');
  assert.ok(src.includes('buildContinuityPrompt'), 'Doit importer buildContinuityPrompt');
  assert.ok(src.includes('continuityMemory={continuityMemory}'), 'Doit passer continuityMemory à LiveKitVoiceAssistant');
  assert.ok(src.includes('handleQuickSaveExpression'), 'Doit proposer handleQuickSaveExpression');
  assert.ok(src.includes('💡 + Fiche'), 'Doit afficher le bouton d\'action Tap-to-Card sur la bulle de Nova');
  assert.ok(src.includes('lastLkUser?.text'), 'Doit passer le contexte utilisateur pour affiner l\'extraction des expressions');
  assert.ok(src.includes('cards') && src.includes('Extrais TOUTES les expressions'), 'Doit demander à Claude d\'extraire toutes les expressions de la réplique');

  // Popup modal des rectos des expressions apprises
  assert.ok(src.includes('showSessionCardsModal'), 'Doit déclarer l\'état showSessionCardsModal');
  assert.ok(src.includes('setShowSessionCardsModal(true)'), 'Le clic sur le dossier jaune doit ouvrir le popup');
  assert.ok(src.includes('{card.front}'), 'Le popup doit afficher le recto des cartes');
  assert.ok(src.includes('isDarkMode ? "color-mix(in srgb, var(--mm-bg-card'), 'Le popup doit respecter le thème sombre et clair');
  assert.ok(src.includes('🗑️') && src.includes('dismissedSessionCardKeys'), 'Doit fournir un bouton de suppression immédiate 1-clic pour les fiches déjà comprises');
});


