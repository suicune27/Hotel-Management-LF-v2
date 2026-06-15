/**
 * Runtime error logger for diagnosing production crashes (e.g., white page on Vercel).
 *
 * Captures:
 *   - window.onerror (uncaught exceptions)
 *   - window.onunhandledrejection (unhandled Promise rejections)
 *   - Explicit calls via logError()
 *
 * Stores the last 50 errors in memory so they can be inspected via
 * the browser console (__hotelErrors) or queried from any component.
 */

export interface LoggedError {
  id: number;
  timestamp: string;
  type: 'error' | 'unhandledrejection' | 'react';
  message: string;
  source: string;
  lineno: number;
  colno: number;
  stack: string;
  url: string;
  userAgent: string;
}

const MAX_ERRORS = 50;
const errors: LoggedError[] = [];
let errorCounter = 0;

function makeError(
  type: LoggedError['type'],
  message: string,
  source: string,
  lineno: number,
  colno: number,
  stack: string,
): LoggedError {
  return {
    id: ++errorCounter,
    timestamp: new Date().toISOString(),
    type,
    message,
    source,
    lineno,
    colno,
    stack,
    url: window.location.href,
    userAgent: navigator.userAgent,
  };
}

function push(err: LoggedError) {
  errors.push(err);
  if (errors.length > MAX_ERRORS) errors.shift();
  // Also log to console for DevTools visibility
  console.error(`[ErrorLogger #${err.id}] ${err.type}: ${err.message}`, err);
}

/** Return a copy of all captured errors. */
export function getLoggedErrors(): LoggedError[] {
  return [...errors];
}

/** Manually log a caught exception. */
export function logError(error: unknown, type: LoggedError['type'] = 'error') {
  const err = error instanceof Error ? error : new Error(String(error));
  push(makeError(type, err.message, err.stack?.split('\n')[0] || '', 0, 0, err.stack || ''));
}

/** Initialize window-level error handlers. Call once at app startup. */
export function initErrorLogger() {
  if (typeof window === 'undefined') return;

  // Uncaught exceptions
  window.onerror = (msg, source, lineno, colno, error) => {
    const message = typeof msg === 'string' ? msg : String(msg);
    const stack = error instanceof Error ? error.stack || '' : '';
    push(makeError('error', message, source || '', lineno || 0, colno || 0, stack));
    // Don't prevent default browser error handling
    return false;
  };

  // Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    push(makeError('unhandledrejection', err.message, err.stack?.split('\n')[0] || '', 0, 0, err.stack || ''));
  };

  // Expose errors in console for easy inspection
  Object.defineProperty(window, '__hotelErrors', {
    get: () => getLoggedErrors(),
    configurable: true,
  });

  console.log('[ErrorLogger] Initialized. Type window.__hotelErrors to inspect captured errors.');
}
