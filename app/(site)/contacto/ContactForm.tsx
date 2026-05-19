'use client';

import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'ok'; message: string }
  | { kind: 'err'; message: string };

interface Draft {
  nombre: string;
  email: string;
  telefono: string;
  tipo: string;
  mensaje: string;
  website: string; // honeypot
}

const EMPTY: Draft = {
  nombre: '',
  email: '',
  telefono: '',
  tipo: 'Presupuesto',
  mensaje: '',
  website: ''
};

export function ContactForm() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'sending' });

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke(
        'send-contact-email',
        { body: draft }
      );

      if (error) {
        setStatus({
          kind: 'err',
          message:
            error.message ??
            'No se pudo enviar. Inténtalo más tarde o escríbenos directamente a impresion3dslmc@gmail.com.'
        });
        return;
      }
      if (data?.error) {
        setStatus({ kind: 'err', message: data.error });
        return;
      }

      setStatus({
        kind: 'ok',
        message:
          data?.message ?? '¡Gracias! Hemos recibido tu mensaje y te responderemos pronto.'
      });
      setDraft(EMPTY);
    } catch (err) {
      setStatus({
        kind: 'err',
        message:
          'Error de red. Comprueba tu conexión o escríbenos a impresion3dslmc@gmail.com.'
      });
    }
  }

  const disabled = status.kind === 'sending';

  return (
    <form className="contacto-form" onSubmit={submit} noValidate>
      <div className="contacto-field">
        <label htmlFor="nombre">Nombre completo</label>
        <input
          id="nombre"
          type="text"
          required
          value={draft.nombre}
          onChange={(e) => patch('nombre', e.target.value)}
          disabled={disabled}
          autoComplete="name"
        />
      </div>

      <div className="contacto-row">
        <div className="contacto-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={draft.email}
            onChange={(e) => patch('email', e.target.value)}
            disabled={disabled}
            autoComplete="email"
          />
        </div>

        <div className="contacto-field">
          <label htmlFor="telefono">Teléfono (opcional)</label>
          <input
            id="telefono"
            type="tel"
            value={draft.telefono}
            onChange={(e) => patch('telefono', e.target.value)}
            disabled={disabled}
            autoComplete="tel"
            placeholder="+34 ..."
          />
        </div>
      </div>

      <div className="contacto-field">
        <label htmlFor="tipo">Tipo de consulta</label>
        <select
          id="tipo"
          value={draft.tipo}
          onChange={(e) => patch('tipo', e.target.value)}
          disabled={disabled}
        >
          <option>Presupuesto</option>
          <option>Pregunta sobre material</option>
          <option>Diseño personalizado</option>
          <option>Estado de pedido</option>
          <option>Otro</option>
        </select>
      </div>

      <div className="contacto-field">
        <label htmlFor="mensaje">Mensaje</label>
        <textarea
          id="mensaje"
          required
          value={draft.mensaje}
          onChange={(e) => patch('mensaje', e.target.value)}
          disabled={disabled}
          placeholder="Cuéntanos qué necesitas. Si tienes un archivo (STL, etc.) puedes mencionarlo y te diremos cómo enviarlo."
          minLength={10}
        />
      </div>

      {/* Honeypot — bots fill every field; humans never see this. */}
      <div className="contacto-honeypot" aria-hidden="true">
        <label htmlFor="website">No rellenes este campo</label>
        <input
          id="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={draft.website}
          onChange={(e) => patch('website', e.target.value)}
        />
      </div>

      {status.kind === 'ok' && (
        <div className="contacto-msg ok" role="status">
          {status.message}
        </div>
      )}
      {status.kind === 'err' && (
        <div className="contacto-msg err" role="alert">
          {status.message}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary contacto-submit"
        disabled={disabled}
      >
        {status.kind === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
      </button>

      <p
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          marginTop: 4,
          lineHeight: 1.5
        }}
      >
        Al enviar aceptas nuestros{' '}
        <a
          href="/terminos"
          style={{ color: 'var(--accent)' }}
        >
          Términos
        </a>
        . Tus datos se utilizan únicamente para responderte y no se ceden a
        terceros.
      </p>
    </form>
  );
}
