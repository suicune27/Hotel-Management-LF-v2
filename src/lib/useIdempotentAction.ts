import { useCallback, useRef } from 'react';

type AsyncFn = (...args: any[]) => Promise<any>;

/**
 * Hook that prevents an async action from being invoked more than once at a time.
 * Optionally accepts a dedupKey — if provided, only one action with that key runs at a time.
 */
export function useIdempotentAction<T extends AsyncFn>(fn: T, dedupKey?: string) {
  const inFlight = useRef(new Map<string, boolean>());

  return useCallback(async (...args: any[]) => {
    const key = dedupKey ?? '__global__';
    if (inFlight.current.get(key)) return;
    inFlight.current.set(key, true);
    try {
      return await fn(...args);
    } finally {
      inFlight.current.set(key, false);
    }
  }, [fn, dedupKey]);
}
