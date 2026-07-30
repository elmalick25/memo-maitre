import { fsrs } from "../src/lib/fsrs.js";
import { diffDays } from "../src/utils/dateUtils.js";

function assertClose(a, b, msg) {
  if (Math.abs(a - b) > 0.01) {
    console.error(`FAIL: ${msg}. Expected ${b}, got ${a}`);
  } else {
    console.log(`PASS: ${msg} (${a})`);
  }
}

function runTests() {
  console.log("diffDays test 1: ", diffDays("2026-07-20", "2026-07-15") === 5 ? "PASS" : "FAIL");
  
  const card = {
    stability: null,
    difficulty: null,
    interval: 1,
    repetitions: 0,
    elapsedDays: null,
    nextReview: null
  };

  // First review, Good (3)
  const afterFirst = fsrs(card, 3);
  console.log("After First Review (Good):", afterFirst);
  assertClose(afterFirst.difficulty, 5.06, "Difficulty after first Good should be ~5.06");
  
  // Second review, on time, Good (3)
  const onTimeCard = { ...afterFirst, elapsedDays: afterFirst.interval, nextReview: null };
  const afterSecondOnTime = fsrs(onTimeCard, 3);
  console.log("After Second Review On Time (Good):", afterSecondOnTime);
  
  // Second review, late, Good (3)
  // Let's say interval was 3, but reviewed 7 days late (total 10 days)
  const lateCard = { ...afterFirst, interval: 3, elapsedDays: 10, nextReview: null };
  const afterSecondLate = fsrs(lateCard, 3);
  console.log("After Second Review Late (Good):", afterSecondLate);
  
  if (afterSecondLate.stability <= afterSecondOnTime.stability) {
    console.error("FAIL: Late review should yield higher stability if recalled correctly!");
  } else {
    console.log("PASS: Late review yielded higher stability.");
  }
}

runTests();
