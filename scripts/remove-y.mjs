import fs from 'fs';
const fp = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Replace the motion.div animation props to remove y movement
// Old: initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
// New: initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}

const old = `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}`;
const nw = `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}`;

const count = (c.match(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
c = c.replaceAll(old, nw);
fs.writeFileSync(fp, c);
console.log(`Replaced ${count} instances (removed y movement)`);
