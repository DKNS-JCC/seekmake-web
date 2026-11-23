import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

// Sin tarifas a propósito: los pedidos de grupo se cierran hablando.
const S: Servicio = {
  slug: 'grupos',
  categoria: 'grupos',
  title: 'Pedidos para grupos, clubes y empresas en Salamanca | 3DCC',
  description:
    'Llaveros de socio, trofeos, medallas y detalles con nombre para colegios, clubes, asociaciones y empresas de Salamanca. Precio a medida por WhatsApp.',
  nombre: 'Pedidos para grupos y empresas',
  h1: 'Para grupos',
  h1Accent: 'clubes, colegios y empresas',
  intro: 'Para clubes, asociaciones y empresas, con unidades, fecha y precio a vuestra medida.',
  pasos: [
    'Nos escribís con cuántas unidades, para qué es y la fecha.',
    'Os proponemos un diseño y os mandamos una foto de la muestra.',
    'Os pasamos un precio cerrado para todo el pedido.',
    'Lo imprimimos y os lo entregamos en mano o lo enviamos.'
  ],
  enviar: [
    'Número de unidades y fecha de entrega.',
    'El logo del colectivo, si lo lleva.',
    'La lista de nombres, si cada pieza va personalizada.'
  ],
  materiales: [
    'Casi todo va en PLA, en los colores de vuestro club o vuestra marca. Si algo va a estar al aire libre, lo hacemos en ASA, que aguanta el sol.'
  ],
  usos: [
    'Clubes y asociaciones: llaveros de socio, como los del Vespa Club de Valladolid, y trofeos de fin de temporada.',
    'Ligas y eventos: trofeos a medida para cada puesto.',
    'Colegios y AMPAs: medallas o un detalle con el nombre de cada alumno.',
    'Empresas: el amigo invisible, un detalle para clientes o el logo para la pared, como el de ECBUS.',
    'Hermandades: mini cofrades con los colores del hábito, como los de la Hermandad del Silencio.'
  ],
  faq: [
    {
      q: '¿Por qué no hay precios?',
      a: 'Porque depende de las unidades, el tamaño y la fecha. Preferimos hablarlo y daros un precio cerrado que poner una tarifa que no encaje con vuestro pedido.'
    },
    {
      q: '¿Podéis hacer una muestra antes?',
      a: 'Sí. Imprimimos la primera pieza y os mandamos una foto antes de hacer el resto.'
    },
    {
      q: '¿Y si el pedido es muy grande?',
      a: 'Si no llegamos a tiempo con nuestras máquinas, os lo decimos claramente desde el principio.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Queríamos hacer un pedido para un grupo.',
  hermano: { href: '/servicios/trofeos-y-medallas/', texto: 'los trofeos y medallas a medida' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
