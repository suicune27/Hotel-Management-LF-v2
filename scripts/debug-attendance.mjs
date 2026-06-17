import fs from 'fs';
import { execSync } from 'child_process';

// Get the original file from git
const original = execSync('git show HEAD:src/components/FrontDeskPanel.tsx').toString();
const lines = original.split('\n');

// Find attendance tab
const attIdx = lines.findIndex(l => l.includes("activeTab === 'attendance'"));
console.log('Attendance starts at line', attIdx + 1);

// Show the last 40 lines of the original file
console.log('\n=== Last 50 lines of original file ===');
for (let i = Math.max(0, lines.length - 50); i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Check the modified file
const modified = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const modLines = modified.split('\n');

console.log('\n=== Last 50 lines of MODIFIED file ===');
for (let i = Math.max(0, modLines.length - 50); i < modLines.length; i++) {
  console.log(`${i+1}: ${modLines[i]}`);
}

// Find })() in modified file
let idx = -1;
let count = 0;
while ((idx = modified.indexOf('})()', idx + 1)) > -1) {
  console.log(`Modified: })() at character ${idx}, context: ${modified.slice(Math.max(0,idx-20), idx+20)}`);
  count++;
  if (count > 10) break;
}
