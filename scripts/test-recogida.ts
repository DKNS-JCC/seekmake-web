// npx tsx scripts/test-recogida.ts — pickup appointment helpers.
import assert from 'node:assert/strict';
import { madridISO, parseHorasCita, citaCorta, parseFranjas, diasEntre } from '../lib/recogida';

assert.equal(madridISO('2026-12-02', '18:00'), '2026-12-02T17:00:00.000Z'); // winter, UTC+1
assert.equal(madridISO('2027-07-01', '18:00'), '2027-07-01T16:00:00.000Z'); // summer, UTC+2
assert.deepEqual(parseHorasCita('17, 17:30 18.15;9h00'), ['17:00', '17:30', '18:15', '09:00']);
assert.equal(parseHorasCita('17:00, mañana'), null);
assert.equal(parseHorasCita('25:00'), null);
assert.equal(parseHorasCita(''), null);
assert.match(citaCorta('2026-12-02T17:00:00.000Z'), /2 dic · 18:00/);
assert.deepEqual(parseFranjas('10-11:30, 20:00-21', 30), ['10:00', '10:30', '11:00', '20:00', '20:30']);
assert.deepEqual(parseFranjas('10 a 11', 20), ['10:00', '10:20', '10:40']);
assert.equal(parseFranjas('14-10', 30), null);
assert.equal(parseFranjas('10', 30), null);
assert.equal(parseFranjas('10-12', 0), null);
// Mon-Fri, 1-7 Dec 2026 (1 Dec is a Tuesday).
assert.deepEqual(diasEntre('2026-12-01', '2026-12-07', [1, 2, 3, 4, 5]), ['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-07']);
assert.deepEqual(diasEntre('2026-12-05', '2026-12-01', [0, 1, 2, 3, 4, 5, 6]), []);
console.log('test-recogida ok');
