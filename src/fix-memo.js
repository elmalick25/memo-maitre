const fs = require('fs');
const path = 'src/MemoMaster.jsx';
let content = fs.readFileSync(path, 'utf8');
const firstStats = content.indexOf('VUE STATISTIQUES');
const secondStats = content.indexOf('VUE STATISTIQUES', firstStats + 1);
if (secondStats === -1) {
  console.error('duplicate stats section not found');
  process.exit(1);
}
const mainClose = content.indexOf('</main>', secondStats);
if (mainClose === -1) {
  console.error('</main> not found after duplicate stats');
  process.exit(1);
}
content = content.slice(0, secondStats) + content.slice(mainClose);
const marker = 'const generateGraph = () => {';
const idx = content.indexOf(marker);
if (idx === -1) {
  console.error('generateGraph marker not found');
  process.exit(1);
}
const graphEnd = content.indexOf('};', idx);
if (graphEnd === -1) {
  console.error('generateGraph end not found');
  process.exit(1);
}
const insertPos = graphEnd + 3;
const helper = '\n  const joinStudyRoom = () => {\n    if (!studyRoomUsers.includes(FB_USER)) {\n      setStudyRoomUsers((prev) => [...prev, FB_USER]);\n      showToast("🔗 Salle d\'étude rejointe !", "success");\n    } else {\n      showToast("Tu es déjà dans la salle.", "info");\n    }\n  };\n\n  const attackWorldBoss = () => {\n    const damage = Math.floor(Math.random() * 16) + 5;\n    setWorldBossHp((hp) => Math.max(0, hp - damage));\n    showToast(`⚔️ Tu infliges ${damage} dégâts !`, "success");\n  };\n\n  const predictScore = () => {\n    const avgLevel = expressions.length ? expressions.reduce((sum, exp) => sum + (exp.level || 0), 0) / expressions.length : 0;\n    const daysRemaining = categories.filter((c) => c.examDate).length;\n    const score = Math.min(20, Math.max(1, Math.round(avgLevel * 2 + stats.streak / 7 + stats.totalReviews / 50 + (daysRemaining ? 2 : 0))));\n    setPredictedScore(score);\n    showToast(`🎯 Note estimée: ${score}/20`, "info");\n  };\n\n';
content = content.slice(0, insertPos) + helper + content.slice(insertPos);
fs.writeFileSync(path, content, 'utf8');
console.log('updated');
