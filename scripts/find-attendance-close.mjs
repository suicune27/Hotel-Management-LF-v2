import fs from 'fs';
const c = fs.readFileSync('src/components/FrontDeskPanel.tsx', 'utf8');
const lines = c.split('\n');

// Find the attendance tab opening
const attLine = lines.findIndex(l => l.includes("activeTab === 'attendance'"));
console.log('Attendance opening at line', attLine + 1);

// Search for the first line after attendance that starts with `{hasStaffCalls` or `{/* =====`
const afterAtt = lines.slice(attLine + 1);
for (let i = 0; i < afterAtt.length; i++) {
  const l = afterAtt[i];
  if (l.includes('hasStaffCalls') || l.includes('=====')) {
    console.log(`Marker found at line ${attLine + 2 + i}: ${l.trim()}`);
    // Check the 5 lines before this marker
    for (let j = Math.max(0, i - 5); j < i; j++) {
      console.log(`  Line ${attLine + 2 + j}: ${afterAtt[j].trim()}`);
    }
    break;
  }
}

// Also find the last `})()` in the original file
let lastPos = c.lastIndexOf('})()');
console.log(`\nLast })() at character ${lastPos}`);
const lineBefore = c.lastIndexOf('\n', lastPos);
const lineAfter = c.indexOf('\n', lastPos);
console.log(`Context: ${c.slice(lineBefore + 1, lineAfter).trim()}`);
