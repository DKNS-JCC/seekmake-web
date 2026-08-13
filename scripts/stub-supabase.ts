// Supabase falso en memoria, solo para las pruebas de Edge Functions.
//
// No pretende ser fiel a PostgREST: implementa exactamente las cadenas que usa
// `recibo-emitir` (select/eq/is/gte/order/single/maybeSingle, insert, update,
// delete y el storage), con datos en arrays. Sirve para ejercitar la lógica de
// la función — autorización, validaciones, antiduplicado, cuentas, rollback —
// sin levantar nada.
//
// Se enchufa con un import map: scripts/deno-test.json.

// deno-lint-ignore-file no-explicit-any

type Fila = Record<string, any>;

export const estado = {
  tablas: {} as Record<string, Fila[]>,
  /** Ficheros subidos: path → bytes. */
  storage: new Map<string, Uint8Array>(),
  /** JWT → usuario que devuelve auth.getUser. */
  usuarios: new Map<string, any>(),
  /** Fuerza el fallo de la siguiente subida al bucket. */
  fallarUpload: false,
  secuencia: 1
};

export function reset() {
  estado.tablas = { quotes: [], recibos: [] };
  estado.storage = new Map();
  estado.usuarios = new Map();
  estado.fallarUpload = false;
  estado.secuencia = 1;
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Valores que la base de datos rellena sola al insertar en `recibos`. */
function defaultsRecibo(fila: Fila): Fila {
  const n = String(estado.secuencia++).padStart(4, '0');
  return {
    id: uuid(),
    codigo: `R-2026-${n}`,
    verif_token: uuid(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    anulado_at: null,
    anulado_motivo: '',
    pdf_path: null,
    datos: {},
    concepto: '',
    es_adelanto: false,
    metodo: 'transferencia',
    ...fila
  };
}

class Query implements PromiseLike<{ data: any; error: any }> {
  private filtros: ((f: Fila) => boolean)[] = [];
  private orden: { col: string; asc: boolean } | null = null;
  private limite: number | null = null;
  private modo: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Fila | null = null;
  private unico: false | 'single' | 'maybe' = false;
  private embebido: string | null = null;

  constructor(private tabla: string) {}

  select(cols = '*') {
    if (this.modo === 'select') this.modo = 'select';
    // Relación embebida al estilo PostgREST: "quotes!inner(codigo, token)".
    const m = /(\w+)!inner\(/.exec(cols);
    this.embebido = m ? m[1] : null;
    return this;
  }
  insert(p: Fila) { this.modo = 'insert'; this.payload = p; return this; }
  update(p: Fila) { this.modo = 'update'; this.payload = p; return this; }
  delete() { this.modo = 'delete'; return this; }

  eq(col: string, val: any) {
    this.filtros.push((f) => String(f[col]) === String(val));
    return this;
  }
  is(col: string, val: any) {
    this.filtros.push((f) => (f[col] ?? null) === val);
    return this;
  }
  gte(col: string, val: any) {
    this.filtros.push((f) => String(f[col]) >= String(val));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.orden = { col, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) { this.limite = n; return this; }
  single() { this.unico = 'single'; return this; }
  maybeSingle() { this.unico = 'maybe'; return this; }

  private ejecutar(): { data: any; error: any } {
    const filas = (estado.tablas[this.tabla] ??= []);

    if (this.modo === 'insert') {
      const nueva = this.tabla === 'recibos'
        ? defaultsRecibo(this.payload ?? {})
        : { id: uuid(), created_at: new Date().toISOString(), ...(this.payload ?? {}) };
      filas.push(nueva);
      return this.envolver([nueva]);
    }

    let sel = filas.filter((f) => this.filtros.every((t) => t(f)));

    if (this.modo === 'update') {
      for (const f of sel) Object.assign(f, this.payload);
      return this.envolver(sel);
    }
    if (this.modo === 'delete') {
      for (const f of sel) {
        const i = filas.indexOf(f);
        if (i >= 0) filas.splice(i, 1);
      }
      return this.envolver(sel);
    }

    if (this.orden) {
      const { col, asc } = this.orden;
      sel = [...sel].sort((a, b) =>
        String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : String(a[col]) > String(b[col]) ? (asc ? 1 : -1) : 0
      );
    }
    if (this.limite != null) sel = sel.slice(0, this.limite);

    if (this.embebido === 'quotes') {
      sel = sel.map((f) => ({
        ...f,
        quotes: (estado.tablas.quotes ?? []).find((q) => q.id === f.quote_id) ?? null
      }));
    }
    return this.envolver(sel);
  }

  private envolver(filas: Fila[]) {
    if (this.unico === 'single') {
      return filas.length === 1
        ? { data: filas[0], error: null }
        : { data: null, error: { message: 'no rows' } };
    }
    if (this.unico === 'maybe') {
      return { data: filas[0] ?? null, error: null };
    }
    return { data: filas, error: null };
  }

  then<R1 = any, R2 = never>(
    res?: ((v: { data: any; error: any }) => R1 | PromiseLike<R1>) | null,
    rej?: ((r: any) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.ejecutar()).then(res, rej);
  }
}

function bucket(_id: string) {
  return {
    // deno-lint-ignore require-await
    async upload(path: string, bytes: Uint8Array, _o?: any) {
      if (estado.fallarUpload) return { data: null, error: { message: 'bucket lleno' } };
      if (estado.storage.has(path)) return { data: null, error: { message: 'ya existe' } };
      estado.storage.set(path, bytes);
      return { data: { path }, error: null };
    },
    // deno-lint-ignore require-await
    async createSignedUrl(path: string, ttl: number, _o?: any) {
      if (!estado.storage.has(path)) return { data: null, error: { message: 'no existe' } };
      return { data: { signedUrl: `https://firmada.test/${path}?exp=${ttl}` }, error: null };
    }
  };
}

export function createClient(_url: string, _key: string) {
  return {
    from: (tabla: string) => new Query(tabla),
    storage: { from: bucket },
    auth: {
      // deno-lint-ignore require-await
      async getUser(jwt: string) {
        const u = estado.usuarios.get(jwt);
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: 'jwt inválido' } };
      }
    }
  };
}
