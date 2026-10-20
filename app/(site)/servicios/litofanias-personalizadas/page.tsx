import ServicioLanding, { servicioMetadata, type Servicio } from '../ServicioLanding';

const S: Servicio = {
  slug: 'litofanias-personalizadas',
  title: 'Litofanías personalizadas impresas en 3D | 3DCC',
  description:
    'Litofanías con tu foto impresas en 3D en un taller de Salamanca. Recogida en persona o envío a toda España. Calcula el precio o escríbeme por WhatsApp.',
  nombre: 'Litofanías personalizadas',
  h1: 'Litofanías personalizadas',
  h1Accent: 'impresas en 3D',
  intro:
    'Una litofanía es una foto convertida en relieve: a simple vista parece una placa blanca con textura, pero cuando le pones luz detrás aparece la imagen con todos sus tonos. Las imprimo una a una en mi taller de Salamanca a partir de la foto que tú me mandes, y es de los regalos que más emocionan cuando se encienden por primera vez.',
  pasos: [
    'Me mandas la foto por WhatsApp y me cuentas qué tamaño tienes en mente.',
    'Reviso la imagen y te digo si va a quedar bien o si conviene recortarla o usar otra.',
    'Te paso el precio y el plazo. Cuando lo confirmas, la preparo e imprimo.',
    'La recoges en Salamanca o te la envío bien protegida a casa.'
  ],
  enviar: [
    'La foto original con la mejor resolución que tengas, no una captura de pantalla ni la que se reenvía comprimida.',
    'Mejor si las caras se ven grandes y con buena luz. Los fondos sencillos ayudan mucho.',
    'Si quieres un encuadre concreto, dímelo. Si no, te propongo yo uno.'
  ],
  materiales: [
    'Para litofanías uso PLA blanco: deja pasar la luz de forma uniforme y es el que mejor reproduce los grises de la foto. Los colores oscuros no sirven, porque la luz no los atraviesa.',
    'Es una pieza decorativa pensada para interior. Para verla en todo su detalle, ponla delante de una ventana o con una luz detrás.'
  ],
  usos: [
    'Regalos de aniversario, bodas o cumpleaños con una foto especial.',
    'Recuerdos de alguien que ya no está, o de una mascota.',
    'Fotos de los peques o de un viaje para tener en una estantería junto a la ventana.',
    'Detalles para el Día de la Madre, del Padre o Navidad.'
  ],
  faq: [
    {
      q: '¿Sirve cualquier foto para una litofanía?',
      a: 'Casi cualquiera, pero quedan mejor las fotos nítidas, con buena luz y con las caras grandes. Si la tuya no va a quedar bien, te lo digo antes de imprimir.'
    },
    {
      q: '¿La litofanía se ve en color?',
      a: 'No. Se imprime en PLA blanco y la imagen aparece en tonos de gris al ponerle luz detrás. Ese efecto en blanco y negro es justo lo que la hace especial.'
    },
    {
      q: '¿Puedo pedirla aunque no viva en Salamanca?',
      a: 'Sí. Me mandas la foto por WhatsApp, pagas por Bizum o transferencia y te la envío por mensajería a cualquier punto de España.'
    },
    {
      q: '¿Cuánto tarda?',
      a: 'Depende del tamaño y de los pedidos que tenga en ese momento. Te confirmo el plazo al hacer el encargo, para que sepas si llega a tiempo para tu fecha.'
    }
  ],
  waMensaje: 'Hola, os escribo desde la web. Quería pedir una litofanía personalizada con una foto.',
  hermano: { href: '/servicios/llaveros-personalizados/', texto: 'los llaveros personalizados en 3D' }
};

export const metadata = servicioMetadata(S);

export default function Page() {
  return <ServicioLanding s={S} />;
}
