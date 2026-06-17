import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'src', 'components', 'FrontDeskPanel.tsx');

let content = readFileSync(filePath, 'utf-8');
const original = content;

const m = (key) =>
  `<motion.div key="${key}" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12, ease: 'easeOut' }}>`;

function wrapComponentTab(content, tabName, componentName) {
  const expr = `{activeTab === '${tabName}' && <${componentName}`;
  const idx = content.indexOf(expr);
  if (idx === -1) {
    console.log(`⚠️  ${tabName}: pattern not found`);
    return content;
  }
  const closeTag = content.indexOf('/>', idx);
  if (closeTag === -1 || closeTag > idx + 10000) {
    console.log(`⚠️  ${tabName}: no closing /> found`);
    return content;
  }
  // The component closes with />} (no wrapping parens)
  const closeBrace = content.indexOf('}', closeTag);
  if (closeBrace === -1 || closeBrace > closeTag + 30000) {
    console.log(`⚠️  ${tabName}: no closing } found after />`);
    return content;
  }
  // Replace the closing } with </motion.div>}</AnimatePresence>
  content = content.slice(0, closeBrace) + `</motion.div>}</AnimatePresence>` + content.slice(closeBrace + 1);
  // Replace the opening
  const newExpr = `<AnimatePresence mode="wait">{activeTab === '${tabName}' && ${m(tabName)}<${componentName}`;
  content = content.replace(expr, newExpr);
  console.log(`✅ ${tabName} tab wrapped`);
  return content;
}

// Only wrap the three component tabs — skip Rooms and IIFE tabs
content = wrapComponentTab(content, 'orders', 'OrdersContent');
content = wrapComponentTab(content, 'chat', 'ChatContent');
content = wrapComponentTab(content, 'requests', 'RequestsContent');

if (content !== original) {
  writeFileSync(filePath, content, 'utf-8');
  console.log('\n✅ Done!');
} else {
  console.log('⚠️  No changes made.');
}
