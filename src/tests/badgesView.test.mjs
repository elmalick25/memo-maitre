import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { UNLOCKS, getUnlocks, getNextUnlock } from "../lib/unlocks.js";

test("BadgesView — Component exists, exports default, and supports clean tabs for Badges and Privileges", () => {
  const code = fs.readFileSync(path.resolve("src/components/BadgesView.jsx"), "utf8");

  // Contrat d'exportation
  assert.ok(code.includes("export default function BadgesView"), "BadgesView doit être un export par défaut");

  // Vérification de la séparation en sous-onglets
  assert.ok(code.includes("activeTab"), "BadgesView doit gérer l'état activeTab");
  assert.ok(code.includes("Hauts Faits & Trophées"), "BadgesView doit inclure l'onglet Hauts Faits");
  assert.ok(code.includes("Paliers & Privilèges de Niveau"), "BadgesView doit inclure l'onglet Privilèges");

  // Vérification de l'organisation par catégories des privilèges
  assert.ok(code.includes("UNLOCK_CATEGORIES"), "BadgesView doit définir des catégories pour organiser les privilèges");
  assert.ok(code.includes("getUnlockCategory"), "BadgesView doit catégoriser chaque privilège");
  assert.ok(code.includes("filteredUnlocks"), "BadgesView doit filtrer proprement les privilèges par catégorie et statut");
});

test("Unlocks — Cohérence des privilèges de niveau", () => {
  assert.ok(Array.isArray(UNLOCKS), "UNLOCKS doit être un tableau");
  assert.ok(UNLOCKS.length >= 20, "UNLOCKS doit contenir l'ensemble des paliers RPG");

  // Vérification au niveau 0
  const lvl0 = getUnlocks(0);
  assert.equal(lvl0.length, 0);

  // Vérification au niveau 10
  const lvl10 = getUnlocks(10);
  assert.ok(lvl10.length >= 10);
  assert.ok(lvl10.some(u => u.id === "theme_azur"));

  // Vérification du prochain palier
  const nextFrom10 = getNextUnlock(10);
  assert.ok(nextFrom10 !== null);
  assert.equal(nextFrom10.level, 12);
});
