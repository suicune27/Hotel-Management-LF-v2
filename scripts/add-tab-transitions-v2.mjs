import fs from 'fs';

const filePath = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(filePath, 'utf8');
const orig = c;

// motionDiv helpers
const motionDivWrap = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;
const motionDivRepl = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}`;

/**
 * Find the index of the closing brace `}` that matches the opening `{` at startIdx.
 * Handles strings, template literals, and regex literals.
 */
function findMatchingBrace(s, startIdx) {
  if (s[startIdx] !== '{') return -1;
  let depth = 1;
  let i = startIdx + 1;
  while (i < s.length && depth > 0) {
    const ch = s[i];
    // String literals
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < s.length) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }
    // Template literals
    if (ch === '`') {
      i++;
      while (i < s.length) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === '`') break;
        if (s[i] === '$' && s[i + 1] === '{') {
          // Template expression - find the matching }
          const exprClose = findMatchingBrace(s, i + 1);
          if (exprClose === -1) return -1;
          i = exprClose + 1;
          continue;
        }
        i++;
      }
      i++;
      continue;
    }
    // Line comments
    if (ch === '/' && s[i + 1] === '/') {
      i += 2;
      while (i < s.length && s[i] !== '\n') i++;
      i++;
      continue;
    }
    // Block comments
    if (ch === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      if (i < s.length) i += 2;
      continue;
    }
    // Regex literals (heuristic: after operator or return)
    if (ch === '/') {
      const prev = s.slice(Math.max(0, i - 20), i).trimEnd();
      const lastChar = prev[prev.length - 1];
      if (lastChar === '=' || lastChar === '(' || lastChar === '&' || lastChar === '|' || lastChar === '!' || lastChar === '{' || lastChar === ';' || lastChar === ' ' || prev.endsWith('return') || prev.endsWith('case') || prev.endsWith('typeof') || prev.endsWith('instanceof')) {
        // This is likely a regex literal
        i++;
        while (i < s.length && s[i] !== '/') {
          if (s[i] === '\\') i++;
          i++;
        }
        i++; // skip closing /
        // Skip flags
        while (i < s.length && /[gimsuy]/.test(s[i])) i++;
        continue;
      }
    }
    // Track braces
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

// ============================================================
// 1. COMPONENT TABS: Orders, Chat, Requests
// Pattern: {activeTab === 'x' && <ComponentName ...props... />}
// ============================================================
const componentTabs = [
  { key: 'orders', expr: "{activeTab === 'orders' && <OrdersContent" },
  { key: 'chat', expr: "{activeTab === 'chat' && <ChatContent" },
  { key: 'requests', expr: "{activeTab === 'requests' && <RequestsContent" },
];

for (const tab of componentTabs) {
  let idx = c.indexOf(tab.expr);
  if (idx === -1) { console.log(`⚠️ ${tab.key}: component not found`); continue; }

  // Find the /> that closes the component
  const closeTag = c.indexOf('/>', idx);
  if (closeTag === -1 || closeTag > idx + 30000) { 
    console.log(`⚠️ ${tab.key}: no /> found`); 
    continue; 
  }

  // Find the } after /> that closes the JSX expression
  let closeBrace = closeTag + 2;
  while (closeBrace < c.length && (c[closeBrace] === ' ' || c[closeBrace] === '\n' || c[closeBrace] === '\r')) closeBrace++;
  if (c[closeBrace] !== '}') { 
    console.log(`⚠️ ${tab.key}: no } after /> (found '${c[closeBrace]}')`); 
    continue; 
  }

  // Insert AnimatePresence before {
  c = c.slice(0, idx) + '<AnimatePresence mode="wait">' + c.slice(idx);
  closeBrace += '<AnimatePresence mode="wait">'.length;

  // Insert motion.div before the component tag
  const compStart = c.indexOf('<', idx + '<AnimatePresence mode="wait">'.length);
  c = c.slice(0, compStart) + motionDivWrap(tab.key) + c.slice(compStart);
  closeBrace += motionDivWrap(tab.key).length;

  // Replace `}` with `}</AnimatePresence></motion.div>`
  c = c.slice(0, closeBrace) + '}</AnimatePresence></motion.div>' + c.slice(closeBrace + 1);
  console.log(`✅ ${tab.key} tab wrapped`);
}

// ============================================================
// 2. ROOMS TAB: {activeTab === 'rooms' && (<div>...</div>)}
// ============================================================
const roomsExpr = "{activeTab === 'rooms' && (";
let ri = c.indexOf(roomsExpr);
if (ri > -1) {
  // The opening { starts the JSX expression
  // Track brace depth to find the matching }
  const openBrace = ri;
  const closeBrace = findMatchingBrace(c, openBrace);
  
  if (closeBrace > -1) {
    // Insert AnimatePresence before {
    c = c.slice(0, ri) + '<AnimatePresence mode="wait">' + c.slice(ri);
    const shift = '<AnimatePresence mode="wait">'.length;
    const newCloseBrace = closeBrace + shift;
    
    // Find the outer <div> inside the expression
    const afterOpen = ri + shift + roomsExpr.length - 1; // right after '('
    const theDiv = c.indexOf('<div', afterOpen);
    if (theDiv > -1 && theDiv < newCloseBrace) {
      // Replace <div with motionDivRepl (preserves attributes)
      c = c.slice(0, theDiv) + motionDivRepl('rooms') + c.slice(theDiv + 4);
      
      // Find and replace </div> with </motion.div>
      // Search for </div> near the end, before the )}
      const lastCloseDiv = c.lastIndexOf('</div>', newCloseBrace + motionDivRepl('rooms').length - 4);
      if (lastCloseDiv > -1 && lastCloseDiv < newCloseBrace + motionDivRepl('rooms').length - 4 + 200) {
        c = c.slice(0, lastCloseDiv) + '</motion.div>' + c.slice(lastCloseDiv + 6);
      }
    }
    
    // Insert </AnimatePresence> after the closing }
    // closeBrace is the index of }
    // After the motion.div replacement, the closeBrace may have shifted
    const finalCloseBrace = c.lastIndexOf('}', c.lastIndexOf('<AnimatePresence') + 5000);
    // Actually, let me find the exact position of the closing }
    // The original closeBrace was at closeBrace + shift
    // After modifications (theDiv and lastCloseDiv), it shifted
    // Let me find it by looking for the )} pattern near the expected position
    const searchFrom = afterOpen;
    let braceDepth = 1;
    let j = searchFrom;
    while (j < c.length && braceDepth > 0) {
      const openB = c.indexOf('{', j);
      const closeB = c.indexOf('}', j);
      if (closeB === -1) break;
      if (openB !== -1 && openB < closeB) {
        braceDepth++;
        j = openB + 1;
      } else {
        braceDepth--;
        if (braceDepth === 0) {
          // This is the matching }
          c = c.slice(0, closeB + 1) + '</AnimatePresence>' + c.slice(closeB + 1);
          console.log('✅ Rooms tab wrapped');
          break;
        }
        j = closeB + 1;
      }
    }
  } else {
    console.log('⚠️ Rooms: could not find closing }');
  }
} else {
  console.log('⚠️ Rooms: pattern not found');
}

// ============================================================
// 3. IIFE TABS: Housekeeping, Reports, Attendance
// Pattern: {activeTab === 'x' && (() => { ... return ( <tag>...</tag> ); })()}
// ============================================================
const iifeTabs = [
  { key: 'housekeeping', expr: "{activeTab === 'housekeeping' && (() => {" },
  { key: 'reports', expr: "{activeTab === 'reports' && (() => {" },
  { key: 'attendance', expr: "{activeTab === 'attendance' && (() => {" },
];

for (const tab of iifeTabs) {
  let ii = c.indexOf(tab.expr);
  if (ii === -1) { console.log(`⚠️ ${tab.key}: pattern not found`); continue; }

  // The opening { starts the JSX expression
  const openBrace = ii;
  
  // Use brace depth tracking to find the matching }
  // But first we need to handle the IIFE's inner structure
  // The IIFE body starts with { after =>
  // We need to track ALL braces correctly
  
  const closeBrace = findMatchingBrace(c, openBrace);
  
  if (closeBrace === -1) {
    console.log(`⚠️ ${tab.key}: could not find closing }`);
    continue;
  }

  // Insert AnimatePresence before {
  c = c.slice(0, ii) + '<AnimatePresence mode="wait">' + c.slice(ii);
  const shiftAP = '<AnimatePresence mode="wait">'.length;
  const modCloseBrace = closeBrace + shiftAP;

  // Find return ( inside the IIFE
  const bodyStart = ii + shiftAP + tab.expr.length;
  let retIdx = c.indexOf('return (', bodyStart);
  
  if (retIdx > -1 && retIdx < modCloseBrace) {
    // Find the matching ) for return (
    let retDepth = 1;
    let closeRet = retIdx + 8;
    while (closeRet < c.length && retDepth > 0) {
      if (c[closeRet] === '(') retDepth++;
      else if (c[closeRet] === ')') retDepth--;
      closeRet++;
    }
    closeRet--;
    
    // The returned JSX is between retIdx+8 and closeRet
    const retContent = c.slice(retIdx + 8, closeRet);
    
    // Find the outermost tag
    const tagMatch = retContent.match(/<(\w+)(\s|>)/);
    if (tagMatch) {
      const tagName = tagMatch[1];
      const tagStart = tagMatch.index;
      const tagLen = tagMatch[0].length - 1;
      const closeTagStr = `</${tagName}>`;
      const closeTagIdx = retContent.lastIndexOf(closeTagStr);
      
      if (closeTagIdx > tagStart) {
        // Replace opening tag with motion.div
        const newContent = 
          retContent.slice(0, tagStart) +
          motionDivRepl(tab.key) +
          retContent.slice(tagStart + tagLen);
        
        // Replace closing tag with </motion.div>
        const shift = motionDivRepl(tab.key).length - tagLen;
        const finalContent = 
          newContent.slice(0, closeTagIdx + shift) +
          '</motion.div>' +
          newContent.slice(closeTagIdx + shift + closeTagStr.length);
        
        c = c.slice(0, retIdx + 8) + finalContent + c.slice(closeRet);
      }
    }
  }

  // Insert </AnimatePresence> after the closing }
  // The closing } is the original closeBrace + shiftAP adjusted for any content shifts
  // The simplest approach: find the last } that's near where we expect it
  // After the return content modification, find the closing by searching forward
  const searchFrom = ii + shiftAP + tab.expr.length;
  let braceDepth = 1;
  let j = searchFrom;
  let foundClose = -1;
  while (j < c.length && braceDepth > 0) {
    // Skip strings and template literals for accuracy
    const openB = c.indexOf('{', j);
    const closeB = c.indexOf('}', j);
    if (closeB === -1) break;
    if (openB !== -1 && openB < closeB) {
      braceDepth++;
      j = openB + 1;
    } else {
      braceDepth--;
      if (braceDepth === 0) {
        foundClose = closeB;
        break;
      }
      j = closeB + 1;
    }
  }
  
  if (foundClose > -1) {
    c = c.slice(0, foundClose + 1) + '</AnimatePresence>' + c.slice(foundClose + 1);
    console.log(`✅ ${tab.key} tab wrapped`);
  } else {
    console.log(`⚠️ ${tab.key}: could not find final closing }`);
    // Fallback to original approach
    c = c.slice(0, modCloseBrace + 1) + '</AnimatePresence>' + c.slice(modCloseBrace + 1);
    console.log(`⚠️ ${tab.key}: used fallback closing`);
  }
}

if (c !== orig) {
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ File saved');
} else {
  console.log('⚠️ No changes made');
}
