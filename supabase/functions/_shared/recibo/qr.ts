// QR del enlace de verificación, como matriz de módulos.
//
// No se genera un PNG: se devuelve la matriz y el PDF la dibuja con
// rectángulos vectoriales. Sale más nítido al imprimir, pesa menos y evita
// depender de un codificador de imágenes dentro de la Edge Function.

import qrcode from 'npm:qrcode-generator@2.0.4';

export type QrMatriz = {
  /** Módulos por lado (p. ej. 33 para un QR tipo 4). */
  size: number;
  /** Filas de tramos oscuros ya fusionados: [fila, colInicio, ancho]. */
  runs: [number, number, number][];
};

/**
 * Codifica `texto` y devuelve los módulos oscuros agrupados en tramos
 * horizontales. Fusionar los tramos reduce de ~500 rectángulos a ~120 sin
 * cambiar un pixel del resultado.
 *
 * Corrección de errores 'M': aguanta ~15 % de daño, suficiente para un
 * justificante impreso y doblado, sin inflar el tamaño del código.
 */
export function qrRuns(texto: string): QrMatriz {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();

  const size = qr.getModuleCount();
  const runs: [number, number, number][] = [];

  for (let row = 0; row < size; row++) {
    let start = -1;
    for (let col = 0; col <= size; col++) {
      const dark = col < size && qr.isDark(row, col);
      if (dark && start === -1) start = col;
      if (!dark && start !== -1) {
        runs.push([row, start, col - start]);
        start = -1;
      }
    }
  }

  return { size, runs };
}
