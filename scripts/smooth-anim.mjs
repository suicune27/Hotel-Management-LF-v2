import fs from 'fs';
const fp = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(fp, 'utf8');

const old = `initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}`;
const nw = `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}`;

const count = (c.match(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
c = c.replaceAll(old, nw);
fs.writeFileSync(fp, c);
console.log(`Replaced ${count} instances`);
