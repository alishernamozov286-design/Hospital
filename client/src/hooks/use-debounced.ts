import { useEffect, useState } from "react";

/**
 * Trailing-edge debounce. Search boxes feed this before the value reaches a
 * query key, so typing "gemoglobin" costs one request instead of ten.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
