'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/admin');
  }

  return (
    <div style={{ maxWidth: 360, margin: '0 auto' }}>
      <h1 className="section-title" style={{ fontSize: 32, marginBottom: 24 }}>Acceso admin</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={fieldStyle}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={fieldStyle}
        />
        {error && (
          <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 'var(--r)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 13
};
