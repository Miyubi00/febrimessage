import { useCallback, useEffect, useRef, useState } from 'react';

import { registerNavigationGuard } from '@/lib/navigationGuard';

/**
 * Unsaved-changes guard: stops in-app navigation (bottom nav, logout, …)
 * while `dirty` and warns before leaving the site (refresh / close tab).
 *
 * When a navigation is blocked the caller shakes its form (via `shaking`)
 * and shows a confirmation dialog: [stay] keeps the user on the page,
 * [discard] lets the blocked navigation through.
 */
export function useUnsavedChangesGuard(dirty: boolean): {
  blocked: boolean;
  shaking: boolean;
  stay: () => void;
  discard: () => void;
} {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const [blocked, setBlocked] = useState(false);
  const [shaking, setShaking] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const shakeTimer = useRef(0);

  useEffect(() => {
    return registerNavigationGuard({
      isDirty: () => dirtyRef.current,
      onBlocked: (proceed) => {
        pendingRef.current = proceed;
        setBlocked(true);
        setShaking(true);
        window.clearTimeout(shakeTimer.current);
        shakeTimer.current = window.setTimeout(() => setShaking(false), 550);
      },
    });
  }, []);

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  // Leaving the site entirely — the browser shows its own confirmation.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const stay = useCallback(() => {
    pendingRef.current = null;
    setBlocked(false);
  }, []);

  const discard = useCallback(() => {
    const proceed = pendingRef.current;
    pendingRef.current = null;
    setBlocked(false);
    proceed?.();
  }, []);

  return { blocked, shaking, stay, discard };
}
