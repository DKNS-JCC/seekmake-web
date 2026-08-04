// One-shot seed: load filamentos.yaml + productos.yaml into Supabase.
//
// Usage:
//   1. Run the migration in supabase/migrations/0001_initial.sql in the
//      Supabase SQL editor (or via `supabase db push`).
//   2. Copy .env.local.example to .env.local and fill in URL + service-role key.
//   3. npm run seed
//
// Safe to re-run: deletes existing rows in filamentos/colores/productos first.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import yaml from 'js-yaml';
import { createAdminClient } from '../lib/supabase/admin';
import type { Acabado, Categoria, MuestraTipo } from '../lib/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env.local') });

const LEGACY = resolve(__dirname, '..', 'legacy');

// ---------- YAML shapes (input) ----------

interface YamlFilamentoColor {
  nombre: string;
  hex: string;
  muestra_colores?: string[];
  muestra_tipo?: MuestraTipo;
  texto?: 'black' | 'white';
  acabado?: Acabado;
  combina_con?: string[];
  oferta?: boolean;
  agotado?: boolean;
}

interface YamlFilamento {
  nombre: string;
  descripcion: string;
  colores: YamlFilamentoColor[];
}

interface YamlFilamentos {
  filamentos: Record<string, YamlFilamento>;
}

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

// ---------- runner ----------

async function main() {
  const supabase = createAdminClient();

  // --- Filamentos + Colores ---
  const filamentosYaml = yaml.load(
    readFileSync(resolve(LEGACY, 'filamentos.yaml'), 'utf-8')
  ) as YamlFilamentos;

  console.log('→ Wiping existing filamentos/colores...');
  await supabase.from('colores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('filamentos').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  let materialOrden = 0;
  for (const [material, data] of Object.entries(filamentosYaml.filamentos)) {
    const { data: fila, error } = await supabase
      .from('filamentos')
      .insert({
        material,
        nombre: data.nombre,
        descripcion: data.descripcion,
        orden: materialOrden++
      })
      .select('id')
      .single();

    if (error || !fila) {
      console.error(`✗ Filamento ${material}:`, error);
      continue;
    }

    const coloresPayload = data.colores.map((c, i) => ({
      filamento_id: fila.id,
      nombre: c.nombre,
      hex: c.hex,
      muestra_colores: c.muestra_colores ?? [],
      muestra_tipo:
        c.muestra_tipo ?? ((c.muestra_colores?.length ?? 0) > 1 ? 'bandas' : 'solido'),
      texto: c.texto ?? 'black',
      acabado: c.acabado ?? null,
      combina_con: c.combina_con ?? [],
      oferta: c.oferta ?? false,
      agotado: c.agotado ?? false,
      orden: i
    }));

    const { error: colErr } = await supabase.from('colores').insert(coloresPayload);
    if (colErr) console.error(`✗ Colores ${material}:`, colErr);
    else console.log(`✓ ${material}: ${coloresPayload.length} colores`);
  }

  // --- Productos ---
  const productosYaml = yaml.load(
    readFileSync(resolve(LEGACY, 'productos.yaml'), 'utf-8')
  ) as YamlProductos;

  console.log('→ Wiping existing productos...');
  await supabase.from('productos').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const productosPayload = productosYaml.productos.map((p) => ({
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

  const { error: prodErr, count } = await supabase
    .from('productos')
    .insert(productosPayload, { count: 'exact' });

  if (prodErr) {
    console.error('✗ Productos:', prodErr);
    process.exit(1);
  }
  console.log(`✓ ${count ?? productosPayload.length} productos`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
