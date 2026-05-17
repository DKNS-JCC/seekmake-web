'use client';

import { useEffect } from 'react';

// IntersectionObserver replacement for the legacy `.qr-fade` → `.in` flow.
// Staggers a tiny delay per element so siblings cascade in.
export function QrFadeOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.qr-fade'));
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => e.target.classList.add('in'), i * 60);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return null;
}
