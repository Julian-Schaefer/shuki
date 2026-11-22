import { useCallback, useState } from "react";

export function useLocalStorage<T extends string>(
  key: string,
  defaultValue: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored && allowed.includes(stored) ? stored : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage unavailable – keep the in-memory value.
      }
    },
    [key],
  );

  return [value, update];
}
