// Productos-only seeder: wipes and reseeds the `productos` table from
// legacy/productos.yaml. Leaves filamentos, colores, blog_posts and trabajos
// untouched.
//
// Usage:  npm run seed:productos

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import yaml from 'js-yaml';
import { createAdminClient } from '../lib/supabase/admin';
import type { Categoria } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env.local') });

interface YamlProducto {
  id: number;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: Categoria;
  material?: string;
  colores?: string[];
  dimensiones?: string;
  peso?: string;
  imagen?: string;
  destacado?: boolean;
  etiquetas?: string[];
}

interface YamlProductos {
  productos: YamlProducto[];
}

async function main() {
  const supabase = createAdminClient();
  const LEGACY = resolve(__dirname, '..', 'legacy');

  const productosYaml = yaml.load(
    readFileSync(resolve(LEGACY, 'productos.yaml'), 'utf-8')
  ) as YamlProductos;

  console.log('→ Wiping existing productos...');
  const { error: delErr } = await supabase
    .from('productos')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) {
    console.error('✗ Wipe failed:', delErr);
    process.exit(1);
  }

  const payload = productosYaml.productos.map((p) => ({
    legacy_id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    categoria: p.categoria,
    material: p.material ?? 'PLA',
    colores: p.colores ?? [],
    dimensiones: p.dimensiones ?? '',
    peso: p.peso ?? '',
    imagen: p.imagen ?? '',
    destacado: p.destacado ?? false,
    etiquetas: p.etiquetas ?? []
  }));

  const { error: insErr, count } = await supabase
    .from('productos')
    .insert(payload, { count: 'exact' });

  if (insErr) {
    console.error('✗ Insert failed:', insErr);
    process.exit(1);
  }

  console.log(`✓ ${count ?? payload.length} productos cargados`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
