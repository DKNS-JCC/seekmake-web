'use client';

import { useEffect } from 'react';

/**
 * Hook that mirrors the legacy script.js behaviour:
 * on mount, attach an IntersectionObserver to every `.fade-up` element
 * inside the document, adding the `.in` class when it enters the viewport.
 *
 * Thresholds and rootMargin match REQUIREMENTS §8.
 */
export function useFadeUp() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.fade-up'));
    if (!targets.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -100px 0px' }
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
}
