import { useState, useEffect, useCallback } from "react";

/**
 * Hook to trigger highlight/flash animations on elements
 * Returns a ref to attach to the element and a trigger function
 */
export function useHighlight(duration: number = 2000) {
  const [isHighlighted, setIsHighlighted] = useState(false);

  const trigger = useCallback(() => {
    setIsHighlighted(true);
    setTimeout(() => {
      setIsHighlighted(false);
    }, duration);
  }, [duration]);

  return { isHighlighted, trigger };
}

/**
 * Hook to automatically trigger highlight when a dependency changes
 */
export function useHighlightOnChange<T>(
  value: T,
  duration: number = 2000,
  skip: boolean = false
) {
  const { isHighlighted, trigger } = useHighlight(duration);
  const [prevValue, setPrevValue] = useState(value);

  useEffect(() => {
    if (!skip && value !== prevValue && prevValue !== undefined) {
      trigger();
    }
    setPrevValue(value);
  }, [value, prevValue, trigger, skip]);

  return { isHighlighted, trigger };
}
