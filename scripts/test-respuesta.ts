//   npx tsx scripts/test-respuesta.ts
import { plazoRespuesta } from '../lib/quote/respuesta';
import { check, done, section } from './_assert';

const eq = (label: string, got: string, want: string) => check(label, got === want, `got ${got}`);

section('plazo de respuesta');
// 2026-11-09 is a Monday.
eq('lunes 10:00', plazoRespuesta(new Date(2026, 10, 9, 10)), 'hoy antes de las 20:00');
eq('lunes 23:00', plazoRespuesta(new Date(2026, 10, 9, 23)), 'mañana antes de las 13:00');
eq('viernes 18:00', plazoRespuesta(new Date(2026, 10, 13, 18)), 'el lunes antes de las 13:00');
eq('sábado 11:00', plazoRespuesta(new Date(2026, 10, 14, 11)), 'el lunes antes de las 13:00');
eq('domingo 22:00', plazoRespuesta(new Date(2026, 10, 15, 22)), 'mañana antes de las 13:00');
done();
