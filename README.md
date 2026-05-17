# 3DCC Salamanca — v2

Next.js 16 (App Router) + Supabase. Static export, deployable a GitHub Pages,
Cloudflare Pages, Supabase Storage o cualquier hosting estático.

## Estructura

```
app/                Rutas Next.js
  (site)/           Páginas públicas (Home, Muestrario, Catálogo, ...)
  admin/            Panel protegido (Auth Supabase)
  terminos/         Términos (chrome reducido)
  qr/               Link-in-bio (sin chrome)
components/         Componentes compartidos (Nav, Footer, ...)
lib/
  supabase/         Clientes (client / admin)
  types.ts          Tipos compartidos + Database
supabase/
  migrations/       SQL inicial + extras
  seed.ts           Importador YAML → Postgres
legacy/             Sitio anterior (HTML estático) — referencia
public/             Iconos, imágenes y CNAME
```

## Pasos para arrancar

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el proyecto Supabase

1. Crea un proyecto nuevo en https://supabase.com/dashboard
2. En **SQL Editor**, ejecuta en orden:
   - `supabase/migrations/0001_initial.sql`
   - `supabase/migrations/0002_color_extras.sql`
3. Copia las claves desde **Project Settings → API**.

### 3. Configurar variables de entorno

Copia `.env.local.example` a `.env.local` y rellena:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # solo para `npm run seed`
```

### 4. Poblar la base de datos desde los YAML originales

```bash
npm run seed
```

Esto importa `legacy/filamentos.yaml` y `legacy/productos.yaml` a las tablas
`filamentos`, `colores` y `productos`. Es idempotente: borra el contenido
existente antes de insertar.

### 5. Crear el usuario admin

En el dashboard Supabase → **Authentication → Users → Add user**.

Para darle permisos de admin, en **SQL Editor**:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
where email = 'tu@email.com';
```

La política RLS `is_admin()` lee este flag desde el JWT.

### 6. Desarrollo local

```bash
npm run dev
```

Abre http://localhost:3000.

### 7. Build estático

```bash
npm run build
```

Genera `out/`. Súbelo a cualquier hosting estático (o usa la GitHub Action).

## Despliegue

### GitHub Pages (automático)

El workflow `.github/workflows/deploy-pages.yml` se dispara en cada push a
`next-supabase` o `main`. Necesita estos secrets configurados:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Configura Pages en **Settings → Pages → Source: GitHub Actions**.

El `public/CNAME` mantiene el dominio `impresion3dcc.com`.

### Vercel (alternativa)

Si más adelante necesitas SSR (server actions, server-side auth checks),
quita la línea `output: 'export'` de `next.config.mjs` y conecta el repo en
https://vercel.com — Vercel detecta Next.js y compila automáticamente.

## Estado de la migración

- Home, Términos, Success, Cancel, Instant Quote, QR, Impresoras (stub).
- Muestrario: tabs por material, búsqueda, modal detalle, acabados,
  test interactivo, "combina con".
- Catálogo: filtros (búsqueda/categoría/orden), vista grid/lista, modal detalle.
- Admin: login, dashboard, CRUD productos, CRUD filamentos+colores.

## Cosas pendientes / mejoras

- `impresoras` se quedó como stub — falta portear la lista de impresoras.
- `qr` tiene un diseño funcional pero simplificado; la versión legacy
  tenía gradientes animados y tipografía Inter más elaborada.
- No hay tests automáticos todavía.
- La auth admin se valida en cliente. Para reforzarla, mueve a Vercel y
  usa server components con `@supabase/ssr`.
