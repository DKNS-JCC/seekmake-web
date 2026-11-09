// When the customer can expect our answer, for the confirmation screen.
// shortcut: fixed shop hours (Mon–Fri; asked before 17:00 → answered by 20:00,
// otherwise by 13:00 the next working day; holidays ignored). Move to
// quote_settings if the hours change often.

const laborable = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5;

export function plazoRespuesta(ahora: Date = new Date()): string {
  if (laborable(ahora) && ahora.getHours() < 17) return 'hoy antes de las 20:00';
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  let saltos = 0;
  do {
    dia.setDate(dia.getDate() + 1);
    saltos++;
  } while (!laborable(dia));
  const cuando = saltos === 1 ? 'mañana' : `el ${dia.toLocaleDateString('es-ES', { weekday: 'long' })}`;
  return `${cuando} antes de las 13:00`;
}
