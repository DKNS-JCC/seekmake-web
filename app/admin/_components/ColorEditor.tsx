'use client';

/**
 * Unified colour editor: picks the base hex AND the multicolour palette in one
 * control. The first tone of the palette *is* the base hex, so the two can
 * never drift apart.
 */

import { useState } from 'react';
import {
  MUESTRA_TIPOS,
  colorPreviewStyle,
  type MuestraTipo
} from '@/lib/color-preview';
import './color-editor.css';

export type ColorEditorValue = {
  hex: string;
  muestra_colores: string[];
  muestra_tipo: MuestraTipo;
};

const FINISH_CLASS: Record<string, string> = {
  'Metálico': 'finish-metallic',
  'Fluorescente': 'finish-fluorescente',
  'Translucido': 'finish-translucido',
  'Textura': 'finish-textura',
  'Brillante': 'finish-brillante',
  'Purpurina': 'finish-purpurina',
  'Mate': 'finish-mate',
  'Flexible': 'finish-flexible'
};

const PRESETS: { label: string; tipo: MuestraTipo; colors: string[] }[] = [
  {
    label: 'Rainbow',
    tipo: 'degradado',
    colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']
  },
  { label: 'Fuego', tipo: 'degradado', colors: ['#7f1d1d', '#dc2626', '#f97316', '#fbbf24'] },
  { label: 'Océano', tipo: 'degradado', colors: ['#0c4a6e', '#0284c7', '#22d3ee', '#a7f3d0'] },
  { label: 'Atardecer', tipo: 'degradado', colors: ['#312e81', '#7c3aed', '#ec4899', '#fb923c'] },
  { label: 'Negro y azul', tipo: 'bandas', colors: ['#111827', '#2563eb'] },
  { label: 'Blanco y negro', tipo: 'bandas', colors: ['#f9fafb', '#111827'] }
];

// ── hex helpers ───────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-f]{6}$/i;

function safeHex(v: string, fallback = '#cccccc'): string {
  return HEX_RE.test(v) ? v.toLowerCase() : fallback;
}

function hexToHsl(hex: string): [number, number, number] {
  const n = safeHex(hex).slice(1);
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** A visibly different partner tone, so a new palette never looks broken. */
function shiftHue(hex: string, turns: number): string {
  const [h, s, l] = hexToHsl(hex);
  const sat = s < 0.15 ? 0.55 : s;
  const lum = l < 0.12 ? 0.45 : l > 0.9 ? 0.5 : l;
  return hslToHex((h + turns) % 1, sat, lum);
}

// ── component ─────────────────────────────────────────────────────────────

export function ColorEditor({
  value,
  acabado,
  onChange
}: {
  value: ColorEditorValue;
  acabado?: string | null;
  onChange: (next: ColorEditorValue) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [codesDraft, setCodesDraft] = useState<string | null>(null);

  const tipo = value.muestra_tipo ?? 'solido';
  const tones = value.muestra_colores.filter(Boolean);
  const finishClass = acabado ? FINISH_CLASS[acabado] ?? '' : '';

  /** Palette writes keep `hex` pinned to the first tone. */
  function commit(nextTones: string[], nextTipo: MuestraTipo = tipo) {
    if (nextTipo === 'solido' || nextTones.length === 0) {
      onChange({ hex: value.hex, muestra_colores: [], muestra_tipo: 'solido' });
      return;
    }
    onChange({
      hex: nextTones[0],
      muestra_colores: nextTones,
      muestra_tipo: nextTipo
    });
  }

  function selectTipo(next: MuestraTipo) {
    if (next === tipo) return;
    if (next === 'solido') {
      onChange({
        hex: tones[0] ?? value.hex,
        muestra_colores: [],
        muestra_tipo: 'solido'
      });
      return;
    }
    // Seed a two-tone palette so switching modes shows a result immediately.
    const seeded = tones.length > 1 ? tones : [value.hex, shiftHue(value.hex, 0.42)];
    commit(seeded, next);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...tones];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  const preview = colorPreviewStyle({
    hex: value.hex,
    muestra_colores: tones,
    muestra_tipo: tipo
  });

  const activeTipo = MUESTRA_TIPOS.find((t) => t.id === tipo);

  return (
    <div className="ce">
      <div
        className={'ce-preview ' + finishClass}
        style={{
          ...preview,
          ...(acabado === 'Fluorescente'
            ? ({ ['--glow-color' as any]: value.hex } as React.CSSProperties)
            : {})
        }}
      >
        <span className="ce-preview-hex">
          {tipo === 'solido' ? value.hex : `${tones.length} tonos · ${tipo}`}
        </span>
      </div>

      <div className="ce-modes">
        {MUESTRA_TIPOS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => selectTipo(t.id)}
            className={'ce-mode' + (tipo === t.id ? ' active' : '')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTipo && <p className="ce-hint">{activeTipo.hint}</p>}

      {tipo === 'solido' ? (
        <div className="ce-solid">
          <input
            type="color"
            className="ce-solid-picker"
            value={safeHex(value.hex)}
            onChange={(e) =>
              onChange({ ...value, hex: e.target.value.toLowerCase() })
            }
          />
          <input
            type="text"
            className="ce-codes"
            value={value.hex}
            placeholder="#000000"
            onChange={(e) => {
              let v = e.target.value.trim();
              if (v && !v.startsWith('#')) v = '#' + v;
              onChange({ ...value, hex: v.toLowerCase() });
            }}
          />
        </div>
      ) : (
        <>
          <div className="ce-chips">
            {tones.map((hex, i) => (
              <div
                key={i}
                className={
                  'ce-chip' +
                  (dragIndex === i ? ' dragging' : '') +
                  (overIndex === i && dragIndex !== i ? ' drop-target' : '')
                }
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) reorder(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                title={hex}
              >
                <label className="ce-chip-fill" style={{ background: hex }}>
                  <input
                    type="color"
                    className="ce-chip-input"
                    value={safeHex(hex)}
                    onChange={(e) => {
                      const next = [...tones];
                      next[i] = e.target.value.toLowerCase();
                      commit(next);
                    }}
                  />
                </label>
                {tones.length > 2 && (
                  <button
                    type="button"
                    className="ce-chip-x"
                    aria-label={`Quitar tono ${i + 1}`}
                    onClick={() => commit(tones.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="ce-chip-add"
              aria-label="Añadir tono"
              onClick={() =>
                commit([...tones, shiftHue(tones[tones.length - 1] ?? value.hex, 0.13)])
              }
            >
              +
            </button>
          </div>

          <p className="ce-hint">
            Pulsa un tono para cambiarlo, arrástralo para reordenar. El primero
            es el color base del filamento.
          </p>

          <div>
            <div className="ce-label" style={{ marginBottom: 6 }}>
              Códigos
            </div>
            <input
              type="text"
              className="ce-codes"
              value={codesDraft ?? tones.join(', ')}
              placeholder="#111827, #2563eb"
              onChange={(e) => setCodesDraft(e.target.value)}
              onBlur={() => {
                if (codesDraft === null) return;
                const parsed = codesDraft
                  .split(/[\s,;]+/)
                  .map((v) => (v && !v.startsWith('#') ? '#' + v : v))
                  .filter((v) => HEX_RE.test(v))
                  .map((v) => v.toLowerCase());
                if (parsed.length > 1) commit(parsed);
                setCodesDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setCodesDraft(null);
              }}
            />
          </div>
        </>
      )}

      <div>
        <div className="ce-label" style={{ marginBottom: 6 }}>
          Combinaciones rápidas
        </div>
        <div className="ce-presets">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className="ce-preset"
              onClick={() => commit(p.colors, p.tipo)}
            >
              <span
                className="ce-preset-dot"
                style={colorPreviewStyle({
                  hex: p.colors[0],
                  muestra_colores: p.colors,
                  muestra_tipo: p.tipo
                })}
              />
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
