import fs from 'fs';
const c = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const lines = c.split('\n');

// Check around attendance tab (starts ~line 2350)
console.log('=== Attendance area (lines 2348-2370) ===');
for (let i = 2347; i < Math.min(2370, lines.length); i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Check end of file
console.log('\n=== Last 30 lines ===');
for (let i = lines.length - 30; i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
