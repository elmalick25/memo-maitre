const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'LENOVO', 'memo-app', 'src', 'Academie.jsx');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

const newPhase2and3 = `      // ── PHASE 2 : NARRATEUR PRINCIPAL ──
      setLessonLoadingStep(2);
      const baseFacts = \`\\n\\n[FAITS HYPER-RAG — SOURCE WEB VÉRIFIÉE]\\n\${researchFacts.substring(0, 5000)}\\n[FIN FAITS]\\n\\nRÈGLE ABSOLUE : Tu DOIS ancrer chaque claim dans ces faits ou dans des sources nommées précises (auteur, livre, RFC, commit GitHub, papier académique, doc officielle). Zéro affirmation sans ancrage.\`;

      const narratorPrompt = \`Tu es un auteur technique de niveau Stripe Press / Every.to / Increment 
Magazine. Tu as passé 15 ans à écrire pour des ingénieurs seniors qui 
détestent les bullshits. Quand tu reçois un sujet, tu ne "prépares pas un 
plan" — tu écris directement.

SUJET : "\${module.title}" dans le contexte de \${profile.subject}
NIVEAU APPRENANT : \${profile.level}
OBJECTIF : \${profile.goal}

FAITS VÉRIFIÉS (utilise-les comme fondations — ne les invente pas) :
\${baseFacts}

TA VOIX :
- Directe et dense. Pas de phrase qui ne porte pas une idée.
- Tu nommes des personnes réelles, des projets réels, des dates réelles.
- Tu utilises "tu" ou "vous" selon le ton, jamais "nous allons voir".
- Chaque transition vient de la logique des idées, pas du plan.
- Tu montres la tension avant la résolution. Jamais l'inverse.

STRUCTURE (à respecter dans l'ordre, sans titres de plan visibles — 
intègre-les comme des respirations naturelles) :

[ACCROCHE]
Commence par un fait contre-intuitif ou un incident réel. Pas une 
question rhétorique. La première phrase doit créer une friction 
immédiate. Minimum 2 paragraphes.

[POURQUOI CE CONCEPT EXISTE]
Raconte l'histoire du problème avant la solution. Qui souffrait ? 
Comment ? Une date précise, une équipe réelle, un contexte de 
frustration documenté. Minimum 3 paragraphes.

[LE MODÈLE MENTAL]
Une seule analogie du monde physique, développée complètement. Puis 
2 paragraphes sur où l'analogie tient et où elle casse. Sois 
honnête sur les limites.

[LA MÉCANIQUE INTERNE]
Un schéma ASCII qui montre les composants réels, les flux, les états. 
Chaque élément du schéma référencé dans le texte qui suit. Puis 
2-3 lignes d'explication par élément.

[NIVEAU 1 — La compréhension intuitive]
4 paragraphes minimum. Un concept par paragraphe. Premier exemple de 
code : moins de 15 lignes, commentaires en français sur chaque ligne 
non-triviale. Termine par une phrase qui ouvre vers la profondeur.

[NIVEAU 2 — La mécanique réelle]
4 paragraphes minimum. Deux exemples de code : l'implémentation 
minimale puis l'implémentation de production. Entre les deux : 
explique exactement ce qui change et pourquoi. Complexité Big O avec 
explication du POURQUOI, pas juste la notation.

[NIVEAU 3 — Ce que les seniors savent et les autres ignorent]
3 paragraphes minimum. Le code qui fonctionne en dev mais explose en 
prod. Un comportement non documenté. Un cas limite que 95% des devs 
n'ont jamais rencontré.

[EN PRODUCTION]
3 exemples concrets : un projet open source reconnu avec nom de 
fichier et fonction si possible, une librairie populaire, un pattern 
d'architecture d'entreprise. Pas "dans un projet typique" — des noms.

[PIÈGES EN INTERVIEW]
3 questions : 1 conceptuelle, 1 debugging, 1 design système. Pour 
chacune : la réponse du candidat moyen, les 3-4 points de la réponse 
parfaite, le red flag qui élimine.

[GUIDE RÉVISION RAPIDE]
Format ultra-dense :
**Définition en 1 phrase :** [max 20 mots]
**Quand l'utiliser :** 3 bullets
**Quand NE PAS l'utiliser :** 3 bullets
**Complexité :** Temps O(...) · Espace O(...)
**Les 3 propriétés fondamentales :** 3 bullets
**À retenir absolument :** 1 phrase

[LE TWEET]
L'insight en moins de 280 caractères. Pas une définition. La leçon 
qu'un senior posterait après un incident.

INTERDICTIONS ABSOLUES (si tu utilises une de ces formulations, 
recommence) :
- "Dans ce module, nous allons..."
- "Il est important de noter que..."
- "En conclusion, nous avons vu que..."
- "Ce concept est fondamental car..."
- "Maintenant que vous comprenez X, passons à Y"
- Toute phrase qui commence par "Il est" ou "C'est important"

Produis le cours complet maintenant. Minimum 2500 mots hors code.\`;

      const narratorRes = await callClaude(narratorPrompt, 'Narrateur : rédaction du cours...', { grounding: false, temperature: 0.15 });
      const narratorDraft = narratorRes.text || narratorRes;

      // ── PHASE 3 : WITNESSES (ENRICHISSEMENT) ──
      setLessonLoadingStep(3);

      const witnessArchitectPrompt = \`Tu es un architecte système senior (20 ans de production, ex-Google SRE, 
ex-Stripe). Tu viens de lire ce cours sur "\${module.title}".

COURS DRAFT :
\${narratorDraft}

FAITS SUPPLÉMENTAIRES :
\${baseFacts}

TA MISSION (très précise) :
Identifie dans ce cours les passages qui parlent d'architecture, de 
trade-offs, de décisions de conception, de performance système. 
Enrichis UNIQUEMENT ces passages.

Pour chaque passage identifié, fournis :
- [PASSAGE_ORIGINAL] : cite les 10-15 premiers mots du passage
- [ENRICHISSEMENT] : ton ajout (2-4 paragraphes max, dense, avec 
  sources nommées, incidents réels documentés, métriques concrètes)

Si un trade-off majeur est absent du cours, signale-le avec :
- [MANQUANT] : décris le trade-off et donne le contenu complet à 
  insérer après [INSERTION_APRES : premiers mots du passage précédent]

Format de sortie : liste de blocs [PASSAGE_ORIGINAL] / [ENRICHISSEMENT] 
ou [MANQUANT] / [INSERTION_APRES] / [CONTENU]. Rien d'autre.\`;

      const witnessEngineerPrompt = \`Tu es Linus Torvalds et Antirez fusionnés. Tu viens de lire ce cours.

COURS DRAFT :
\${narratorDraft}

FAITS SUPPLÉMENTAIRES :
\${baseFacts}

TA MISSION :
Identifie tous les exemples de code dans ce cours. Pour chacun :

- [CODE_PASSAGE] : cite les 10-15 premiers mots du contexte autour 
  du code
- [AMELIORATION_CODE] : la version améliorée du code (plus précise, 
  cas limites couverts, commentaires sur les lignes non triviales, 
  complexité expliquée)

Si un exemple de code critique est ABSENT (notamment : l'implémentation 
minimale, le code qui casse en prod, la version de production avec 
gestion d'erreurs), fournis-le avec :
- [CODE_MANQUANT] : le code complet avec contexte
- [INSERTION_APRES : premiers mots du passage précédent]

Aussi : si une version/évolution d'API importante est absente du cours, 
ajoute un bloc [EVOLUTION_MANQUANTE] avec le contenu.\`;

      const witnessAuditorPrompt = \`Tu es l'équipe sécurité de Cloudflare et un post-mortem AWS réunis. 
Tu viens de lire ce cours.

COURS DRAFT :
\${narratorDraft}

FAITS SUPPLÉMENTAIRES :
\${baseFacts}

TA MISSION :
Identifie les passages qui touchent à la sécurité, aux anti-patterns, 
aux risques de production. Enrichis-les.

Pour chaque risque non documenté ou sous-documenté :
- [RISQUE_PASSAGE] : cite les 10-15 premiers mots du passage concerné
- [ENRICHISSEMENT_SECURITE] : l'incident réel documenté (avec source : 
  CVE number, postmortem public, article technique), le symptôme précis 
  (pas "des erreurs" — "la mémoire monte de 2MB/s jusqu'au crash"), 
  et la mitigation exacte

Si le cours n'a pas de section sur les anti-patterns de ce concept, 
fournis un bloc [ANTIPATTERNS_MANQUANTS] avec les 3 plus mortels.\`;

      const witnessPedagoguePrompt = \`Tu es un chercheur en sciences cognitives de Stanford spécialisé en 
misconceptions d'apprentissage. Tu viens de lire ce cours.

COURS DRAFT :
\${narratorDraft}

FAITS SUPPLÉMENTAIRES :
\${baseFacts}

TA MISSION :
Identifie les 3-5 passages où l'explication crée potentiellement une 
confusion ou un modèle mental erroné. Pour chacun :

- [PASSAGE_CONFUS] : cite les 10-15 premiers mots
- [MODELE_ERRONE] : exactement comment un apprenant va mal visualiser 
  ce concept après avoir lu ce passage
- [CORRECTION] : la reformulation ou l'ajout qui corrige le modèle. 
  Minimum : 1 exemple de code qui illustre la différence entre le 
  modèle erroné et le modèle correct.

Fournis aussi un bloc [MISCONCEPTIONS_SECTION] : les 5 malentendus 
classiques du concept (modèle erroné → rupture → correction), à 
insérer avant la section Guide Révision Rapide.\`;

      const [architectWitnessRes, engineerWitnessRes, auditorWitnessRes, pedagogueWitnessRes] = await Promise.all([
        callClaude(witnessArchitectPrompt, 'Witness Architecte...', { grounding: false, temperature: 0.1 }),
        callClaude(witnessEngineerPrompt, 'Witness Ingénieur...', { grounding: false, temperature: 0.1 }),
        callClaude(witnessAuditorPrompt, 'Witness Auditeur...', { grounding: false, temperature: 0.1 }),
        callClaude(witnessPedagoguePrompt, 'Witness Pédagogue...', { grounding: false, temperature: 0.1 })
      ]);

      const architectWitness = architectWitnessRes.text || architectWitnessRes;
      const engineerWitness = engineerWitnessRes.text || engineerWitnessRes;
      const auditorWitness = auditorWitnessRes.text || auditorWitnessRes;
      const pedagogueWitness = pedagogueWitnessRes.text || pedagogueWitnessRes;

      // ── PHASE 4 : INTÉGRATEUR ──
      setLessonLoadingStep(4);

      const integratorPrompt = \`Tu es le rédacteur en chef de Stripe Press. Tu as devant toi un cours 
rédigé par un narrateur principal, et les annotations de 4 experts 
(architecte, ingénieur, auditeur, pédagogue) qui ont identifié ce qui 
manque ou doit être enrichi.

TON TRAVAIL : intégrer les enrichissements des experts dans le cours 
du narrateur, en préservant ABSOLUMENT la voix et le rythme du 
narrateur. Les experts apportent de la substance — le narrateur 
apporte l'âme. Tu ne sacrifies jamais l'âme pour la substance.

COURS DU NARRATEUR :
\${narratorDraft}

ENRICHISSEMENTS ARCHITECTE :
\${architectWitness}

ENRICHISSEMENTS INGÉNIEUR :
\${engineerWitness}

ENRICHISSEMENTS AUDITEUR :
\${auditorWitness}

ENRICHISSEMENTS PÉDAGOGUE :
\${pedagogueWitness}

RÈGLES D'INTÉGRATION :
1. Chaque [ENRICHISSEMENT] ou [AMELIORATION_CODE] s'insère au passage 
   indiqué, en adaptant la transition pour qu'elle soit invisible.
2. Chaque [MANQUANT] ou [CODE_MANQUANT] s'insère à la position indiquée.
3. Les [MISCONCEPTIONS_SECTION] du pédagogue vont juste avant le 
   "Guide Révision Rapide".
4. Si deux experts enrichissent le même passage, fusionnes-les en un 
   seul bloc cohérent — pas deux blocs séquentiels.
5. Si un enrichissement brise le rythme narratif, reformule la 
   transition mais conserve le contenu.

INTERDICTIONS :
- Ne modifie PAS la structure du cours du narrateur.
- Ne réécris PAS les passages qui fonctionnent déjà.
- Ne commence PAS par résumer ce que tu vas faire.
- Fournis directement le cours final intégré.

Les blocs HTML des experts (expert-block expert-architect, etc.) 
doivent être présents dans le cours final, placés naturellement 
après les sections qu'ils enrichissent, dans cet ordre :
<div class="expert-block expert-architect">...</div>
<div class="expert-block expert-engineer">...</div>  
<div class="expert-block expert-auditor">...</div>
<div class="expert-block expert-pedagogue">...</div>

\${includeProject ? \`IMPORTANT : Termine OBLIGATOIREMENT le cours par le séparateur "|||MISSION|||" suivi d'une mission/scénario "High-Stakes" ancrée dans un contexte africain/sénégalais réel. Pas un exercice académique — un vrai problème métier.\` : ''}

Produis le cours final intégré maintenant.\`;

      const integratorRes = await callClaude(integratorPrompt, 'Intégrateur final...', { grounding: false, temperature: 0.05 });
      let initialText = integratorRes.text || integratorRes;`;

// Find start and end indices of the block to replace
const startIndex = lines.findIndex(line => line.includes('// ── PHASE 2 : MIXTURE OF EXPERTS (MoE) ──'));
const endIndex = lines.findIndex(line => line.includes('initialText = editorRes.text || editorRes;'));

if (startIndex !== -1 && endIndex !== -1) {
    lines.splice(startIndex, endIndex - startIndex + 1, newPhase2and3);
}

// Write it back
content = lines.join('\\n');

// Replace step 4 to 5 for CoVe
content = content.replace('// ── PHASE 4 : COVE EXTRACTION ──\\n        setLessonLoadingStep(4);', '// ── PHASE 5 : COVE EXTRACTION ──\\n        setLessonLoadingStep(5);');
content = content.replace('// ── PHASE 4 : COVE EXTRACTION ──\\r\\n        setLessonLoadingStep(4);', '// ── PHASE 5 : COVE EXTRACTION ──\\n        setLessonLoadingStep(5);');

// Replace step 5 to 6 for CoVe Synthesis
content = content.replace('// ── COVE SYNTHESE ──\\n            setLessonLoadingStep(5);', '// ── COVE SYNTHESE ──\\n            setLessonLoadingStep(6);');
content = content.replace('// ── COVE SYNTHESE ──\\r\\n            setLessonLoadingStep(5);', '// ── COVE SYNTHESE ──\\n            setLessonLoadingStep(6);');

// Replace UI labels array
const oldUIMapStr = `                          {[
                            { step: 1, label: '🔍 Agent Chercheur & Rédacteur', sub: 'Recherche & rédaction du premier jet' },
                            { step: 2, label: '📋 Extracteur d\\'Assertions', sub: 'Isolation des affirmations clés (CoVe)' },
                            { step: 3, label: '🔬 Vérificateur de Faits', sub: 'Validation croisée et fact-checking' },
                            { step: 4, label: '✍️ Synthétiseur Correcteur', sub: 'Correction finale et polissage' },
                          ].map((item, i) => {`;
const newUIMapStr = `                          {[
                            { step: 1, label: '🔍 Agent Chercheur', sub: 'Recherche Web (Hyper-RAG)' },
                            { step: 2, label: '✍️ Narrateur Principal', sub: 'Rédaction du draft complet' },
                            { step: 3, label: '🔬 Experts (Witnesses)', sub: 'Enrichissement ciblé (4 agents)' },
                            { step: 4, label: '🧩 Intégrateur (Fusion)', sub: 'Intégration narrative finale' },
                            { step: 5, label: '🛡️ CoVe Shield', sub: 'Audit factuel & Correction' },
                          ].map((item, i) => {`;
content = content.replace(oldUIMapStr, newUIMapStr);
// In case of windows line endings
content = content.replace(oldUIMapStr.replace(/\\n/g, "\\r\\n"), newUIMapStr);

// Replace UI span text
const oldSpanStr = `                        <span style={{ color: '#334155', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }}>
                          {lessonLoadingStep === 1 ? 'Phase 1: Hyper-RAG (Recherche Profonde)...' :
                            lessonLoadingStep === 2 ? 'Phase 2: Mixture of Experts (Débat: Architecte, Ingénieur, Auditeur)...' :
                              lessonLoadingStep === 3 ? 'Phase 3: Synthesizer "God Mode" en action...' :
                                lessonLoadingStep === 4 ? 'Phase 4: CoVe Shield (0 Hallucination)...' :
                                  'Canalisation du savoir...'}
                        </span>`;
const newSpanStr = `                        <span style={{ color: '#334155', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }}>
                          {lessonLoadingStep === 1 ? 'Phase 1: Hyper-RAG (Recherche Profonde)...' :
                            lessonLoadingStep === 2 ? 'Phase 2: Narrateur : rédaction du cours...' :
                              lessonLoadingStep === 3 ? 'Phase 3: Experts : enrichissement ciblé...' :
                                lessonLoadingStep === 4 ? 'Phase 4: Intégrateur : fusion finale...' :
                                  lessonLoadingStep >= 5 ? 'Phase 5: CoVe Shield (0 Hallucination)...' :
                                    'Canalisation du savoir...'}
                        </span>`;
content = content.replace(oldSpanStr, newSpanStr);
content = content.replace(oldSpanStr.replace(/\\n/g, "\\r\\n"), newSpanStr);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Done");
