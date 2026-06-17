import fs from 'fs';

const filePath = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(filePath, 'utf8');
const orig = c;

const motionDiv = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;

// Helper: find matching closing paren/brace from startIdx
function findClose(s, start, open, close) {
  let depth = 1;
  let i = start + 1;
  let inStr = false, strChar = '';
  while (i < s.length && depth > 0) {
    const ch = s[i];
    if (inStr) {
      if (ch === strChar && s[i - 1] !== '\\') inStr = false;
    } else {
      if (ch === "'" || ch === '"' || ch === '`') { inStr = true; strChar = ch; }
      else if (ch === open) depth++;
      else if (ch === close) depth--;
    }
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

// ============================
// 1. ROOMS TAB: {activeTab === 'rooms' && (<div...>...</div>)}
// ============================
const roomsExpr = "{activeTab === 'rooms' && (";
let idx = c.indexOf(roomsExpr);
if (idx > -1) {
  const openParen = idx + roomsExpr.length - 1; // '(' after &&
  const closeParen = findClose(c, openParen, '(', ')');
  if (closeParen > -1 && c[closeParen + 1] === '}') {
    // Insert AnimatePresence before opening {
    const before = c.slice(0, idx);
    const expr = c.slice(idx, idx + roomsExpr.length - 1); // {activeTab === 'rooms' && 
    const rest = c.slice(idx + roomsExpr.length - 1, closeParen + 2); // (... )}
    // Replace the opening (<div... with <motion.div...
    const restStart = rest.indexOf('(');
    const divStart = rest.indexOf('<div', restStart);
    if (divStart > -1) {
      const modRest = rest.slice(0, divStart) + '<' + motionDiv('rooms') + rest.slice(divStart + 5); // replace <div with motion.div
      // Now find the closing </div> before the final )}
      const lastDivClose = modRest.lastIndexOf('</div>');
      if (lastDivClose > -1) {
        const finalRest = modRest.slice(0, lastDivClose) + '</motion.div>' + modRest.slice(lastDivClose + 6);
        c = before + '<AnimatePresence mode="wait">' + expr + '(' + finalRest.slice(1) + '</AnimatePresence>';
        console.log('✅ Rooms tab wrapped');
      } else {
        console.log('⚠️ Rooms: could not find closing </div>');
      }
    } else {
      console.log('⚠️ Rooms: could not find <div');
    }
  } else {
    console.log(`⚠️ Rooms: no closing )} at ${closeParen}, next char: ${c[closeParen + 1]}`);
  }
} else {
  console.log('⚠️ Rooms: pattern not found');
}

// ============================
// 2. IIFE TABS: {activeTab === 'x' && (() => { ... return (...); })()}
// ============================
const iifeTabs = [
  { key: 'housekeeping', expr: "{activeTab === 'housekeeping' && (() => {", nextMarker: 'REPORTS' },
  { key: 'reports', expr: "{activeTab === 'reports' && (() => {", nextMarker: 'ATTENDANCE' },
  { key: 'attendance', expr: "{activeTab === 'attendance' && (() => {", nextMarker: null },
];

for (const tab of iifeTabs) {
  idx = c.indexOf(tab.expr);
  if (idx === -1) { console.log(`⚠️ ${tab.key}: pattern not found`); continue; }

  // Find the closing })()}
  let closeMarker;
  if (tab.nextMarker) {
    // Find the next tab's marker
    const markerIdx = c.indexOf(tab.nextMarker, idx + tab.expr.length);
    if (markerIdx === -1) { console.log(`⚠️ ${tab.key}: next marker not found`); continue; }
    // Search backwards from marker for })()}
    closeMarker = c.lastIndexOf('})()', markerIdx);
    // But make sure there's only whitespace between })()} and the marker
  } else {
    // Last tab - search from near end
    closeMarker = c.lastIndexOf('})()');
  }

  if (closeMarker === -1 || closeMarker < idx) {
    console.log(`⚠️ ${tab.key}: no })() found`);
    continue;
  }

  // Find the } after })()
  const afterIife = closeMarker + 4; // after '})()'
  let closeBrace = afterIife;
  while (closeBrace < c.length && (c[closeBrace] === ' ' || c[closeBrace] === '\n' || c[closeBrace] === '\r')) closeBrace++;
  if (c[closeBrace] !== '}') {
    console.log(`⚠️ ${tab.key}: no } after })() (found '${c[closeBrace]}' at ${closeBrace})`);
    continue;
  }

  // Now we have:
  // idx -> opening { of {activeTab === 'x' && (() => {
  // closeMarker -> '})()' position
  // closeBrace -> '}' position
  
  // Step 1: Insert <AnimatePresence mode="wait"> before the opening {
  c = c.slice(0, idx) + '<AnimatePresence mode="wait">' + c.slice(idx);
  
  // Adjust closeMarker and closeBrace positions
  const shift = '<AnimatePresence mode="wait">'.length;
  closeMarker += shift;
  closeBrace += shift;

  // Step 2: Wrap the return value inside the IIFE with motion.div
  // Find 'return (' within the IIFE
  const iifeBodyStart = idx + '<AnimatePresence mode="wait">'.length + tab.expr.length;
  const retIdx = c.indexOf('return (', iifeBodyStart);
  if (retIdx > -1 && retIdx < closeMarker) {
    // The return value is wrapped in (...)
    const retOpenParen = retIdx + 7; // after 'return ('
    const retCloseParen = findClose(c, retOpenParen, '(', ')');
    if (retCloseParen > -1 && retCloseParen < closeMarker) {
      // The return content is between retOpenParen+1 and retCloseParen-1
      const returnContent = c.slice(retOpenParen + 1, retCloseParen);
      // Check if the first child is a <tag
      const firstTag = returnContent.search(/<\w/);
      if (firstTag > -1) {
        const tagStart = returnContent.slice(firstTag);
        const tagMatch = tagStart.match(/<(\w+)\b/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          // Replace the opening <tagName with <motion.div key="..."...>
          const openTagMatch = returnContent.match(new RegExp(`<${tagName}[\\s>]`));
          if (openTagMatch) {
            const openTagIdx = openTagMatch.index;
            const openTagLen = openTagMatch[0].length;
            // Replace the closing </tagName> with </motion.div>
            const closeTag = `</${tagName}>`;
            const closeTagIdx = returnContent.lastIndexOf(closeTag);
            if (closeTagIdx > -1) {
              const modReturn =
                returnContent.slice(0, openTagIdx) +
                motionDiv(tab.key) +
                returnContent.slice(openTagIdx + openTagLen - 1); // keep the '>' or space+'>'
              
              const finalReturn =
                modReturn.slice(0, closeTagIdx) +
                '</motion.div>' +
                modReturn.slice(closeTagIdx + closeTag.length);

              c = c.slice(0, retOpenParen + 1) + finalReturn + c.slice(retCloseParen);
              
              // Recalculate closeMarker and closeBrace since we shifted content
              const newShift = finalReturn.length - returnContent.length;
              closeMarker += newShift;
              closeBrace += newShift;
            }
          }
        }
      }
    }
  }

  // Step 3: Close the AnimatePresence
  // After the closing } which is at closeBrace
  // Replace '})()}' with '})()}</AnimatePresence>'
  // Wait, closeBrace points to the '}' of the JSX expression
  // And closeMarker points to '})()'
  // So the closing sequence spans from closeMarker to closeBrace
  // e.g. ...  })()}  ... and we want ...  })()}</AnimatePresence>
  
  // Actually, we already have c = c.slice(0, idx) + '<AnimatePresence mode="wait">' + c.slice(idx)
  // The '})()}' after shift was at original closeMarker+shift to closeBrace
  
  // We inserted at the beginning. Let me just find the actual closing now
  // The opening { was at original idx. Now it's at idx + shift.
  // The closing } is at closeBrace.
  
  // Just insert </AnimatePresence> after the closing }
  c = c.slice(0, closeBrace + 1) + '</AnimatePresence>' + c.slice(closeBrace + 1);
  
  console.log(`✅ ${tab.key} tab wrapped`);
}

if (c !== orig) {
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ File saved');
} else {
  console.log('⚠️ No changes');
}
