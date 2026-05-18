'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Counts {
  filamentos: number;
  colores: number;
  productos: number;
  posts: number;
  trabajos: number;
}

export default function AdminDashboard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));

    Promise.all([
      supabase.from('filamentos').select('id',  { count: 'exact', head: true }),
      supabase.from('colores').select('id',     { count: 'exact', head: true }),
      supabase.from('productos').select('id',   { count: 'exact', head: true }),
      supabase.from('blog_posts').select('id',  { count: 'exact', head: true }).eq('published', true),
      supabase.from('trabajos').select('id',    { count: 'exact', head: true })
    ]).then(([f, c, p, b, t]) => {
      setCounts({
        filamentos: f.count ?? 0,
        colores:    c.count ?? 0,
        productos:  p.count ?? 0,
        posts:      b.count ?? 0,
        trabajos:   t.count ?? 0
      });
    });
  }, []);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAuthed(false);
  }

  if (authed === false) {
    return (
      <div>
        <h1 className="section-title" style={{ fontSize: 32, marginBottom: 24 }}>Inicia sesión</h1>
        <Link href="/admin/login" className="btn-primary">Iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 className="section-title" style={{ fontSize: 32 }}>Panel</h1>
        <button type="button" className="btn-outline" onClick={logout}>Cerrar sesión</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { label: 'Filamentos', value: counts?.filamentos, href: '/admin/filamentos' },
          { label: 'Colores',    value: counts?.colores,    href: '/admin/filamentos' },
          { label: 'Productos',  value: counts?.productos,  href: '/admin/productos' },
          { label: 'Trabajos',   value: counts?.trabajos,   href: '/admin/trabajos' },
          { label: 'Posts',      value: counts?.posts,      href: '/admin/blog' }
        ].map((c) => (
          <Link key={c.label} href={c.href} className="card" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: '0.2em', color: 'var(--muted)' }}>
              {c.label.toUpperCase()}
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: 'var(--accent)', lineHeight: 1 }}>
              {c.value ?? '—'}
            </div>
          </Link>
        ))}
      </div>
      <p style={{ marginTop: 32, color: 'var(--muted)', fontSize: 14 }}>
        El CRUD de productos, filamentos y blog está en cada pestaña. Para
        cambios masivos puedes editar directamente en el dashboard de Supabase.
      </p>
    </div>
  );
}
