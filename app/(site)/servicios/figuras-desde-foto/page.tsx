import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

const S: Servicio = {
  slug: 'figuras-desde-foto',
  title: 'Figuras 3D desde tu foto en Salamanca | 3DCC',
  description:
    'Figuras impresas en 3D a partir de una foto: personas, parejas y mascotas. Taller en Salamanca, con recogida en persona o envío a toda España.',
  nombre: 'Figuras 3D desde una foto',
  h1: 'Figuras desde tu foto',
  h1Accent: 'impresas en 3D',
  intro:
    'Nos mandas una foto y la convertimos en una figura que se puede tener en la mano: una persona, una pareja o vuestra mascota. Preparamos el modelo a partir de la foto, lo ajustamos para que se imprima bien y lo imprimimos en nuestro taller de Salamanca. Fue de lo que más nos pidieron la Navidad pasada.',
  pasos: [
    'Nos mandas la foto por WhatsApp y nos dices qué tamaño quieres.',
    'Te decimos si la foto sirve. Si no, te pedimos otra antes de empezar.',
    'Preparamos el modelo 3D y te pasamos precio y plazo.',
    'La imprimimos y la recoges en Salamanca o te la enviamos.'
  ],
  enviar: [
    'Una foto de cuerpo entero, sin cortes en los pies ni en la cabeza.',
    'Buena luz y nada delante: ni mesas, ni otras personas, ni el brazo de quien hace la foto.',
    'Si es una mascota, mejor de lado o de frente, con todo el cuerpo a la vista.',
    'Permiso de quien sale en la foto, y siempre de sus padres si es un menor.'
  ],
  materiales: [
    'Las imprimimos en PLA, que recoge muy bien el detalle de la cara y la ropa. Puedes elegir el color en el muestrario.'
  ],
  usos: [
    'Regalos de Navidad, cumpleaños o aniversario.',
    'Un recuerdo de una mascota.',
    'Figuras de una pareja para una boda o un aniversario.',
    'Un detalle para los abuelos con los nietos.'
  ],
  faq: [
    {
      q: '¿Se parece de verdad a la persona?',
      a: 'Es una figura, no un escaneo: se reconocen la postura, la ropa y los rasgos principales. Si buscas una réplica exacta, cuéntanoslo y vemos si se puede.'
    },
    {
      q: '¿Podéis hacer personajes de películas o videojuegos?',
      a: 'No. No imprimimos personajes ni marcas de otros. Sí hacemos figuras de personas, mascotas y diseños propios.'
    },
    {
      q: '¿Qué hacéis con la foto?',
      a: 'La usamos solo para hacer tu figura y no la enseñamos a nadie sin tu permiso.'
    },
    {
      q: '¿Puedo pedirla aunque no viva en Salamanca?',
      a: 'Sí. Nos mandas la foto por WhatsApp, pagas por Bizum o transferencia y te la enviamos a cualquier punto de España.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Quería una figura a partir de una foto.',
  hermano: { href: '/servicios/litofanias-personalizadas/', texto: 'las litofanías personalizadas con tus fotos' },
  ficha: { precio: 'Desde 22 €', tamano: '10 cm de alto', plazo: '3 días de taller' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
