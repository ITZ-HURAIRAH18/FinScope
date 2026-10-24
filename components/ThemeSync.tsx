"use client";

import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTheme, THEME_STORAGE_KEY } from '@/store/slices/themeSlice';

/**
 * Applies the Redux theme to the DOM and persists it (audit: light theme was
 * dead code — hard-coded `dark` class, no persistence, impure reducers).
 *
 * - Reads the persisted preference once on mount (after hydration, so the
 *   server-rendered dark default never mismatches).
 * - Keeps `<html class="dark">` and localStorage in sync with the store.
 */
export default function ThemeSync() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const initialized = useRef(false);

  // Load persisted preference once on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        dispatch(setTheme(stored));
      }
    } catch {
      // Storage unavailable (private mode / disabled) — stay on dark default.
    }
    initialized.current = true;
  }, [dispatch]);

  // Apply to DOM + persist on every change.
  useEffect(() => {
    if (!initialized.current) return;
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore — preference just won't persist.
    }
  }, [mode]);

  return null;
}
