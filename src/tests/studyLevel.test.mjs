import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStudyLevel, matchesStudyLevel } from "../lib/studyLevel.js";

const master = { title: "Bourse Master", eligibility: { academicLevel: "Licence 3 / Bachelor validé" } };
const phd = { title: "Bourse Doctorat", eligibility: { academicLevel: "Master 2 validé" } };

describe("niveau d'études", () => {
  it("reconnaît une saisie libre", () => {
    assert.equal(parseStudyLevel("je suis en L3 info").rank, 4);
    assert.equal(parseStudyLevel("Master 1").rank, 5);
  });
  it("un L3 voit les masters, pas les doctorats", () => {
    assert.equal(matchesStudyLevel(master, 4), true);
    assert.equal(matchesStudyLevel(phd, 4), false);
  });
  it("un L1 ne voit pas encore les masters", () => {
    assert.equal(matchesStudyLevel(master, 2), false);
  });
});
