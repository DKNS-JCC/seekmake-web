// Keyboard support for elements that behave like buttons but aren't.
//
// A <div onClick> is invisible to keyboard and screen-reader users: you can't
// Tab to it and Enter does nothing. These helpers add the missing pieces so
// card grids and table rows stay operable without a mouse.

import type { KeyboardEvent } from 'react';

function onKey(onActivate: () => void) {
  return (e: KeyboardEvent) => {
    // Ignore keys bubbling up from a real control inside the card.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onActivate();
    }
  };
}

/**
 * For cards and tiles (article/div) that act as a single button.
 * Pass an `etiqueta` describing the action, e.g. "Editar el color Negro".
 */
export function activable(onActivate: () => void, etiqueta?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': etiqueta,
    onClick: onActivate,
    onKeyDown: onKey(onActivate)
  };
}

/**
 * For clickable table rows. Deliberately omits role="button" — that would
 * override the row semantics a screen reader needs inside a table — but still
 * makes the row reachable with Tab and activatable with Enter/Space.
 */
export function activableRow(onActivate: () => void, etiqueta?: string) {
  return {
    tabIndex: 0,
    'aria-label': etiqueta,
    onClick: onActivate,
    onKeyDown: onKey(onActivate)
  };
}
