import fs from 'fs';

const fp = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(fp, 'utf8');
const orig = c;

const mw = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;
const mr = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}`;

// ===== COMPONENT TABS: Orders, Chat, Requests =====
for (const { key, expr } of [
  { key: 'orders',   expr: "{activeTab === 'orders' && <OrdersContent" },
  { key: 'chat',     expr: "{activeTab === 'chat' && <ChatContent" },
  { key: 'requests', expr: "{activeTab === 'requests' && <RequestsContent" },
]) {
  const idx = c.indexOf(expr);
  if (idx === -1) { console.log(`⚠️ ${key}: not found`); continue; }
  const ct = c.indexOf('/>', idx);
  if (ct === -1 || ct > idx + 40000) { console.log(`⚠️ ${key}: no />`); continue; }
  let br = ct + 2;
  while (br < c.length && (c[br] === ' ' || c[br] === '\n' || c[br] === '\r')) br++;
  if (c[br] !== '}') { console.log(`⚠️ ${key}: no }`); continue; }

  // Insert <AnimatePresence mode="wait"> before {
  c = c.slice(0, idx) + '<AnimatePresence mode="wait">' + c.slice(idx);
  const apLen = '<AnimatePresence mode="wait">'.length;
  br += apLen;

  // Insert <motion.div> before the component opening <
  const compOpen = c.indexOf('<', idx + apLen);
  c = c.slice(0, compOpen) + mw(key) + c.slice(compOpen);
  br += mw(key).length;

  // Replace } with </motion.div>}</AnimatePresence>
  c = c.slice(0, br) + '</motion.div>}</AnimatePresence>' + c.slice(br + 1);
  console.log(`✅ ${key}`);
}

// ===== ROOMS TAB =====
const re = "{activeTab === 'rooms' && (";
let ri = c.indexOf(re);
if (ri > -1) {
  const openParen = ri + re.length - 1;
  let pd = 1, pi = openParen + 1;
  while (pi < c.length && pd > 0) {
    if (c[pi] === '(') pd++;
    else if (c[pi] === ')') pd--;
    pi++;
  }
  const cp = pi - 1;

  if (c[cp + 1] === '}') {
    // Insert AnimatePresence before {
    c = c.slice(0, ri) + '<AnimatePresence mode="wait">' + c.slice(ri);
    const apLen = '<AnimatePresence mode="wait">'.length;
    const newCp = cp + apLen;

    // Find outer <div> and replace with motion.div
    const afterParen = ri + apLen + re.length - 1;
    const td = c.indexOf('<div', afterParen);
    let adjCp = newCp;
    if (td > -1 && td < newCp) {
      c = c.slice(0, td) + mr('rooms') + c.slice(td + 4);
      adjCp += mr('rooms').length - 4;
    }

    // Replace </div> with </motion.div>
    const lcd = c.lastIndexOf('</div>', adjCp);
    if (lcd > -1 && lcd < adjCp) {
      c = c.slice(0, lcd) + '</motion.div>' + c.slice(lcd + 6);
      adjCp += '</motion.div>'.length - 6;
    }

    // Insert </AnimatePresence> after }
    c = c.slice(0, adjCp + 2) + '</AnimatePresence>' + c.slice(adjCp + 2);
    console.log('✅ rooms');
  } else {
    console.log(`⚠️ rooms: char after ) is '${c[cp + 1]}'`);
  }
} else {
  console.log('⚠️ rooms: not found');
}

if (c !== orig) {
  fs.writeFileSync(fp, c, 'utf8');
  console.log('✅ saved');
}
