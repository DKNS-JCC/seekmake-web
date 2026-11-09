// npx tsx scripts/test-campana.ts — helpers of the email campaigns.
import assert from 'node:assert/strict';
import { encodeAsunto, tokenBaja, sustituir, escapeHtml } from '../supabase/functions/_shared/campana';

const decode = (s: string) =>
  s.split(' ').map((w) => {
    const m = w.match(/^=\?UTF-8\?B\?(.*)\?=$/);
    return m ? Buffer.from(m[1], 'base64').toString('utf8') : w;
  }).join('');

assert.equal(encodeAsunto('Hola 3DCC'), 'Hola 3DCC');
for (const s of ['Promoción de Navidad: -10 % en tu próxima impresión 🎄', 'Ñandú €€€ ççç áéíóú']) {
  const e = encodeAsunto(s);
  assert.match(e, /^[\x20-\x7E]+$/);
  assert.ok(e.split(' ').every((w) => w.length <= 75), 'encoded-word > 75');
  assert.equal(decode(e), s);
}

(async () => {
const t1 = await tokenBaja('Ana@Mail.com', 'k');
assert.equal(t1, await tokenBaja('ana@mail.com', 'k'));
assert.notEqual(t1, await tokenBaja('ana@mail.com', 'otra'));
assert.match(t1, /^[0-9a-f]{32}$/);

assert.equal(sustituir('Hola {{nombre}}, <a href="%7B%7Benlace_cupon%7D%7D">{{ cupon }}</a> {{otra}}',
  { nombre: '<Ana>', cupon: 'NAVI10', enlace_cupon: 'https://x/?c=1' }, escapeHtml),
  'Hola &lt;Ana&gt;, <a href="https://x/?c=1">NAVI10</a> {{otra}}');

console.log('✓ campana');
})();
