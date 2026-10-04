import { useCallback, useEffect, useState } from 'react';

export type AdminTheme = 'light' | 'dark';

const STORAGE_KEY = 'admin-theme';
const ATTRIBUTE = 'data-admin-theme';

function readStored(): AdminTheme {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function apply(theme: AdminTheme): void {
  document.documentElement.setAttribute(ATTRIBUTE, theme);
}

function unapply(): void {
  document.documentElement.removeAttribute(ATTRIBUTE);
}

/** Apply the persisted admin theme (no toggle UI) — eg. for the login page. */
export function useApplyAdminTheme(): void {
  useEffect(() => {
    apply(readStored());
    return unapply;
  }, []);
}

/**
 * Admin dark/light mode. The attribute lives on `<html>` so portaled
 * overlays (modals, lightbox, toasts) follow along; it is removed on
 * unmount so the public page never inherits it.
 */
export function useAdminTheme(): { theme: AdminTheme; toggle: () => void } {
  const [theme, setTheme] = useState<AdminTheme>(readStored);

  useEffect(() => {
    apply(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode etc. — theme just won't persist.
    }
    return unapply;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
