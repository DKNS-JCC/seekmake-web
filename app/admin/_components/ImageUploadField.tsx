'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * URL input + live preview + "Subir imagen" button that uploads the
 * selected file to the public `product-images` bucket and writes the
 * resulting URL back into the field.
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from('product-images')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

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
          disabled={uploading}
          className="btn-outline"
          style={{ padding: '8px 16px', fontSize: 11, whiteSpace: 'nowrap' }}
        >
          {uploading ? 'Subiendo…' : 'Subir'}
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Preview"
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
