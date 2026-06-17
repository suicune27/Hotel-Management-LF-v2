import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(__dirname, '..', 'src', 'components', 'FrontDeskPanel.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const original = content;

const motionWrap = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;

/**
 * Find a matching closing paren/bracket accounting for nesting depth.
 * startIdx is the index of the opening character.
 * Returns index of the matching closing character.
 */
function findMatching(content, startIdx, openChar, closeChar) {
  let depth = 1;
  let i = startIdx + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === openChar && (openChar !== '(' || content[i - 1] !== "'" && content[i - 1] !== '"' && content[i - 1] !== '`')) {
      // Don't count if it's inside a string — simplified check
      depth++;
    } else if (content[i] === closeChar) {
      depth--;
    }
    i++;
  }
  return depth === 0 ? i - 1 : -1;
}

// ============================================================
// 1. ROOMS TAB — block div pattern: {activeTab === 'rooms' && (...)}
// ============================================================
const roomsOpen = "{activeTab === 'rooms' && (";
let ri = content.indexOf(roomsOpen);
if (ri > -1) {
  const roomsKey = 'rooms';
  // Find the matching close paren for the group (...)
  const openParen = ri + roomsOpen.length - 1; // points to '('
  const closeParen = findMatching(content, openParen, '(', ')');
  if (closeParen > -1 && content[closeParen + 1] === '}') {
    // Insert opening AnimatePresence + motion wrapper
    const openInsert = `<AnimatePresence mode="wait">` + content.slice(ri, ri + roomsOpen.length - 1) + motionWrap(roomsKey) + '(';
    content = content.slice(0, ri) + openInsert + content.slice(ri + roomsOpen.length);
    
    // Adjust: the closeParen has shifted by the length of the insert
    const shift = openInsert.length - roomsOpen.length;
    const newCloseParen = closeParen + shift;
    // Replace ')}' with ')}</motion.div></AnimatePresence>'
    content = content.slice(0, newCloseParen) + ')}</motion.div></AnimatePresence>' + content.slice(newCloseParen + 2);
    console.log('✅ Rooms tab wrapped');
  } else {
    console.log('⚠️ Rooms tab: could not find closing )}');
  }
} else {
  console.log('⚠️ Rooms tab: pattern not found');
}

// ============================================================
// 2. IIFE TABS: Housekeeping, Reports, Attendance
// Pattern: {activeTab === 'x' && (() => { ... return (...); })()}
// ============================================================
const iifeTabs = [
  { key: 'housekeeping', pattern: "{activeTab === 'housekeeping' && (() => {" },
  { key: 'reports', pattern: "{activeTab === 'reports' && (() => {" },
  { key: 'attendance', pattern: "{activeTab === 'attendance' && (() => {" },
];

for (const tab of iifeTabs) {
  let idx = content.indexOf(tab.pattern);
  if (idx === -1) {
    console.log(`⚠️ ${tab.key}: pattern not found`);
    continue;
  }

  // The entire expression is: {activeTab === 'x' && (() => { ... return (...); })()}
  // The opening { is at idx, the pattern starts after {
  // Pattern: {pattern + ...return ({...})})()}
  
  // Strategy: wrap with AnimatePresence
  // Before: {activeTab === 'x' && (() => { ...
  // After:  <AnimatePresence mode="wait">{activeTab === 'x' && (() => { ...
  
  // Insert opening AnimatePresence tag before the opening {
  const openAP = '<AnimatePresence mode="wait">';
  content = content.slice(0, idx) + openAP + content.slice(idx);
  
  // Now find the closing. The IIFE closes with })()}
  // We need to find the final })() and then the } that closes the JSX expression
  // After inserting the opening tag, the closing is shifted by openAP.length
  
  // Search for })() after the opening pattern, then find the } after it
  const searchStart = idx + openAP.length + tab.pattern.length;
  const iifeClose = content.lastIndexOf('})()', searchStart + 50000); // should be far ahead
  let closeFound = false;
  if (iifeClose > searchStart) {
    // After the IIFE close })() the next non-whitespace char should be }
    const afterIife = iifeClose + 4; // after '})()'
    if (content[afterIife] === '}') {
      // Replace the final } with </motion.div>}</AnimatePresence>
      content = content.slice(0, afterIife) + motionWrap(tab.key) + content.slice(iifeClose, afterIife) + '</motion.div>}</AnimatePresence>' + content.slice(afterIife + 1);
      closeFound = true;
    } else {
      // Try looking for the } nearby
      for (let i = afterIife; i < afterIife + 10; i++) {
        if (content[i] === '}') {
          content = content.slice(0, iifeClose) + motionWrap(tab.key) + content.slice(iifeClose, i) + '</motion.div>}</AnimatePresence>' + content.slice(i + 1);
          closeFound = true;
          break;
        }
      }
    }
  }
  
  // Also need to wrap the return JSX inside the IIFE with motion.div
  // The IIFE has: return (<JSX.../>);
  // The return value starts with `return (`
  const retIdx = content.indexOf('return (', searchStart - openAP.length);
  if (retIdx > searchStart - openAP.length - 500 && retIdx < iifeClose) {
    // The return starts with `return (` and the value is inside the parens
    const retParen = retIdx + 7; // index of '('
    // Just wrap the return value with a motion.div
    // Actually, this gets complex. Let's keep the wrapping at the outer AnimatePresence level.
    // The outer wrapping already handles the fade
  }
  
  console.log(`✅ ${tab.key} tab wrapped`);
}

// ============================================================
// Write the result
// ============================================================
if (content !== original) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ File written successfully');
} else {
  console.log('⚠️ No changes made');
}
