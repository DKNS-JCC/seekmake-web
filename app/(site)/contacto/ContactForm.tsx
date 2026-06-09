'use client';

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useRef,
  useState
} from 'react';
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

interface AttachmentUI {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  url?: string;
  error?: string;
}

const EMPTY: Draft = {
  nombre: '',
  email: '',
  telefono: '',
  tipo: 'Presupuesto',
  mensaje: '',
  website: ''
};

const MAX_FILES = 3;
const MAX_BYTES = 30 * 1024 * 1024; // keep in sync with bucket policy
const ALLOWED_EXT = new Set([
  'stl',
  '3mf',
  'step',
  'stp',
  'obj',
  'gcode',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'svg',
  'zip'
]);
const ACCEPT = '.stl,.3mf,.step,.stp,.obj,.gcode,.pdf,.png,.jpg,.jpeg,.webp,.svg,.zip';

function randomPath(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || 'bin';
  const safe = (Math.random().toString(36).slice(2, 8) + Date.now().toString(36)).slice(0, 16);
  return `contact/${safe}.${ext}`;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

export function ContactForm() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [attachments, setAttachments] = useState<AttachmentUI[]>([]);
  const [dropping, setDropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function patch<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  // ────────── Attachments ──────────

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const errors: string[] = [];
    const accepted: AttachmentUI[] = [];

    for (const f of arr) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_EXT.has(ext)) {
        errors.push(`${f.name}: extensión no permitida`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        errors.push(`${f.name}: supera los ${MAX_BYTES / 1024 / 1024} MB`);
        continue;
      }
      if (attachments.length + accepted.length >= MAX_FILES) {
        errors.push(`Máximo ${MAX_FILES} archivos`);
        break;
      }
      accepted.push({
        id: Math.random().toString(36).slice(2, 10),
        file: f,
        status: 'pending'
      });
    }

    if (errors.length) {
      setStatus({ kind: 'err', message: errors.join(' · ') });
    }

    if (accepted.length) {
      setAttachments((prev) => [...prev, ...accepted]);
      // Kick off uploads immediately for better UX.
      void Promise.all(accepted.map(uploadOne));
    }
  }

  async function uploadOne(att: AttachmentUI) {
    setAttachments((prev) =>
      prev.map((a) => (a.id === att.id ? { ...a, status: 'uploading' } : a))
    );

    const supabase = createClient();
    const path = randomPath(att.file.name);
    const { error: upErr } = await supabase.storage
      .from('contact-uploads')
      .upload(path, att.file, {
        contentType: att.file.type || 'application/octet-stream',
        upsert: false
      });

    if (upErr) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === att.id ? { ...a, status: 'error', error: upErr.message } : a
        )
      );
      return;
    }

    const { data } = supabase.storage.from('contact-uploads').getPublicUrl(path);
    setAttachments((prev) =>
      prev.map((a) =>
        a.id === att.id ? { ...a, status: 'done', url: data.publicUrl } : a
      )
    );
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length) addFiles(e.target.files);
    e.target.value = ''; // reset so re-selecting same file works
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropping(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  // ────────── Submit ──────────

  async function submit(e: FormEvent) {
    e.preventDefault();

    // Block if any attachment is still uploading.
    const pending = attachments.filter(
      (a) => a.status === 'pending' || a.status === 'uploading'
    );
    if (pending.length) {
      setStatus({
        kind: 'err',
        message: 'Espera a que terminen de subir los archivos.'
      });
      return;
    }

    setStatus({ kind: 'sending' });

    const archivos = attachments
      .filter((a) => a.status === 'done' && a.url)
      .map((a) => ({ nombre: a.file.name, url: a.url!, tamano: a.file.size }));

    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke(
        'send-contact-email',
        { body: { ...draft, archivos } }
      );

      if (error) {
        setStatus({
          kind: 'err',
          message:
            error.message ??
            'No se pudo enviar. Inténtalo más tarde o escríbenos directamente a info@impresion3dcc.com.'
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
      setAttachments([]);
    } catch {
      setStatus({
        kind: 'err',
        message:
          'Error de red. Comprueba tu conexión o escríbenos a info@impresion3dcc.com.'
      });
    }
  }

  const disabled = status.kind === 'sending';
  const anyUploading = attachments.some(
    (a) => a.status === 'pending' || a.status === 'uploading'
  );

  return (
    <form className="contacto-form" onSubmit={submit}>
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
          placeholder="Cuéntanos qué necesitas. Puedes adjuntar archivos (STL, PDF…) abajo."
          minLength={10}
        />
      </div>

      {/* ── Attachments ─────────────────────────────────── */}
      <div className="contacto-field">
        <label>Adjuntos (opcional)</label>

        <div
          className={'contacto-drop' + (dropping ? ' dropping' : '')}
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <svg
            width="22"
            height="22"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
            />
          </svg>
          <div className="contacto-drop-text">
            <strong>Pulsa o arrastra archivos aquí</strong>
            <span>
              STL, 3MF, STEP, OBJ, PDF, imágenes — hasta{' '}
              {MAX_BYTES / 1024 / 1024} MB · máx. {MAX_FILES} archivos
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={onPickFiles}
            style={{ display: 'none' }}
          />
        </div>

        {attachments.length > 0 && (
          <ul className="contacto-attachments">
            {attachments.map((a) => (
              <li
                key={a.id}
                className={'contacto-att contacto-att--' + a.status}
              >
                <span className="contacto-att-name" title={a.file.name}>
                  {a.file.name}
                </span>
                <span className="contacto-att-size">{humanSize(a.file.size)}</span>
                <span className="contacto-att-status">
                  {a.status === 'pending'   && '· en cola'}
                  {a.status === 'uploading' && '· subiendo…'}
                  {a.status === 'done'      && '· ✓'}
                  {a.status === 'error'     && `· error: ${a.error}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`Quitar ${a.file.name}`}
                  className="contacto-att-remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Honeypot */}
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
        disabled={disabled || anyUploading}
      >
        {status.kind === 'sending'
          ? 'Enviando…'
          : anyUploading
            ? 'Subiendo archivos…'
            : 'Enviar mensaje'}
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
        <a href="/terminos" style={{ color: 'var(--accent)' }}>
          Términos
        </a>
        . Tus datos se usan únicamente para responderte. Los archivos
        adjuntos se almacenan de forma temporal y se eliminan
        periódicamente.
      </p>
    </form>
  );
}
