import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initErrorLogger } from './lib/errorLogger';

// Initialize runtime error logger before React mounts
// so window-level crashes are captured for debugging white-page issues.
initErrorLogger();

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[FATAL] #root element not found');
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    console.error('[FATAL] React mount failed:', err);
    rootEl.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:20px;text-align:center">
      <div>
        <h1 style="color:#e11d48;font-size:18px;margin-bottom:8px">Application failed to load</h1>
        <p style="color:#64748b;font-size:13px;margin-bottom:16px">${(err instanceof Error ? err.message : 'Unknown error').replace(/</g, '&lt;')}</p>
        <pre style="background:#f1f5f9;padding:12px;border-radius:8px;font-size:11px;text-align:left;max-width:100%;overflow-x:auto;color:#334155">${(err instanceof Error ? err.stack || '' : '').replace(/</g, '&lt;')}</pre>
        <button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;background:#0f172a;color:white;border:none;border-radius:8px;font-size:13px;cursor:pointer">Reload</button>
      </div>
    </div>`;
  }
}
