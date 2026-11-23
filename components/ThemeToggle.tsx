'use client';

import { useDarkMode } from '@/app/providers';

/** Claro/oscuro. Vive en el pie: lo usa poca gente y en la barra era ruido. */
export function ThemeToggle() {
  const { isDark, toggle } = useDarkMode();
  return (
    <button className="nav-theme" type="button" onClick={toggle} aria-label="Cambiar entre tema claro y oscuro">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
      <span>{isDark ? 'Tema claro' : 'Tema oscuro'}</span>
    </button>
  );
}
