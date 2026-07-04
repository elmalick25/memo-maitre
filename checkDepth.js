const fs = require('fs');
const lines = fs.readFileSync('src/MemoMaster.jsx', 'utf8').split(/\r?\n/);
let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export default function MemoMaster')) {
    start = i;
    break;
  }
}
console.log('start', start+1, lines[start]);
let depth = 0;
let inString = false;
let stringChar = '';
let escaped = false;
let inTemplate = false;
for (let i = start; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (inTemplate) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '`') { inTemplate = false; continue; }
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === '`') { inTemplate = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if ((i+1) % 100 === 0 || i === start || (i >= 6080 && i <= 6105)) {
    console.log(i+1, 'depth', depth, line.trim());
  }
  if (depth === 0 && i > start) {
    console.log('zero at', i+1, line);
    break;
  }
}
console.log('final depth', depth);
