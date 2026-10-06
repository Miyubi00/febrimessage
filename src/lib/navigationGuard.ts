/**
 * Global navigation guard for unsaved-changes protection.
 *
 * The app uses a plain `<BrowserRouter>` + `<Routes>` tree (no data router),
 * so react-router's `useBlocker` is unavailable. Instead, every navigation
 * trigger (bottom nav, logout, …) goes through {@link requestNavigation},
 * which consults the currently registered page guard.
 */

export type ProceedNavigation = () => void;

export interface NavigationGuard {
  /** Read live — backed by a ref so the registration stays stable. */
  isDirty: () => boolean;
  /**
   * Called when navigation is stopped. The page shakes its form and shows a
   * confirmation dialog; `proceed` runs the original navigation and must be
   * called only when the user chooses "discard".
   */
  onBlocked: (proceed: ProceedNavigation) => void;
}

let active: NavigationGuard | null = null;

/** Register the current page's guard (unregister on unmount). */
export function registerNavigationGuard(guard: NavigationGuard): () => void {
  active = guard;
  return () => {
    if (active === guard) active = null;
  };
}

/**
 * Run `go` immediately when nothing is dirty; otherwise stop and let the
 * owning page ask the user (shake + dialog). `go` runs on discard.
 */
export function requestNavigation(go: ProceedNavigation): void {
  if (active && active.isDirty()) {
    active.onBlocked(go);
    return;
  }
  go();
}
