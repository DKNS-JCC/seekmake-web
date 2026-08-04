'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { compressImage, formatBytes } from '@/lib/image-compress';
import { mensajeDeError } from '@/lib/errors';

/**
 * URL input + live preview + "Subir imagen" button that compresses the
 * selected file (resizes to ≤1600px max edge, re-encodes to WebP) before
 * uploading to the public `product-images` bucket. Keeps storage usage
 * tiny — typical 5 MB photo ends up at ~120–200 KB.
 */
export function ImageUploadField({
  value,
  onChange,
  folder = 'productos'
}: {
  value: string;
  onChange: (next: string) => void;
  folder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<'idle' | 'compressing' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savings, setSavings] = useState<string | null>(null);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSavings(null);

    let compressed;
    try {
      setStage('compressing');
      compressed = await compressImage(file);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo comprimir la imagen'));
      setStage('idle');
      return;
    }

    const ext = compressed.filename.split('.').pop() || 'webp';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    setStage('uploading');
    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from('product-images')
      .upload(path, compressed.blob, {
        contentType: compressed.contentType,
        upsert: false
      });

    if (upErr) {
      setError(mensajeDeError(upErr, 'No se pudo subir la imagen'));
      setStage('idle');
      return;
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    onChange(data.publicUrl);

    if (!compressed.skipped) {
      const ratio = Math.round(
        (1 - compressed.finalBytes / compressed.originalBytes) * 100
      );
      setSavings(
        `${formatBytes(compressed.originalBytes)} → ${formatBytes(
          compressed.finalBytes
        )} (–${ratio}%)`
      );
    } else {
      setSavings(`Subido tal cual (${formatBytes(compressed.finalBytes)})`);
    }

    setStage('idle');
    if (fileRef.current) fileRef.current.value = '';
  }

  const buttonLabel =
    stage === 'compressing'
      ? 'Comprimiendo…'
      : stage === 'uploading'
      ? 'Subiendo…'
      : 'Subir';

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… o sube un archivo"
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'inherit'
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={stage !== 'idle'}
          className="btn-outline"
          style={{ padding: '8px 16px', fontSize: 11, whiteSpace: 'nowrap' }}
        >
          {buttonLabel}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={upload}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>
      )}

      {savings && (
        <div
          style={{
            color: 'var(--accent)',
            fontSize: 11,
            fontFamily: 'IBM Plex Mono, monospace',
            letterSpacing: '0.08em',
            marginBottom: 8
          }}
        >
          {savings}
        </div>
      )}

      <div
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        {value ? (
          // Eager on purpose: it is the subject of the drawer you just opened.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Preview"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            Preview de la imagen
          </span>
        )}
      </div>
    </div>
  );
}
