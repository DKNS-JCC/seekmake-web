'use client';

import { useEffect, useMemo, useState } from 'react';
import type { QuoteEvento } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { euros } from '@/lib/recibo/types';

// Visits that uploaded something and left without asking for a quote: what
// they tried (picture + size), how many times, and the last price they saw.
// Everything comes from the anonymous quote_events plus the tasador-miniaturas
// bucket (<session>/<huella>.jpg, 30 days).

type Pieza = { huella: string; volumen?: number; bbox?: number[] };
type Linea = { h: string; mat: string; n: number; g: number; t: number; eur: number };
type Visita = {
  sesion: string;
  inicio: number;
  intentos: number;
  piezas: Pieza[];
  precio: { total: number; entrega?: string; detalle: Linea[] } | null;
  pdf: boolean;
};

const MAX = 30;

function hace(ms: number): string {
  const h = Math.floor((Date.now() - ms) / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

export function Abandonos({ eventos, desde }: { eventos: QuoteEvento[]; desde: number }) {
  const { visitas, sesionesPorHuella } = useMemo(() => {
    const por = new Map<string, QuoteEvento[]>();
    for (const e of eventos) {
      if (!e.session_id) continue;
      (por.get(e.session_id) ?? por.set(e.session_id, []).get(e.session_id)!).push(e);
    }
    const sesionesPorHuella = new Map<string, Set<string>>();
    const visitas: Visita[] = [];
    for (const [sesion, evs] of por) {
      evs.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const subidas = evs.filter((e) => e.evento === 'pieza_anadida');
      for (const e of subidas) {
        const h = String(e.payload?.huella ?? '');
        if (h) (sesionesPorHuella.get(h) ?? sesionesPorHuella.set(h, new Set()).get(h)!).add(sesion);
      }
      const inicio = new Date(evs[0].created_at).getTime();
      if (!subidas.length || inicio < desde || evs.some((e) => e.evento === 'solicitud_enviada')) continue;
      const piezas = new Map<string, Pieza>();
      subidas.forEach((e, i) => {
        const h = String(e.payload?.huella ?? `sin-huella-${i}`);
        piezas.set(h, {
          huella: h,
          volumen: Number(e.payload?.volumen_cm3) || undefined,
          bbox: Array.isArray(e.payload?.bbox_mm) ? (e.payload.bbox_mm as number[]) : undefined
        });
      });
      const ultimo = [...evs].reverse().find((e) => e.evento === 'precio_visto');
      const p = ultimo?.payload as Visita['precio'] | undefined;
      visitas.push({
        sesion,
        inicio,
        intentos: subidas.length,
        piezas: [...piezas.values()],
        precio: p && typeof p.total === 'number' ? { ...p, detalle: Array.isArray(p.detalle) ? p.detalle : [] } : null,
        pdf: evs.some((e) => e.evento === 'pdf_descargado')
      });
    }
    visitas.sort((a, b) => b.inicio - a.inicio);
    return { visitas: visitas.slice(0, MAX), sesionesPorHuella };
  }, [eventos, desde]);

  // Signed URLs for the pictures (private bucket, admin only).
  const [fotos, setFotos] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = visitas.flatMap((v) =>
      v.piezas.filter((p) => !p.huella.startsWith('sin-huella')).map((p) => `${v.sesion}/${p.huella}.jpg`)
    );
    if (!paths.length) return;
    createClient()
      .storage.from('tasador-miniaturas')
      .createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const d of data ?? []) if (d.signedUrl && d.path) m[d.path] = d.signedUrl;
        setFotos(m);
      });
  }, [visitas]);

  if (!visitas.length) {
    return <p className="ab-vacio">Nadie se ha ido sin pedir en este periodo (o aún no hay datos con el tasador nuevo).</p>;
  }

  return (
    <ul className="ab-lista">
      {visitas.map((v) => (
        <li key={v.sesion} className="ab-visita">
          <div className="ab-cab">
            <span>{hace(v.inicio)}</span>
            <span>
              {v.intentos} {v.intentos === 1 ? 'subida' : 'subidas'}
              {v.piezas.length !== v.intentos && ` · ${v.piezas.length} ${v.piezas.length === 1 ? 'pieza distinta' : 'piezas distintas'}`}
            </span>
            {v.pdf && <span className="ab-tag">Bajó el PDF</span>}
            <strong className="adm-num">
              {v.precio ? `vio ${euros(v.precio.total)}` : 'no llegó a ver precio'}
            </strong>
          </div>
          <ul className="ab-piezas">
            {v.piezas.map((p) => {
              const linea = v.precio?.detalle.find((l) => l.h === p.huella);
              const otras = (sesionesPorHuella.get(p.huella)?.size ?? 1) - 1;
              const foto = fotos[`${v.sesion}/${p.huella}.jpg`];
              return (
                <li key={p.huella} className="ab-pieza">
                  {foto ? (
                    <img src={foto} alt="Miniatura de la pieza" width={96} height={72} loading="lazy" />
                  ) : (
                    <span className="ab-sinfoto" aria-hidden="true" />
                  )}
                  <span className="ab-datos">
                    <span>
                      {[
                        p.bbox && `${p.bbox.join(' × ')} mm`,
                        p.volumen && `${p.volumen.toLocaleString('es-ES')} cm³`
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Sin medidas (visita anterior al cambio)'}
                    </span>
                    {linea && (
                      <span>
                        {linea.mat}
                        {linea.n > 1 ? ` × ${linea.n}` : ''} · ~{linea.g} g · ~{linea.t.toLocaleString('es-ES')} h ·{' '}
                        <strong>{euros(linea.eur)}</strong>
                      </span>
                    )}
                    {otras > 0 && (
                      <span className="ab-tag">
                        También en {otras} {otras === 1 ? 'visita más' : 'visitas más'}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
