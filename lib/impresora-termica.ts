// Impresora térmica MXW01 («cat printer», 384 px de ancho) por Web Bluetooth.
// Protocolo sacado a mano (nov 2026): servicio 0xAE30; AE01 órdenes, AE02
// respuestas, AE03 datos de imagen. Cada orden: 22 21 <cmd> 00 <len LE> <datos> <crc8> FF.
// Solo Chrome/Edge en Android, Windows y Mac: Safari (iPhone) no tiene Web Bluetooth.

export const ANCHO = 384;
const BYTES_FILA = ANCHO / 8;
const MIN_FILAS = 90; // por debajo de esto la MXW01 no avanza el papel lo bastante

const uuid = (n: number) => `0000${n.toString(16)}-0000-1000-8000-00805f9b34fb`;

/** CRC-8 (poly 0x07, init 0) sobre los datos de la orden. */
export function crc8(datos: ArrayLike<number>): number {
  let c = 0;
  for (let i = 0; i < datos.length; i++) {
    c ^= datos[i];
    for (let b = 0; b < 8; b++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

export function orden(cmd: number, datos: number[]): Uint8Array {
  return new Uint8Array([0x22, 0x21, cmd, 0x00, datos.length & 0xff, datos.length >> 8, ...datos, crc8(datos), 0xff]);
}

/** Píxeles RGBA → 1 bit por píxel; bit 0 = píxel más a la izquierda. Rellena hasta MIN_FILAS. */
export function empaquetar(rgba: ArrayLike<number>, alto: number): { filas: number; datos: Uint8Array } {
  const filas = Math.max(alto, MIN_FILAS);
  const datos = new Uint8Array(filas * BYTES_FILA);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ANCHO; x++) {
      const p = (y * ANCHO + x) * 4;
      const luz = (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3;
      if (rgba[p + 3] > 127 && luz < 128) datos[y * BYTES_FILA + (x >> 3)] |= 1 << (x & 7);
    }
  }
  return { filas, datos };
}

// Lo mínimo de Web Bluetooth que usamos (TypeScript no lo trae).
type Caracteristica = EventTarget & {
  value?: DataView;
  writeValueWithoutResponse(v: Uint8Array): Promise<void>;
  startNotifications(): Promise<Caracteristica>;
};
type Dispositivo = {
  gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(u: string): Promise<{ getCharacteristic(u: string): Promise<Caracteristica> }> }> };
};
type Bluetooth = { requestDevice(o: unknown): Promise<Dispositivo> };

export const hayBluetooth = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

let dispositivo: Dispositivo | null = null;
let canales: { ctrl: Caracteristica; datos: Caracteristica; resp: Caracteristica } | null = null;

async function conectar() {
  if (canales && dispositivo?.gatt?.connected) return canales;
  // La primera vez Chrome enseña el selector (necesita un toque del usuario); luego se reutiliza.
  dispositivo ??= await (navigator as unknown as { bluetooth: Bluetooth }).bluetooth.requestDevice({
    filters: [{ namePrefix: 'MXW' }],
    optionalServices: [uuid(0xae30)]
  });
  const srv = await (await dispositivo.gatt!.connect()).getPrimaryService(uuid(0xae30));
  const [ctrl, resp, datos] = await Promise.all([0xae01, 0xae02, 0xae03].map((n) => srv.getCharacteristic(uuid(n))));
  await resp.startNotifications();
  canales = { ctrl, datos, resp };
  return canales;
}

/** Espera la respuesta de la impresora a la orden `cmd`. */
function respuesta(resp: Caracteristica, cmd: number, ms: number): Promise<Uint8Array> {
  return new Promise((ok, mal) => {
    const fin = setTimeout(() => (resp.removeEventListener('characteristicvaluechanged', oir), mal(new Error('La impresora no responde'))), ms);
    function oir() {
      const v = new Uint8Array(resp.value!.buffer.slice(0));
      if (v[2] !== cmd) return;
      clearTimeout(fin);
      resp.removeEventListener('characteristicvaluechanged', oir);
      ok(v);
    }
    resp.addEventListener('characteristicvaluechanged', oir);
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Imprime un canvas de 384 px de ancho.
 * `intensidad` (0–255) es el calor del cabezal: más alto = más negro. 0x5D salió bien en pruebas.
 */
export async function imprimirCanvas(canvas: HTMLCanvasElement, intensidad = 0x5d): Promise<void> {
  if (canvas.width !== ANCHO) throw new Error(`El canvas debe medir ${ANCHO} px de ancho`);
  const { filas, datos } = empaquetar(canvas.getContext('2d')!.getImageData(0, 0, ANCHO, canvas.height).data, canvas.height);
  const { ctrl, datos: canal, resp } = await conectar();

  const estado = respuesta(resp, 0xa1, 5000);
  await ctrl.writeValueWithoutResponse(orden(0xa2, [intensidad]));
  await ctrl.writeValueWithoutResponse(orden(0xa1, [0x00]));
  // A1 → v[9] batería %, v[10] temperatura °C, v[12] 0 = lista.
  if ((await estado)[12] !== 0) throw new Error('La impresora no está lista (¿sin papel o tapa abierta?)');

  const listo = respuesta(resp, 0xa9, 5000);
  await ctrl.writeValueWithoutResponse(orden(0xa9, [filas & 0xff, filas >> 8, 0x30, 0x00]));
  if ((await listo)[6] !== 0) throw new Error('La impresora rechazó el trabajo');

  const hecho = respuesta(resp, 0xaa, 30000);
  for (let i = 0; i < datos.length; i += BYTES_FILA) {
    await canal.writeValueWithoutResponse(datos.slice(i, i + BYTES_FILA));
    await esperar(5); // ponytail: ritmo fijo que funcionó en pruebas; subir si se corta la imagen
  }
  await ctrl.writeValueWithoutResponse(orden(0xad, [0x00]));
  await hecho;
}
