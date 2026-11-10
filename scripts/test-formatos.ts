// Números y duraciones tecleados en «Nuevo encargo» (lib/quote/formatos.ts).
//
//   npx tsx scripts/test-formatos.ts

import { formatGramos, formatHoras, parseHoras, parseNumero } from '../lib/quote/formatos';
import { check, done, eq, section } from './_assert';

section('números');
eq('12,5', parseNumero('12,5')!, 12.5);
eq('12.5', parseNumero('12.5')!, 12.5);
eq('pegado «12,5 g»', parseNumero('12,5 g')!, 12.5);
check('vacío → null', parseNumero('  ') === null);
check('«abc» → NaN', Number.isNaN(parseNumero('abc')));

section('duraciones (entrada rápida)');
const h = (t: string) => parseHoras(t)!;
const m = 1 / 60;
eq('1h31', h('1h31'), 1 + 31 * m, 1e-9);
eq('1:31', h('1:31'), 1 + 31 * m, 1e-9);
eq('91 son minutos', h('91'), 1 + 31 * m, 1e-9);
eq('1,5 son horas', h('1,5'), 1.5, 1e-9);
for (const t of ['2,5', '2.5', '2:30', '2h 30m', '150 min', '2h30']) eq(`${t} → 2 h 30 min`, h(t), 2.5, 1e-9);
eq('copiado de Orca «1h 31m 14s»', h('1h 31m 14s'), 1 + 31 * m + 14 / 3600, 1e-9);
eq('1d 2h', h('1d 2h'), 26, 1e-9);
check('«2 horitas» no se entiende', Number.isNaN(parseHoras('2 horitas')));
check('vacío → null', parseHoras('') === null);

section('lectura');
check('formatHoras', formatHoras(2.5) === '2 h 30 min' && formatHoras(0.75) === '45 min' && formatHoras(3) === '3 h');
check('formatGramos', formatGramos(14.41) === '14,4 g' && formatGramos(1250) === '1,25 kg' && formatGramos(12) === '12 g');

done();
