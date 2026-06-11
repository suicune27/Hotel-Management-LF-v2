export function createDebouncedSync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number = 5000
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: ((value: Awaited<ReturnType<T>> | undefined) => void) | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debouncedFn = (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | undefined> => {
    lastArgs = args;
    if (timer) clearTimeout(timer);

    return new Promise((resolve) => {
      pendingResolve = resolve;
      timer = setTimeout(async () => {
        timer = null;
        try {
          const result = await fn(...(lastArgs as Parameters<T>));
          if (pendingResolve) pendingResolve(result);
        } catch (error) {
          if (pendingResolve) pendingResolve(undefined);
          console.error('Debounced sync failed:', error);
        } finally {
          pendingResolve = null;
        }
      }, delay);
    });
  };

  debouncedFn.flush = async () => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      timer = null;
      const result = await fn(...(lastArgs as Parameters<T>));
      if (pendingResolve) pendingResolve(result);
      pendingResolve = null;
      return result;
    }
    return undefined;
  };

  debouncedFn.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingResolve = null;
    lastArgs = null;
  };

  return debouncedFn as any;
}
