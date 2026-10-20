import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

const S: Servicio = {
  slug: 'repuestos-impresion-3d',
  title: 'Repuestos y piezas que ya no se fabrican | 3DCC',
  description:
    'Repuestos impresos en 3D a partir de fotos con medidas o de la pieza rota. Taller en Salamanca con recogida en persona y envío a toda España.',
  nombre: 'Repuestos e impresión 3D de piezas descatalogadas',
  h1: 'Repuestos y piezas',
  h1Accent: 'que ya no se fabrican',
  intro:
    'Se rompe una pestaña de plástico y el fabricante ya no la vende, o te piden el aparato entero por una pieza de nada. En mi taller de Salamanca copio esas piezas en impresión 3D a partir de fotos con medidas o de la pieza rota que me traes en mano, para que no tengas que tirar algo que todavía funciona.',
  pasos: [
    'Me escribes por WhatsApp con fotos de la pieza y de dónde va montada.',
    'Te digo si se puede reproducir en impresión 3D y qué material recomiendo.',
    'Modelo la pieza en 3D a partir de tus medidas o de la pieza original.',
    'Te paso precio y plazo, la imprimo y la recoges en Salamanca o te la envío.'
  ],
  enviar: [
    'Fotos de la pieza desde varios ángulos, a ser posible junto a una regla o un metro.',
    'Las medidas principales tomadas con calibre si tienes uno: largo, ancho, grosor y diámetros de agujeros.',
    'Una foto de la pieza montada, para entender qué esfuerzo tiene que aguantar.',
    'Si estás en Salamanca, lo más fiable es traerme la pieza rota en persona y la mido yo.'
  ],
  materiales: [
    'PETG es mi opción por defecto para repuestos: aguanta mejor los golpes y el calor moderado que el PLA. Para piezas que van al sol o a la intemperie uso ASA, y para topes, tacos o juntas que necesitan flexibilidad, TPU.',
    'Lo que no hago son piezas de seguridad (frenos, sujeciones de carga, nada de lo que dependa que alguien no se haga daño) ni piezas que van cerca de fuentes de mucho calor. Si tu pieza entra ahí, te lo digo con sinceridad.'
  ],
  usos: [
    'Clips, pestañas y tapas de electrodomésticos.',
    'Piezas de persianas, cortinas y muebles.',
    'Embellecedores y soportes del interior del coche que no son de seguridad.',
    'Ruedas, topes y patas de mobiliario o juguetes.',
    'Piezas de aparatos antiguos que ya no tienen recambio oficial.'
  ],
  faq: [
    {
      q: '¿Puedes copiar una pieza solo con fotos?',
      a: 'Muchas veces sí, si las fotos van acompañadas de medidas. En piezas con encajes muy justos lo ideal es tener la pieza en mano, y si estás en Salamanca puedes traérmela.'
    },
    {
      q: '¿La pieza impresa aguanta igual que la original?',
      a: 'Depende de la pieza y del esfuerzo que tenga. Elijo el material pensando en ese uso y, si veo que no va a aguantar, te lo digo antes de imprimir.'
    },
    {
      q: '¿Haces piezas para el coche?',
      a: 'Hago embellecedores, tapas y soportes que no afectan a la seguridad. No imprimo piezas de frenos, dirección, sujeción ni nada que vaya junto al motor.'
    },
    {
      q: '¿Y si ya tengo el archivo STL?',
      a: 'Mejor aún. Súbelo a la calculadora de presupuesto y verás el precio al momento.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Necesito un repuesto impreso en 3D, os mando fotos y medidas.',
  hermano: { href: '/servicios/diseno-3d-a-medida/', texto: 'el diseño 3D a medida desde una foto o boceto' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
