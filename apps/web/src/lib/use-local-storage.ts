import { useCallback, useState } from "react";

/**
 * Per-browser UI preference in localStorage. Falls back to the default when
 * storage is unavailable (private mode, blocked site data).
 */
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
        // Not persisted – fine, the state still changes for this session.
      }
    },
    [key],
  );

  return [value, update];
}
