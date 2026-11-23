import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

const S: Servicio = {
  slug: 'trofeos-y-medallas',
  categoria: 'grupos',
  title: 'Trofeos y medallas personalizados en Salamanca | 3DCC',
  description:
    'Trofeos y medallas impresos en 3D con vuestro diseño, para clubes, colegios, ligas y asociaciones. Desde pocas unidades, en un taller de Salamanca.',
  nombre: 'Trofeos y medallas personalizados',
  h1: 'Trofeos y medallas',
  h1Accent: 'a medida',
  intro: 'Con vuestro logo y colores, para el club, el cole o la liga. Desde pocas unidades.',
  pasos: [
    'Nos contáis el evento, cuántas unidades necesitáis y para qué fecha.',
    'Os proponemos un diseño con vuestro logo y colores.',
    'Os pasamos una foto de la primera pieza y el precio cerrado.',
    'Imprimimos el resto y os lo entregamos en mano en Salamanca o lo enviamos.'
  ],
  enviar: [
    'El logo, mejor en vector (SVG o PDF). Si no lo tenéis, un PNG nítido sirve.',
    'Los textos exactos: nombre del torneo, año, puestos o nombres.',
    'Cuántas unidades de cada tipo, por ejemplo 1 primero, 1 segundo y 10 medallas.',
    'La fecha del evento, para organizarnos desde el principio.'
  ],
  materiales: [
    'Los hacemos en PLA combinando colores: la peana en uno, la figura en otro y el texto en relieve, sin pegatinas ni pintura que se despegue.'
  ],
  usos: [
    'Trofeos de ligas y torneos, como los de la liga de simracing Formula A.',
    'Aniversarios de asociaciones, como los 15 años del Grupo Joven Pizarrales.',
    'Medallas de fin de curso para colegios y AMPAs.',
    'Reconocimientos para empresas y equipos.'
  ],
  faq: [
    {
      q: '¿Cuántas unidades hay que pedir como mínimo?',
      a: 'Una. Un solo trofeo también se hace; con más unidades sale mejor de precio cada una.'
    },
    {
      q: '¿Cuánto cuestan?',
      a: 'Depende del tamaño y de las unidades. Escríbenos por WhatsApp con lo que necesitáis y os pasamos un precio cerrado.'
    },
    {
      q: '¿Con cuánta antelación hay que pedirlos?',
      a: 'Depende de las unidades. En cuanto sepáis la fecha del evento, escribidnos y os decimos si llegamos.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Queríamos trofeos o medallas personalizados.',
  hermano: { href: '/servicios/grupos/', texto: 'los pedidos para grupos, clubes y empresas' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
