// Turns Supabase/Postgres errors into something a human can act on.
//
// Showing `err.message` straight to the screen leaks the schema and tells the
// reader nothing useful — "new row for relation \"colores\" violates check
// constraint \"colores_muestra_tipo_check\"" is not a sentence anyone can act
// on. Map the cases we actually cause, and fall back to a plain apology.

type SupabaseLikeError = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** Postgres SQLSTATE → what the operator should do about it. */
const POR_CODIGO: Record<string, string> = {
  '23505': 'Ya existe un registro con ese valor único. Cambia el nombre o el identificador.',
  '23503': 'No se puede completar: hay otros registros que dependen de este.',
  '23502': 'Falta un campo obligatorio.',
  '23514': 'Algún valor no es válido para este campo. Revisa lo introducido.',
  '22001': 'Un texto es demasiado largo para el campo.',
  '42501': 'No tienes permiso para hacer esto. Vuelve a iniciar sesión.',
  '42P01': 'Falta una tabla en la base de datos. Puede que quede una migración por aplicar.',
  '42703': 'Falta una columna en la base de datos. Puede que quede una migración por aplicar.',
  PGRST301: 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
};

/** Substring of the raw message → friendly text, for errors without a code. */
const POR_TEXTO: [RegExp, string][] = [
  [/duplicate key/i, POR_CODIGO['23505']],
  [/violates check constraint/i, POR_CODIGO['23514']],
  [/violates foreign key/i, POR_CODIGO['23503']],
  [/null value in column/i, POR_CODIGO['23502']],
  [/row-level security|rls/i, 'No tienes permiso para hacer esto. Vuelve a iniciar sesión.'],
  [/jwt|token .*expired|invalid claim/i, 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Tienes que confirmar tu email antes de entrar.'],
  [/rate limit|too many requests/i, 'Demasiados intentos seguidos. Espera un momento.'],
  [/failed to fetch|networkerror|network request failed/i,
   'No hay conexión con el servidor. Comprueba tu red e inténtalo otra vez.'],
  [/payload too large|exceeded the maximum/i, 'El archivo es demasiado grande.'],
  [/already exists/i, 'Ya existe un elemento con ese nombre.']
];

/**
 * Friendly Spanish message for any thrown value or Supabase error.
 * `contexto` is prefixed when given, e.g. "No se pudo guardar el color".
 */
export function mensajeDeError(err: unknown, contexto?: string): string {
  const texto = describe(err);
  return contexto ? `${contexto}: ${texto}` : texto;
}

function describe(err: unknown): string {
  if (err == null) return 'Ha ocurrido un error inesperado.';

  if (typeof err === 'string') return matchTexto(err) ?? err;

  const e = err as SupabaseLikeError;
  const code = e.code ?? undefined;
  if (code && POR_CODIGO[code]) return POR_CODIGO[code];

  const raw = e.message ?? (err instanceof Error ? err.message : '');
  if (raw) {
    const hit = matchTexto(raw);
    if (hit) return hit;
    // Unmapped but human-looking (our own thrown strings) — pass it through.
    if (!/relation |column |constraint |syntax error|violates /i.test(raw)) {
      return raw;
    }
  }
  return 'Ha ocurrido un error inesperado. Inténtalo de nuevo en unos segundos.';
}

function matchTexto(raw: string): string | null {
  for (const [re, msg] of POR_TEXTO) {
    if (re.test(raw)) return msg;
  }
  return null;
}
