/**
 * CLI local de envíos (Sendcloud) — solo admin, uso ocasional.
 *
 * El secreto vive en .env.local (ignorado por git). NO se publica nada.
 *
 * Uso:
 *   npm run envio -- methods                              # catálogo v2 (ids)
 *   npm run envio -- quote --weight 0.25 --cp 28001       # tarifas reales (v3)
 *   npm run envio -- label --order pedido.json --method <ID> [--confirm]
 *
 * OJO España: las tarifas de Correos son por ZONA de CP, así que `quote` usa la
 * API v3 (necesita --cp de destino). `methods` solo lista el catálogo v2.
 * `label` sin --confirm es DRY-RUN (no crea envío ni gasta).
 */

import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

dotenv.config({ path: '.env.local' });

const V2 = 'https://panel.sendcloud.sc/api/v2';
const V3 = 'https://panel.sendcloud.sc/api/v3';
const PUB = process.env.SENDCLOUD_PUBLIC_KEY ?? '';
const SEC = process.env.SENDCLOUD_SECRET_KEY ?? '';
if (!PUB || !SEC) {
  console.error('✗ Faltan SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY en .env.local');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${PUB}:${SEC}`).toString('base64');

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
      else out[a.slice(2)] = true;
    }
  }
  return out;
}

async function api(base: string, pathname: string, init?: RequestInit) {
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = body?.errors?.[0]?.detail ?? body?.error?.message ?? body?.error ?? text ?? res.statusText;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body;
}
const v2 = (p: string, i?: RequestInit) => api(V2, p, i);
const v3 = (p: string, i?: RequestInit) => api(V3, p, i);

const stripW = (n: string) => String(n).replace(/\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*kg.*$/i, '').trim();
function priceForWeight(opt: any, kg: number): number | null {
  for (const q of opt.quotes ?? []) {
    const mn = parseFloat(q.weight?.min?.value), mx = parseFloat(q.weight?.max?.value);
    if (kg >= mn && kg <= mx) {
      const sum = (q.price?.breakdown ?? []).reduce((s: number, b: any) => s + parseFloat(b.price?.value ?? '0'), 0);
      return Math.round(sum * 100) / 100;
    }
  }
  return null;
}

async function cmdMethods(flags: Record<string, string | boolean>) {
  const from = String(flags.from ?? 'ES');
  const data = await v2(`/shipping_methods/?from_country=${from}`);
  const ms = data.shipping_methods ?? [];
  console.log(`\nCatálogo v2 desde ${from} (${ms.length}). Para precios usa "quote --cp".\n`);
  for (const m of ms.slice(0, Number(flags.limit ?? 60))) {
    console.log(`  id=${String(m.id).padStart(5)}  ${String(m.carrier).padEnd(16)} [${m.min_weight}-${m.max_weight}kg]  ${m.name}`);
  }
  if (ms.length > Number(flags.limit ?? 60)) console.log(`  … (${ms.length} en total; usa --limit N)`);
  console.log('');
}

async function cmdQuote(flags: Record<string, string | boolean>) {
  const weight = parseFloat(String(flags.weight ?? ''));
  const cp = String(flags.cp ?? '');
  const to = String(flags.to ?? 'ES');
  if (!Number.isFinite(weight) || weight <= 0) { console.error('✗ Indica --weight en kg (--weight 0.25)'); process.exit(1); }
  if (!cp) { console.error('✗ Indica --cp de destino (--cp 28001)'); process.exit(1); }

  const sa = await v2('/user/addresses/sender');
  const sender = (sa.sender_addresses ?? [])[0] ?? {};
  const fromPostal = String(sender.postal_code ?? '');
  const fromCountry = String(sender.country ?? 'ES').toUpperCase();

  const opts = await v3('/fetch-shipping-options', {
    method: 'POST',
    body: JSON.stringify({
      from_country_code: fromCountry, to_country_code: to,
      from_postal_code: fromPostal, to_postal_code: cp,
      weight: { value: weight.toFixed(3), unit: 'kg' }
    })
  });
  const cat = (await v2(`/shipping_methods/?from_country=${fromCountry}`)).shipping_methods ?? [];

  const rows = (opts.data ?? [])
    .filter((o: any) => o.carrier?.code !== 'sendcloud')
    .map((o: any) => {
      const cand = cat.find((m: any) =>
        m.carrier === o.carrier?.code &&
        weight >= parseFloat(m.min_weight) && weight <= parseFloat(m.max_weight) &&
        stripW(m.name).toLowerCase() === String(o.name).toLowerCase());
      return { id: cand?.id ?? null, name: o.name, price: priceForWeight(o, weight) };
    })
    .sort((a: any, b: any) => (a.price ?? Infinity) - (b.price ?? Infinity));

  console.log(`\nTarifas ${fromCountry}(${fromPostal}) → ${to}(${cp}) · ${weight} kg:\n`);
  for (const r of rows) {
    const id = r.id != null ? `id=${String(r.id).padStart(5)}` : '   (sin etiqueta)';
    console.log(`  ${id}  ${(r.price != null ? r.price.toFixed(2) + ' €' : '—').padStart(9)}  ${r.name}`);
  }
  console.log('\n→ Crea la etiqueta con: npm run envio -- label --order pedido.json --method <ID> --confirm\n');
}

async function cmdLabel(flags: Record<string, string | boolean>) {
  const orderPath = String(flags.order ?? '');
  if (!orderPath || !existsSync(orderPath)) { console.error('✗ Indica --order ruta.json (ver scripts/envio.ejemplo.json)'); process.exit(1); }
  const order = JSON.parse(readFileSync(orderPath, 'utf8'));
  const methodId = flags.method !== undefined ? Number(flags.method) : undefined;
  const confirm = flags.confirm === true;

  const missing = ['name', 'address', 'city', 'postal_code', 'country', 'weight'].filter((k) => !order[k]);
  if (missing.length) { console.error('✗ Faltan campos en el pedido:', missing.join(', ')); process.exit(1); }

  const parcel: any = {
    name: order.name, address: order.address, house_number: order.house_number ?? '',
    city: order.city, postal_code: order.postal_code, country: order.country,
    telephone: order.telephone ?? '', email: order.email ?? '',
    weight: Number(order.weight).toFixed(3),
    order_number: order.order_number ?? `3dcc-${Date.now()}`,
    request_label: true
  };
  if (methodId !== undefined) parcel.shipment = { id: methodId };

  if (!confirm) {
    console.log('\n— DRY-RUN — (no se crea nada). Payload:\n');
    console.log(JSON.stringify({ parcel }, null, 2));
    console.log('\nAñade --confirm para crear el envío y generar la etiqueta.\n');
    return;
  }

  console.log('\nCreando envío y generando etiqueta…');
  const created = await v2('/parcels', { method: 'POST', body: JSON.stringify({ parcel }) });
  const p = created.parcel;
  console.log(`  ✓ Parcel id: ${p.id}`);
  console.log(`  ✓ Tracking : ${p.tracking_number ?? '—'}`);
  if (p.tracking_url) console.log(`  ✓ Seguimiento: ${p.tracking_url}`);

  const labelUrl: string | undefined = p.label?.normal_printer?.[0] ?? p.label?.label_printer;
  if (labelUrl) {
    const res = await fetch(labelUrl, { headers: { Authorization: AUTH } });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await mkdir('etiquetas', { recursive: true });
      const file = path.join('etiquetas', `${p.tracking_number ?? p.id}.pdf`);
      await writeFile(file, buf);
      console.log(`  ✓ Etiqueta guardada en ${file}`);
    } else console.log('  ⚠ No se pudo descargar el PDF (HTTP ' + res.status + ').');
  } else console.log('  ⚠ La respuesta no trae URL de etiqueta.');
  console.log('');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  try {
    switch (cmd) {
      case 'methods': await cmdMethods(flags); break;
      case 'quote': await cmdQuote(flags); break;
      case 'label': await cmdLabel(flags); break;
      default:
        console.log(`Comandos:
  methods [--from ES] [--limit N]                 Catálogo v2 (ids), sin precio
  quote   --weight <kg> --cp <cpDestino> [--to ES]  Tarifas reales (v3) + id
  label   --order pedido.json --method <ID> [--confirm]
                                                  Crea envío + etiqueta PDF
                                                  (sin --confirm = dry-run)`);
    }
  } catch (e) {
    console.error('\n✗', e instanceof Error ? e.message : e, '\n');
    process.exit(1);
  }
}
main();
