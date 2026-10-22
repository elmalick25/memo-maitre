import test from "node:test";
import assert from "node:assert/strict";
import { pickExtraSessionCards, getAvailableCardsByModule } from "../lib/extraSessionEngine.js";

test("extraSessionEngine — getAvailableCardsByModule groups unpaused cards by category", () => {
  const cards = [
    { id: "1", category: "React", paused: false },
    { id: "2", category: "React", paused: false },
    { id: "3", category: "Node", paused: false },
    { id: "4", category: "Node", paused: true }, // paused should be excluded
    { id: "5", category: null, paused: false },
  ];

  const counts = getAvailableCardsByModule(cards);
  assert.equal(counts["React"], 2);
  assert.equal(counts["Node"], 1);
  assert.equal(counts["Général"], 1);
});

test("extraSessionEngine — pickExtraSessionCards filters by module and prioritizes due cards", () => {
  const now = Date.now();
  const pastISO = new Date(now - 86400000).toISOString();
  const futureISO = new Date(now + 86400000 * 5).toISOString();

  const cards = [
    { id: "c1", category: "React", nextReview: futureISO, level: 3, paused: false },
    { id: "c2", category: "React", nextReview: pastISO, level: 1, paused: false }, // due
    { id: "c3", category: "React", nextReview: futureISO, level: 0, paused: false },
    { id: "c4", category: "Python", nextReview: pastISO, level: 1, paused: false },
    { id: "c5", category: "React", paused: true }, // paused
  ];

  // Filter React, count 2
  const picked = pickExtraSessionCards({
    expressions: cards,
    selectedModule: "React",
    count: 2,
    nowMs: now,
  });

  assert.equal(picked.length, 2);
  // c2 is due, so it must be first
  assert.equal(picked[0].id, "c2");
  // c3 has lower level than c1, so it comes next
  assert.equal(picked[1].id, "c3");
});

test("extraSessionEngine — pickExtraSessionCards supports 'all' modules and limits count", () => {
  const cards = Array.from({ length: 30 }, (_, i) => ({
    id: `card_${i}`,
    category: i % 2 === 0 ? "ModA" : "ModB",
    paused: false,
    level: i % 5,
  }));

  const picked = pickExtraSessionCards({
    expressions: cards,
    selectedModule: "all",
    count: 10,
  });

  assert.equal(picked.length, 10);
});
