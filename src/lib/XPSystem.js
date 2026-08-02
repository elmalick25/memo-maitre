// src/lib/XPSystem.js

export const LEVELS = [
  { max: 500, name: "Beginner", icon: "🌱" },
  { max: 2000, name: "Elementary", icon: "📘" },
  { max: 5000, name: "Intermediate", icon: "🚀" },
  { max: 10000, name: "Advanced", icon: "🔥" },
  { max: 20000, name: "Expert", icon: "⚡" },
  { max: Infinity, name: "God Mode 🔱", icon: "🔱" }
];

export function calculateLevel(totalXP) {
  for (const lvl of LEVELS) {
    if (totalXP <= lvl.max) return lvl;
  }
  return LEVELS[LEVELS.length - 1];
}

export function updateStreak(lastDateStr, currentDateStr, currentStreak, longestStreak) {
  if (!lastDateStr) {
    return { streak: 1, longest: Math.max(1, longestStreak) };
  }
  
  const lastDate = new Date(lastDateStr);
  lastDate.setHours(0, 0, 0, 0);
  const current = new Date(currentDateStr);
  current.setHours(0, 0, 0, 0);
  
  const diffTime = Math.abs(current - lastDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Same day, no change
    return { streak: currentStreak, longest: longestStreak };
  } else if (diffDays === 1) {
    // Next day, increment
    const newStreak = currentStreak + 1;
    return { streak: newStreak, longest: Math.max(newStreak, longestStreak) };
  } else {
    // Streak broken
    return { streak: 1, longest: longestStreak };
  }
}

export function calculateXPMultiplier(currentStreak) {
  if (currentStreak >= 30) return 2.0;
  if (currentStreak >= 7) return 1.5;
  return 1.0;
}

// Evaluate badges based on current stats + new action
export function checkBadges(stats, newAction = null) {
  const newBadges = [];
  const currentBadges = new Set(stats.badges || []);

  const add = (b) => {
    if (!currentBadges.has(b)) {
      newBadges.push(b);
      currentBadges.add(b);
    }
  };

  // Condition checks
  if (stats.wordsLearned >= 1) add("First Word");
  if (stats.wordsLearned >= 100) add("Word Collector 100");
  if (stats.currentStreak >= 7) add("Streak 7");
  if (stats.currentStreak >= 30) add("Streak 30");
  if (stats.totalXP > 20000) add("God Mode");
  if (stats.pronunciationAvgScore >= 90) add("Pronunciation 90%");
  
  if (newAction) {
    if (newAction.type === "SPEED_DEMON" && newAction.wpm >= 50) add("Speed Demon");
    if (newAction.type === "ROLE_PLAY_COMPLETED") add("Role Player");
    if (newAction.type === "NEWS_READ") add("News Reader");
    if (newAction.type === "NIGHT_OWL" || new Date().getHours() >= 22) add("Night Owl");
  }

  return newBadges;
}

export function generateASCIIChart(sessionsHistory) {
  // Take last 7 days from history
  if (!sessionsHistory || sessionsHistory.length === 0) return "Aucune donnée";
  
  const last7 = sessionsHistory.slice(-7);
  const maxXP = Math.max(...last7.map(s => s.xpEarned), 1);
  
  return last7.map(s => {
    const height = Math.round((s.xpEarned / maxXP) * 5); // 0 to 5 scale
    const bar = "█".repeat(height).padEnd(5, "░");
    const day = new Date(s.date).toLocaleDateString("en-US", { weekday: "short" });
    return `${day} ${bar} ${s.xpEarned}XP`;
  }).join("\n");
}
