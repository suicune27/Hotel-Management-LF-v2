import fs from 'fs';
const c = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const lines = c.split('\n');

// Check around line 3399 (attendance close) and the error lines
console.log('=== Lines 3395-3420 ===');
for (let i = 3394; i < 3420 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

console.log('\n=== Lines 3425-3440 ===');
for (let i = 3424; i < 3440 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

console.log('\n=== Lines 3550-3565 ===');
for (let i = 3549; i < 3565 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
