import { useState, useCallback } from "react";

/**
 * A hook that persists boolean state in localStorage.
 * Used for tool section expanded/collapsed state persistence.
 */
export function usePersistedBoolean(key: string, defaultValue: boolean): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const [state, setState] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return stored === 'true';
    } catch {
      // localStorage unavailable
    }
    return defaultValue;
  });

  const setPersistedState = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, [key]);

  return [state, setPersistedState];
}
