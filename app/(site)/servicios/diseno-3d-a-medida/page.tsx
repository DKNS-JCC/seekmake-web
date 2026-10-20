import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

const S: Servicio = {
  slug: 'diseno-3d-a-medida',
  title: 'Diseño 3D a medida desde una foto o boceto | 3DCC',
  description:
    'Diseño 3D a medida desde una foto, un boceto o unas medidas, e impresión de la pieza. Taller en Salamanca con recogida en persona y envío a toda España.',
  nombre: 'Diseño 3D a medida',
  h1: 'Diseño 3D a medida',
  h1Accent: 'desde una foto o boceto',
  intro:
    'No hace falta que tengas un archivo 3D ni que sepas modelar. Si tienes una idea, un dibujo en una servilleta o una foto de algo parecido a lo que buscas, yo me encargo de convertirlo en un modelo 3D y de imprimirlo en mi taller de Salamanca.',
  pasos: [
    'Me explicas por WhatsApp qué necesitas y para qué lo vas a usar.',
    'Me mandas fotos, bocetos y medidas, y te hago las preguntas que hagan falta.',
    'Diseño la pieza en 3D y te paso precio y plazo.',
    'La imprimo en el material que mejor encaje y la recoges en Salamanca o te la envío.'
  ],
  enviar: [
    'Un boceto a mano con las medidas apuntadas. No tiene que ser bonito, solo claro.',
    'Fotos de dónde va a ir la pieza, con una regla o un metro para tener referencia.',
    'Si te inspiras en algo que ya existe, una foto o un enlace.',
    'Qué tiene que aguantar: peso, sol, humedad, flexión. Me ayuda a elegir material.'
  ],
  materiales: [
    'PLA va muy bien para piezas decorativas, maquetas y prototipos. PETG para piezas de uso diario que tienen que aguantar más. ASA para exterior, porque soporta mejor el sol. TPU cuando la pieza tiene que doblarse, como fundas, topes o juntas.',
    'También puedo hacer piezas multicolor cuando el diseño lo pide. Si no sabes cuál elegir, cuéntame el uso y te recomiendo uno.'
  ],
  usos: [
    'Soportes y adaptadores para algo que ya tienes en casa o en el taller.',
    'Organizadores a la medida exacta de un cajón o una estantería.',
    'Prototipos de un producto antes de fabricarlo en serie.',
    'Carcasas para electrónica y proyectos de bricolaje.',
    'Piezas que se rompieron y de las que no hay archivo ni recambio.'
  ],
  faq: [
    {
      q: '¿Necesito saber diseño 3D?',
      a: 'No. Con una buena explicación, fotos y medidas es suficiente. El diseño lo hago yo.'
    },
    {
      q: '¿Puedo pedir solo una unidad?',
      a: 'Sí. Muchos encargos de diseño a medida son de una sola pieza, justo porque no existe en ninguna tienda.'
    },
    {
      q: '¿Qué medidas tengo que tomar?',
      a: 'Las que definen cómo encaja la pieza: largo, ancho, alto, grosor y diámetro de los agujeros. Si tienes calibre, mejor. Si dudas, mándame fotos y te digo cuáles faltan.'
    },
    {
      q: '¿Hay piezas que no hagas?',
      a: 'No hago piezas de seguridad ni piezas que vayan a estar cerca de fuentes de mucho calor. Para el resto, cuéntame la idea y vemos si se puede.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Quería un diseño 3D a medida a partir de una foto o boceto.',
  hermano: { href: '/servicios/repuestos-impresion-3d/', texto: 'los repuestos de piezas que ya no se fabrican' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
