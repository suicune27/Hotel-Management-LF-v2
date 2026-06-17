import fs from 'fs';

const filePath = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(filePath, 'utf8');
const orig = c;

const motionDivWidget = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;
const motionDivTag = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}`;

/** Simple brace-depth tracker. Returns index of matching `}`. */
function findCloseBrace(s, openIdx) {
  let depth = 1, i = openIdx + 1;
  let inStr = false, strQ = '';
  while (i < s.length && depth > 0) {
    const ch = s[i];
    if (inStr) {
      if (ch === strQ && s[i-1] !== '\\') inStr = false;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      inStr = true; strQ = ch;
    } else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

// ============================================================
// 1. COMPONENT TABS: Orders, Chat, Requests
// Pattern: {activeTab === 'x' && <ComponentName .../>}
// ============================================================
for (const { key, expr } of [
  { key: 'orders', expr: "{activeTab === 'orders' && <OrdersContent" },
  { key: 'chat',   expr: "{activeTab === 'chat' && <ChatContent" },
  { key: 'requests', expr: "{activeTab === 'requests' && <RequestsContent" },
]) {
  let idx = c.indexOf(expr);
  if (idx === -1) { console.log(`⚠️ ${key}: not found`); continue; }
  const closeTag = c.indexOf('/>', idx);
  if (closeTag === -1 || closeTag > idx + 30000) { console.log(`⚠️ ${key}: no />`); continue; }
  let br = closeTag + 2;
  while (br < c.length && (c[br] === ' ' || c[br] === '\n' || c[br] === '\r')) br++;
  if (c[br] !== '}') { console.log(`⚠️ ${key}: no } after />`); continue; }

  // Insert <AnimatePresence> before {
  c = c.slice(0, idx) + '<AnimatePresence mode="wait">' + c.slice(idx);
  br += '<AnimatePresence mode="wait">'.length;

  // Insert motion.div before the component tag
  const compTag = c.indexOf('<', idx + '<AnimatePresence mode="wait">'.length);
  c = c.slice(0, compTag) + motionDivWidget(key) + c.slice(compTag);
  br += motionDivWidget(key).length;

  // Replace } with }</AnimatePresence></motion.div>
  c = c.slice(0, br) + '}</AnimatePresence></motion.div>' + c.slice(br + 1);
  console.log(`✅ ${key} tab`);
}

// ============================================================
// 2. ROOMS TAB: {activeTab === 'rooms' && (<div>...</div>)}
// ============================================================
let ri = c.indexOf("{activeTab === 'rooms' && (");
if (ri > -1) {
  const closeBrace = findCloseBrace(c, ri);
  if (closeBrace > -1) {
    // Insert AnimatePresence before {
    c = c.slice(0, ri) + '<AnimatePresence mode="wait">' + c.slice(ri);
    const afterOpen = ri + '<AnimatePresence mode="wait">'.length + "{activeTab === 'rooms' && (".length - 1;
    const theDiv = c.indexOf('<div', afterOpen);
    if (theDiv > -1 && theDiv < closeBrace + '<AnimatePresence mode="wait">'.length + 5000) {
      c = c.slice(0, theDiv) + motionDivTag('rooms') + c.slice(theDiv + 4);
    }
    const closeDiv = c.lastIndexOf('</div>', closeBrace + 30000);
    if (closeDiv > -1) {
      c = c.slice(0, closeDiv) + '</motion.div>' + c.slice(closeDiv + 6);
    }
    // Find the actual closing } after all modifications
    const apIdx = c.indexOf('<AnimatePresence', ri);
    if (apIdx > -1) {
      const closeB = findCloseBrace(c, apIdx + '<AnimatePresence mode="wait">'.length - 1);
      if (closeB > -1) {
        c = c.slice(0, closeB + 1) + '</AnimatePresence>' + c.slice(closeB + 1);
      }
    }
    console.log('✅ Rooms tab');
  } else {
    console.log('⚠️ Rooms: no closing }');
  }
} else {
  console.log('⚠️ Rooms: not found');
}

// ============================================================
// 3. IIFE TABS: Housekeeping, Reports, Attendance
// Pattern: {activeTab === 'x' && (() => { ... return (<tag>...</tag>); })()}
// ============================================================
for (const tab of [
  { key: 'housekeeping', expr: "{activeTab === 'housekeeping' && (() => {" },
  { key: 'reports',      expr: "{activeTab === 'reports' && (() => {" },
  { key: 'attendance',   expr: "{activeTab === 'attendance' && (() => {" },
]) {
  let ii = c.indexOf(tab.expr);
  if (ii === -1) { console.log(`⚠️ ${tab.key}: not found`); continue; }

  // Use brace-depth tracking from opening {
  const closeBrace = findCloseBrace(c, ii);
  if (closeBrace === -1) { console.log(`⚠️ ${tab.key}: no closing }`); continue; }

  // Insert AnimatePresence before {
  c = c.slice(0, ii) + '<AnimatePresence mode="wait">' + c.slice(ii);
  const shift = '<AnimatePresence mode="wait">'.length;
  const bodyStart = ii + shift + tab.expr.length;

  // Find return ( and wrap the outermost element
  const retIdx = c.indexOf('return (', bodyStart);
  if (retIdx > -1 && retIdx < closeBrace + shift + 5000) {
    let d = 1, j = retIdx + 8;
    while (j < c.length && d > 0) {
      if (c[j] === '(') d++;
      else if (c[j] === ')') d--;
      j++;
    }
    const closeRet = j - 1;
    const retContent = c.slice(retIdx + 8, closeRet);
    const tagMatch = retContent.match(/<(\w+)(\s|>)/);
    if (tagMatch) {
      const tagName = tagMatch[1];
      const ts = tagMatch.index;
      const tl = tagMatch[0].length - 1;
      const closeTagStr = `</${tagName}>`;
      const cti = retContent.lastIndexOf(closeTagStr);
      if (cti > ts) {
        const newR = retContent.slice(0, ts) + motionDivTag(tab.key) + retContent.slice(ts + tl);
        const sft = motionDivTag(tab.key).length - tl;
        const finR = newR.slice(0, cti + sft) + '</motion.div>' + newR.slice(cti + sft + closeTagStr.length);
        c = c.slice(0, retIdx + 8) + finR + c.slice(closeRet);
      }
    }
  }

  // Find the actual closing } after modifications
  const apIdx = c.indexOf('<AnimatePresence', ii);
  if (apIdx > -1) {
    const cb = findCloseBrace(c, apIdx + '<AnimatePresence mode="wait">'.length - 1);
    if (cb > -1) {
      c = c.slice(0, cb + 1) + '</AnimatePresence>' + c.slice(cb + 1);
      console.log(`✅ ${tab.key} tab`);
    } else {
      console.log(`⚠️ ${tab.key}: no closing } after modifications`);
    }
  }
}

if (c !== orig) {
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ File saved');
} else {
  console.log('⚠️ No changes');
}
