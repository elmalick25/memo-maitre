import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { optimizeWeights, buildReviewSequences, countReviews } from "../lib/srs/optimizer.js";

test("srs optimizer — optimizeWeights supports custom minReviews option", () => {
  // Mock sequences with 15 reviews
  const sequences = [
    [
      { grade: 3, elapsed: 0, recalled: 1 },
      { grade: 3, elapsed: 1, recalled: 1 },
      { grade: 3, elapsed: 3, recalled: 1 },
      { grade: 1, elapsed: 7, recalled: 0 },
    ],
    [
      { grade: 4, elapsed: 0, recalled: 1 },
      { grade: 4, elapsed: 2, recalled: 1 },
      { grade: 4, elapsed: 6, recalled: 1 },
    ],
  ];

  const count = countReviews(sequences);
  assert.equal(count, 5);

  // Default requires 1000 reviews -> not enough
  const resDefault = optimizeWeights(sequences);
  assert.equal(resDefault.converged, false);
  assert.equal(resDefault.reason, "not-enough-data");

  // With minReviews: 3 -> executes Adam iterations and returns converged true
  const resCustom = optimizeWeights(sequences, { minReviews: 3, iterations: 5 });
  assert.equal(resCustom.converged, true);
  assert.equal(Array.isArray(resCustom.weights), true);
  assert.equal(resCustom.weights.length, 19);
});

test("FsrsBrainCalibrationCard — component file exists and exports React component", () => {
  const filePath = path.resolve("src/components/FsrsBrainCalibrationCard.jsx");
  assert.equal(fs.existsSync(filePath), true, "FsrsBrainCalibrationCard.jsx must exist");

  const content = fs.readFileSync(filePath, "utf-8");
  assert.equal(content.includes("export default function FsrsBrainCalibrationCard"), true);
  assert.equal(content.includes("runOptimization"), true);
  assert.equal(content.includes("resetWeights"), true);
});

test("GodTierStats — renders FsrsBrainCalibrationCard", () => {
  const content = fs.readFileSync(path.resolve("src/components/GodTierStats.jsx"), "utf-8");
  assert.equal(content.includes("FsrsBrainCalibrationCard"), true, "GodTierStats must render FsrsBrainCalibrationCard");
});
