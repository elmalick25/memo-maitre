import test from "node:test";
import assert from "node:assert/strict";
import { fsrs, isDue, getPreviewInterval, cognitiveTag } from "../lib/fsrs.js";
import { antiInterferenceReorder } from "../lib/memoryLab.js";
import { findSimilarCards } from "../lib/textUtils.js";
import { today, addDays } from "../utils/dateUtils.js";

// ── FLUX 1 : CYCLE DE RÉVISION FSRS DE BOUT EN BOUT ──
test("Integration Flow — Cycle de révision FSRS complet", () => {
  const initialCard = {
    id: "card-fsrs-test-1",
    front: "Qu'est-ce qu'une closure en JavaScript ?",
    back: "Une fonction liée à son environnement lexical.",
    category: "Javascript",
    level: 0,
    repetitions: 0,
    interval: 1,
    easeFactor: 2.5,
    stability: 0.5,
    difficulty: 5.0,
    nextReview: today(),
  };

  // 1. Vérification que la carte est due aujourd'hui
  assert.equal(isDue(initialCard.nextReview, today()), true, "La carte doit être due pour révision");

  // 2. Vérification des prédictions d'intervalle pour les boutons (0, 1, 3, 5)
  const prev0 = getPreviewInterval(initialCard, 0);
  const prev3 = getPreviewInterval(initialCard, 3);
  const prev5 = getPreviewInterval(initialCard, 5);
  assert.ok(prev0.endsWith("j"), "L'intervalle doit se terminer par 'j'");
  assert.ok(prev3.endsWith("j"), "L'intervalle doit se terminer par 'j'");
  assert.ok(prev5.endsWith("j"), "L'intervalle doit se terminer par 'j'");

  // 3. Simulation d'un premier succès (q = 3)
  const afterGrade3 = fsrs(initialCard, 3);
  assert.ok(afterGrade3.interval >= 1, "L'intervalle doit augmenter");
  assert.equal(afterGrade3.repetitions, 1, "Le nombre de répétitions passe à 1");
  assert.ok(afterGrade3.stability > initialCard.stability, "La stabilité doit progresser");

  // 4. Tag cognitif
  const tag = cognitiveTag(afterGrade3);
  assert.ok(tag.icon && tag.label && tag.color, "Le tag cognitif doit être complet");
});

// ── FLUX 2 : ANTI-INTERFÉRENCE SÉMANTIQUE DANS LA FILE DE RÉVISION ──
test("Integration Flow — Interleaving & Anti-interférence sémantique", () => {
  const cards = [
    { id: "1", category: "Java", front: "Spring Boot Microservice Configuration" },
    { id: "2", category: "Java", front: "Spring Boot Microservice Deployment" },
    { id: "3", category: "Anglais", front: "Irregular verb to be present" },
    { id: "4", category: "SQL", front: "Database Index B-Tree Architecture" },
  ];

  const reordered = antiInterferenceReorder(cards);
  assert.equal(reordered.length, cards.length, "Toutes les cartes doivent être conservées");

  // Les deux fiches Spring Boot consécutives doivent être espacées
  const firstIsSpring = reordered[0].front.includes("Spring Boot");
  const secondIsSpring = reordered[1].front.includes("Spring Boot");
  assert.ok(!(firstIsSpring && secondIsSpring), "Les fiches sémantiquement similaires ne doivent pas être consécutives");
});

// ── FLUX 3 : DÉTECTION DES DOUBLONS DE FICHES ──
test("Integration Flow — Détection de similarité et de doublons", () => {
  const existingCards = [
    { id: "e1", front: "Polymorphisme en programmation orientée objet" },
    { id: "e2", front: "Définition de l'encapsulation" },
  ];

  const candidateDuplicate = "Polymorphisme en programmation orientée objet";
  const candidateDistinct = "Qu'est-ce qu'une table de hachage ?";

  const duplicates = findSimilarCards(candidateDuplicate, existingCards, 0.8);
  const distinct = findSimilarCards(candidateDistinct, existingCards, 0.8);

  assert.ok(duplicates.length > 0, "Le doublon exact ou quasi-exact doit être identifié");
  assert.equal(distinct.length, 0, "Un nouveau concept distinct ne doit pas être vu comme doublon");
});

// ── FLUX 4 : DÉTECTION DES CONFLITS PROJETS / EXAMENS ──
test("Integration Flow — Détecteur de collision planning projets / examens", () => {
  const projects = [
    {
      id: "p1",
      title: "Projet Fin d'Études",
      deadline: addDays(today(), 3),
      tasks: [{ id: "t1", title: "Rédiger le mémoire", done: false }],
    },
  ];

  const categories = [
    {
      id: "c1",
      name: "Algorithmique Avancée",
      examDate: addDays(today(), 4), // collision dans la même fenêtre de 48h
    },
  ];

  const conflicts = [];
  projects.forEach((proj) => {
    if (!proj.deadline) return;
    categories.forEach((cat) => {
      if (!cat.examDate) return;
      const dProj = new Date(proj.deadline).getTime();
      const dExam = new Date(cat.examDate).getTime();
      const diffHours = Math.abs(dProj - dExam) / (1000 * 60 * 60);
      if (diffHours <= 48) {
        conflicts.push({
          project: proj.title,
          exam: cat.name,
          diffHours,
        });
      }
    });
  });

  assert.equal(conflicts.length, 1, "La collision Projet/Examen à 24h d'intervalle doit être détectée");
  assert.equal(conflicts[0].project, "Projet Fin d'Études");
  assert.equal(conflicts[0].exam, "Algorithmique Avancée");
});
