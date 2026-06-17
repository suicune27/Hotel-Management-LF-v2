import fs from 'fs';
const fp = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(fp, 'utf8');

const old = `mode="wait"`;
const nw = ``; // empty - remove the mode prop entirely

const count = (c.match(/AnimatePresence\s+mode="wait"/g) || []).length;
c = c.replaceAll(`AnimatePresence mode="wait"`, 'AnimatePresence');
fs.writeFileSync(fp, c);
console.log(`Fixed ${count} AnimatePresence instances (removed mode="wait")`);
