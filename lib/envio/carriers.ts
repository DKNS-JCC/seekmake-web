// Catálogo de transportistas: nombre presentable, color y cómo se sigue un
// envío suyo. Un objeto y no una tabla: son cinco datos que cambian una vez
// al año y no merece la pena una consulta para mostrarlos.
//
// `carrier` en la tabla `envios` guarda el código de Sendcloud, que no siempre
// es presentable ("correos_express", "postnl"). Aquí se traduce.

export type CarrierInfo = {
  /** Nombre para mostrar. */
  nombre: string;
  /** Color de marca, para el distintivo. */
  color: string;
  /** Página de seguimiento del transportista. */
  url: string;
  /**
   * true si su buscador exige el código postal de destino además del número.
   * Importante: hay que avisar al cliente en la interfaz en vez de prometerle
   * un enlace que le va a pedir un dato más.
   */
  pideCp?: boolean;
};

export const CARRIERS: Record<string, CarrierInfo> = {
  inpost: {
    nombre: 'InPost',
    color: '#FFCC00',
    url: 'https://www.inpost.es/seguimiento-del-envio/',
    pideCp: true
  },
  correos: {
    nombre: 'Correos',
    color: '#FFD800',
    url: 'https://www.correos.es/es/es/herramientas/localizador/envios'
  },
  correos_express: {
    nombre: 'Correos Express',
    color: '#E30613',
    url: 'https://www.correosexpress.com/web/correosexpress/social-tracking'
  },
  seur: {
    nombre: 'SEUR',
    color: '#CC0000',
    url: 'https://www.seur.com/livetracking/'
  },
  gls: {
    nombre: 'GLS',
    color: '#061AB1',
    url: 'https://mygls.gls-spain.es/e/'
  },
  ups: {
    nombre: 'UPS',
    color: '#351C15',
    url: 'https://www.ups.com/track?loc=es_ES'
  },
  dhl: {
    nombre: 'DHL',
    color: '#D40511',
    url: 'https://www.dhl.com/es-es/home/rastreo.html'
  },
  mrw: {
    nombre: 'MRW',
    color: '#0067B1',
    url: 'https://www.mrw.es/seguimiento_envios/MRW_resultado_consultas.asp'
  },
  ctt: {
    nombre: 'CTT Express',
    color: '#E2001A',
    url: 'https://www.cttexpress.com/localizador-de-envios/'
  }
};

export const CARRIER_GENERICO: CarrierInfo = {
  nombre: 'Transportista',
  color: '#64748B',
  url: ''
};

/** Info del transportista a partir del código de Sendcloud (o de lo que sea). */
export function carrierInfo(codigo: string | null | undefined): CarrierInfo {
  if (!codigo) return CARRIER_GENERICO;
  const k = String(codigo).toLowerCase().replace(/[\s-]+/g, '_');
  return CARRIERS[k] ?? CARRIER_GENERICO;
}

/** Opciones para el desplegable de alta manual, ordenadas por uso real. */
export const CARRIER_OPCIONES: { codigo: string; nombre: string }[] = [
  { codigo: 'inpost', nombre: 'InPost' },
  { codigo: 'correos_express', nombre: 'Correos Express' },
  { codigo: 'correos', nombre: 'Correos' },
  { codigo: 'seur', nombre: 'SEUR' },
  { codigo: 'gls', nombre: 'GLS' },
  { codigo: 'ctt', nombre: 'CTT Express' },
  { codigo: 'mrw', nombre: 'MRW' },
  { codigo: 'ups', nombre: 'UPS' },
  { codigo: 'dhl', nombre: 'DHL' },
  { codigo: 'otro', nombre: 'Otro' }
];

/**
 * Enlace de seguimiento a mostrar.
 *
 * Se prefiere SIEMPRE la `tracking_url` que devuelve Sendcloud: lleva el envío
 * incrustado y abre directamente en el estado del paquete. Solo cuando no la
 * hay (alta manual) se cae a la página genérica del transportista, donde el
 * cliente tendrá que pegar el número — y en InPost, también su código postal.
 */
export function urlSeguimiento(
  carrier: string | null | undefined,
  trackingUrl: string | null | undefined
): { url: string; directo: boolean; pideCp: boolean } {
  const info = carrierInfo(carrier);
  const propia = (trackingUrl ?? '').trim();
  if (propia.startsWith('http')) {
    return { url: propia, directo: true, pideCp: false };
  }
  return { url: info.url, directo: false, pideCp: info.pideCp === true };
}
