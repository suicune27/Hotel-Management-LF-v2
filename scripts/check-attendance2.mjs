import fs from 'fs';
const c = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const lines = c.split('\n');

// Find AnimatePresence in attendance area (lines 2348-2370)
console.log('=== Lines 2348-2370 ===');
for (let i = 2347; i < 2370 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Find all AnimatePresence occurrences at the end of file
console.log('\n=== Last 50 lines ===');
for (let i = Math.max(0, lines.length - 50); i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Count AnimatePresence occurrences
let apCount = 0;
let idx = -1;
while ((idx = c.indexOf('<AnimatePresence', idx + 1)) > -1) apCount++;
console.log(`\nAnimatePresence opens: ${apCount}`);

let closeCount = 0;
idx = -1;
while ((idx = c.indexOf('</AnimatePresence>', idx + 1)) > -1) closeCount++;
console.log(`AnimatePresence closes: ${closeCount}`);

// Find AnimatePresence locations
idx = -1;
let i = 0;
while ((idx = c.indexOf('<AnimatePresence', idx + 1)) > -1) {
  const line = c.lastIndexOf('\n', idx) + 1;
  const lineEnd = c.indexOf('\n', idx);
  const lineNum = c.slice(0, idx).split('\n').length;
  console.log(`Open #${++i}: line ${lineNum}: ${c.slice(line, lineEnd).trim()}`);
}

idx = -1;
i = 0;
while ((idx = c.indexOf('</AnimatePresence>', idx + 1)) > -1) {
  const line = c.lastIndexOf('\n', idx) + 1;
  const lineEnd = c.indexOf('\n', idx);
  const lineNum = c.slice(0, idx).split('\n').length;
  console.log(`Close #${++i}: line ${lineNum}: ${c.slice(line, lineEnd).trim()}`);
}
