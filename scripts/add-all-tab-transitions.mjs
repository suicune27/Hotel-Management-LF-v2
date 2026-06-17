import fs from 'fs';

const filePath = 'src/components/FrontDeskPanel.tsx';
let c = fs.readFileSync(filePath, 'utf8');
const orig = c;

// For wrapping around components (e.g. <OrdersContent />)
const motionDivWrap = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;
// For replacing inline tags (e.g. <div className="..."> -> motion.div preserves attrs)
const motionDivRepl = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}`;

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

  // The component is self-closing: <ComponentName ... />
  // Find the /> that closes it
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

  // Replace opening: add `<AnimatePresence mode="wait">` before `{`
  c = c.slice(0, idx) + '<AnimatePresence mode="wait">' + c.slice(idx);
  closeBrace += '<AnimatePresence mode="wait">'.length; // shift

  // Insert <motion.div> after the opening tag's `>`
  // The opening tag ends with `>` or `/>` — but we already have the self-closing />
  // We need to find the end of the opening tag. Actually, for self-closing components,
  // the opening IS the closing. So we convert:
  // <OrdersContent ... />   ->   <motion.div key="orders" ...><OrdersContent ... /></motion.div>
  
  // Insert <motion.div key="..."> before the opening <
  const openTag = c.lastIndexOf('<', idx + 500); // Find the < of the opening tag
  // Actually, the expr already ends with <OrdersContent, so the < is right there
  // Let me just do it differently: insert motion.div right before <OrdersContent
  const compStart = c.indexOf('<', idx); // the < before OrdersContent
  c = c.slice(0, compStart) + motionDivWrap(tab.key) + c.slice(compStart);
  closeBrace += motionDivWrap(tab.key).length; // shift again

  // Now replace `/>}` with `/></motion.div>}` — but we need to account for the shifts
  // closeBrace originally pointed to `}`, now it shifted. The `/>` is still at closeTag + some shift
  // Let me find the /> again from scratch
  const newCloseTag = c.indexOf('/>', compStart);
  if (newCloseTag > -1) {
    // Find the } after />
    let nb = newCloseTag + 2;
    while (nb < c.length && (c[nb] === ' ' || c[nb] === '\n' || c[nb] === '\r')) nb++;
    if (c[nb] === '}') {
      c = c.slice(0, nb) + '}</AnimatePresence></motion.div>' + c.slice(nb + 1);
      console.log(`✅ ${tab.key} tab wrapped`);
    } else {
      console.log(`⚠️ ${tab.key}: can't find closing } after modifications`);
    }
  } else {
    console.log(`⚠️ ${tab.key}: can't find /> after modifications`);
  }
}

// ============================================================
// 2. ROOMS TAB: {activeTab === 'rooms' && (<div>...</div>)}
// ============================================================
const roomsExpr = "{activeTab === 'rooms' && (";
let ri = c.indexOf(roomsExpr);
if (ri > -1) {
  // Find the outer <div> (the first <div after the opening)
  const firstDiv = c.indexOf('<div', ri + roomsExpr.length);
  if (firstDiv > -1) {
    // Find the matching </div> for the outer div
    // Track depth of <div> vs </div>
    let divDepth = 1;
    let closeDiv = -1;
    let searchPos = firstDiv + 5; // after '<div'
    while (searchPos < c.length && divDepth > 0) {
      const nextOpen = c.indexOf('<div', searchPos);
      const nextClose = c.indexOf('</div>', searchPos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        divDepth++;
        searchPos = nextOpen + 5;
      } else {
        divDepth--;
        searchPos = nextClose + 6;
        if (divDepth === 0) closeDiv = nextClose;
      }
    }
    
    if (closeDiv > -1) {
      // Find the closing )} after the </div>
      let closeBrace = closeDiv + 6;
      let foundParen = false;
      while (closeBrace < c.length) {
        if (c[closeBrace] === ')') { foundParen = true; break; }
        if (c[closeBrace] === '}' && foundParen) break;
        if (c[closeBrace] !== ' ' && c[closeBrace] !== '\n' && c[closeBrace] !== '\r') { closeBrace = -1; break; }
        closeBrace++;
      }
      
      // Actually, let me find where the wrapping () closes
      // The rooms expr opens with {activeTab === 'rooms' && (
      // Where is the matching )?
      const openParen = ri + roomsExpr.length - 1; // '('
      let parenDepth = 1;
      let closeParen = openParen + 1;
      while (closeParen < c.length && parenDepth > 0) {
        if (c[closeParen] === '(') parenDepth++;
        else if (c[closeParen] === ')') parenDepth--;
        closeParen++;
      }
      closeParen--; // back to the )
      
      // Now the } should be right after )
      if (c[closeParen + 1] === '}') {
        // Insert AnimatePresence before {
        c = c.slice(0, ri) + '<AnimatePresence mode="wait">' + c.slice(ri);
        closeParen += '<AnimatePresence mode="wait">'.length;
        // change <div to <motion.div key="rooms" ...>
        // Find the actual <div after the shift
        const newRoomsExpr = "<AnimatePresence mode=\"wait\">{activeTab === 'rooms' && (";
        const newRi = c.indexOf(newRoomsExpr);
        const afterParen = newRi + newRoomsExpr.length - 1;
        const theDiv = c.indexOf('<div', afterParen);
        if (theDiv > -1) {
          c = c.slice(0, theDiv) + motionDivRepl('rooms') + c.slice(theDiv + 4); // replace '<div' keeping the space after
          closeParen += motionDivRepl('rooms').length - 4;
        }
        // Replace </div> before the )} with </motion.div>
        const lastCloseDiv = c.lastIndexOf('</div>', closeParen);
        if (lastCloseDiv > -1) {
          c = c.slice(0, lastCloseDiv) + '</motion.div>' + c.slice(lastCloseDiv + 6);
          // Adjust closeParen
          closeParen += '</motion.div>'.length - 6;
        }
        // Close AnimatePresence after }
        c = c.slice(0, closeParen + 2) + '</AnimatePresence>' + c.slice(closeParen + 2);
        console.log('✅ Rooms tab wrapped');
      } else {
        console.log(`⚠️ Rooms: char after ) is '${c[closeParen + 1]}' not }`);
      }
    } else {
      console.log('⚠️ Rooms: no matching </div> found');
    }
  } else {
    console.log('⚠️ Rooms: no outer <div> found');
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

// Known markers that come after each IIFE tab
const nextMarkers = [
  "{/* ===== REPORTS / NIGHT AUDIT TAB ===== */}",
  "{/* ===== ATTENDANCE TAB ===== */}",
  null, // last tab - end of file
];

for (let ti = 0; ti < iifeTabs.length; ti++) {
  const tab = iifeTabs[ti];
  const nextMarker = nextMarkers[ti];
  
  let ii = c.indexOf(tab.expr);
  if (ii === -1) { console.log(`⚠️ ${tab.key}: pattern not found`); continue; }

  // Find the closing })()}
  let closeIife;
  if (nextMarker) {
    const markerIdx = c.indexOf(nextMarker, ii + tab.expr.length);
    if (markerIdx === -1) { console.log(`⚠️ ${tab.key}: next marker not found`); continue; }
    // Look backwards from marker for })()}
    const searchFrom = Math.max(ii, markerIdx - 500);
    closeIife = c.lastIndexOf('})()', markerIdx);
    if (closeIife < ii) closeIife = -1;
  } else {
    // Last tab - find })() before the next major section
    const nextSection = c.indexOf('{hasStaffCalls && (', ii + tab.expr.length);
    if (nextSection > -1) {
      closeIife = c.lastIndexOf('})()', nextSection);
    } else {
      closeIife = c.lastIndexOf('})()');
    }
  }

  if (closeIife === -1 || closeIife < ii) {
    console.log(`⚠️ ${tab.key}: no })() found`);
    continue;
  }

  // Find the } that closes the JSX expression after })()
  let cb = closeIife + 4;
  while (cb < c.length && (c[cb] === ' ' || c[cb] === '\n' || c[cb] === '\r')) cb++;
  if (c[cb] !== '}') {
    console.log(`⚠️ ${tab.key}: no } after })() at ${cb}, found '${c[cb]}'`);
    continue;
  }

  // Step 1: Insert <AnimatePresence mode="wait"> before the opening {
  c = c.slice(0, ii) + '<AnimatePresence mode="wait">' + c.slice(ii);
  closeIife += '<AnimatePresence mode="wait">'.length;
  cb += '<AnimatePresence mode="wait">'.length;

  // Step 2: Find the return statement inside the IIFE and wrap its outermost element
  const bodyStart = ii + '<AnimatePresence mode="wait">'.length + tab.expr.length;
  const retIdx = c.indexOf('return (', bodyStart);
  if (retIdx > -1 && retIdx < closeIife) {
    // The return value starts with `return (`
    // Find matching ) for this return
    let retDepth = 1;
    let closeRet = retIdx + 8; // after 'return ('
    while (closeRet < c.length && retDepth > 0) {
      if (c[closeRet] === '(') retDepth++;
      else if (c[closeRet] === ')') retDepth--;
      closeRet++;
    }
    closeRet--; // back to the )
    
    // The returned JSX is between retIdx+8 and closeRet
    const returnContent = c.slice(retIdx + 8, closeRet);
    
    // Find the outermost opening tag
    const tagMatch = returnContent.match(/<(\w+)(\s|>)/);
    if (tagMatch) {
      const tagName = tagMatch[1];
      const tagStart = tagMatch.index;
      const tagLen = tagMatch[0].length - 1; // exclude the '>' or space, include '<'
      
      // Find the closing </tagName>
      const closeTagStr = `</${tagName}>`;
      const closeTagIdx = returnContent.lastIndexOf(closeTagStr);
      
      if (closeTagIdx > tagStart) {
        // Replace opening <tagName with motion.div (keep trailing space or >)
        const newContent = 
          returnContent.slice(0, tagStart) +
          motionDivRepl(tab.key) +
          returnContent.slice(tagStart + tagLen);
        
        // Replace closing </tagName> with </motion.div>
        // After the first replacement, closeTagIdx has shifted
        const shift = motionDivRepl(tab.key).length - tagLen;
        const finalContent = 
          newContent.slice(0, closeTagIdx + shift) +
          '</motion.div>' +
          newContent.slice(closeTagIdx + shift + closeTagStr.length);
        
        // Reconstruct the full string
        c = c.slice(0, retIdx + 8) + finalContent + c.slice(closeRet);
        
        // Adjust closeIife and cb
        const contentShift = finalContent.length - returnContent.length;
        closeIife += contentShift;
        cb += contentShift;
      }
    }
  }

  // Step 3: Close AnimatePresence after the final }
  // The closing sequence is })()}
  // closeIife points to start of '})()'
  // cb points to the }
  // We want: })()}</AnimatePresence>  — insert after cb
  c = c.slice(0, cb + 2) + '</AnimatePresence>' + c.slice(cb + 2);
  
  console.log(`✅ ${tab.key} tab wrapped`);
}

if (c !== orig) {
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ File saved');
} else {
  console.log('⚠️ No changes made');
}
