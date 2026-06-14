'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// Preserve the legacy localStorage contract from the current pages:
// key = "theme", value = "dark" | "light".
const STORAGE_KEY = 'theme';

interface DarkModeCtx {
  isDark: boolean;
  toggle: () => void;
  setDark: (value: boolean) => void;
}

const Ctx = createContext<DarkModeCtx | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  // We render light by default on the server, then the inline FOUC script in
  // <head> has already toggled `.dark` on <html>. On mount we read the same
  // value into state so the toggle UI is in sync.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    // AdSense ya no se inyecta aquí: se carga solo tras el consentimiento
    // del usuario en <CookieConsent /> (LSSI art. 22.2 + RGPD).
  }, []);

  const setDark = useCallback((value: boolean) => {
    document.documentElement.classList.toggle('dark', value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light');
    } catch {
      /* SSR / privacy mode — ignore. */
    }
    setIsDark(value);
  }, []);

  const toggle = useCallback(() => {
    setDark(!document.documentElement.classList.contains('dark'));
  }, [setDark]);

  return <Ctx.Provider value={{ isDark, toggle, setDark }}>{children}</Ctx.Provider>;
}

export function useDarkMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDarkMode must be used inside <Providers>');
  return ctx;
}
