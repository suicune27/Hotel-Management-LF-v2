import fs from 'fs';
const c = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const lines = c.split('\n');
console.log('Lines 2058-2065:');
for (let i = 2057; i < 2065 && i < lines.length; i++) {
  console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
}
