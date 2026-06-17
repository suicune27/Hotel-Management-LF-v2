import fs from 'fs';
const c = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const lines = c.split('\n');

// Check Rooms closing area (lines 2055-2065)
console.log('=== Rooms closing (lines 2056-2065) ===');
for (let i = 2055; i < 2065 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}

// Check component tabs (lines 2093-2130)
console.log('\n=== Component tabs (lines 2093-2130) ===');
for (let i = 2092; i < 2130 && i < lines.length; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
