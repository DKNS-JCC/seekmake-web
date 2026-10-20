import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

const S: Servicio = {
  slug: 'llaveros-personalizados',
  title: 'Llaveros personalizados en 3D | 3DCC',
  description:
    'Llaveros personalizados en 3D con nombre o logo, sueltos o en lotes para empresas. Taller en Salamanca, recogida en persona y envío a toda España.',
  nombre: 'Llaveros personalizados en 3D',
  h1: 'Llaveros personalizados',
  h1Accent: 'en 3D',
  intro:
    'Un llavero con un nombre, una fecha o un dibujo concreto es un regalo pequeño que se usa todos los días. En mi taller de Salamanca los imprimo en 3D, en un color o a dos colores, tanto sueltos para un regalo como en lotes para empresas, asociaciones o eventos que quieren llevar su logo encima.',
  pasos: [
    'Me cuentas por WhatsApp qué quieres: texto, logo o dibujo, y cuántas unidades.',
    'Te propongo la forma, los colores y el tamaño, y lo ajustamos hasta que te guste.',
    'Te paso precio y plazo. En lotes, puedo hacer uno de prueba antes de imprimir el resto.',
    'Los recoges en Salamanca o te los envío a cualquier punto de España.'
  ],
  enviar: [
    'El texto exacto, con mayúsculas, tildes y signos tal como los quieres.',
    'Si es un logo, mejor en vector (SVG, PDF o AI). Si no lo tienes, un PNG nítido también sirve.',
    'Los colores que te gustan. Puedes elegirlos en el muestrario.',
    'Para empresas: número de unidades y si hay una fecha que cumplir.'
  ],
  materiales: [
    'Para llaveros suelo usar PLA, que da colores vivos y un acabado muy limpio en los textos. Si el llavero va a llevar mucho trote, en el bolsillo con las llaves todos los días, PETG resiste mejor los golpes.',
    'Los llaveros a dos colores hacen que el texto o el logo destaquen sobre el fondo, y quedan mucho más vistosos que uno de un solo color.'
  ],
  usos: [
    'Regalos con el nombre de alguien, una fecha o una frase.',
    'Detalles para bodas, comuniones y cumpleaños.',
    'Llaveros corporativos con el logo de tu empresa o tu marca.',
    'Merchandising para asociaciones, clubes deportivos y eventos.',
    'Identificar llaves de casa, del trabajo o de un alquiler.'
  ],
  faq: [
    {
      q: '¿Puedo pedir un solo llavero?',
      a: 'Sí. Hago llaveros sueltos para regalar y también lotes. Escríbeme con lo que tienes en mente y lo vemos.'
    },
    {
      q: '¿Hacéis llaveros con el logo de una empresa?',
      a: 'Sí, hago llaveros corporativos en lotes. Lo ideal es que me mandes el logo en vector, y si hace falta lo adapto para que se lea bien en tamaño pequeño.'
    },
    {
      q: '¿De qué colores pueden ser?',
      a: 'Tengo más de 30 colores en el muestrario y puedo combinar dos en el mismo llavero. Si quieres ver uno de cerca, te mando una foto real.'
    },
    {
      q: '¿Enviáis fuera de Salamanca?',
      a: 'Sí, envío por mensajería a toda España. Si estás en Salamanca, también puedes recogerlos en persona.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Quería pedir llaveros personalizados en 3D.',
  hermano: { href: '/servicios/litofanias-personalizadas/', texto: 'las litofanías personalizadas con tus fotos' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
