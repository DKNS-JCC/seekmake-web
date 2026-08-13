/**
 * Descarga el PDF de un justificante desde su URL firmada.
 *
 * No usa `window.open`: la URL llega tras un `await` (la Edge Function tiene
 * que firmarla antes), y para entonces el navegador ya no considera el clic
 * como interacción del usuario, así que bloquea la ventana emergente. Se baja
 * el fichero a un blob y se pincha un enlace, igual que `downloadQuoteFile`.
 */
export async function descargarPdfFirmado(url: string, nombre: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga fallida (HTTP ${res.status})`);

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Un margen antes de liberar: Safari cancela la descarga si el object URL
  // desaparece en el mismo tick que el clic.
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
