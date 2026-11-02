import './faq.css';

// Plain strings on purpose: the same text feeds the visible list and the
// FAQPage JSON-LD, so they can never diverge.
const FAQS: { q: string; a: string }[] = [
  {
    q: '¿Cómo hago un pedido?',
    a: 'Si ya tienes el archivo (STL, 3MF u OBJ), súbelo a la calculadora de presupuesto online y verás el precio al momento. Si no tienes archivo o tienes dudas, escríbenos por WhatsApp con una foto o una idea de lo que necesitas y lo vemos juntos.'
  },
  {
    q: '¿Qué formas de pago aceptáis?',
    a: 'Efectivo, Bizum o transferencia bancaria. Te confirmamos el importe antes de empezar a imprimir.'
  },
  {
    q: '¿Puedo recoger el pedido en persona o lo enviáis?',
    a: 'Las dos cosas. Si estás en Salamanca puedes recogerlo en persona en la zona del Barrio Vidal, y si no, lo enviamos a cualquier punto de España. El plazo depende de la pieza y te lo confirmamos al hacer el pedido.'
  },
  {
    q: '¿Qué material me conviene: PLA, PETG, ASA, TPU o Nylon?',
    a: 'PLA para figuras, regalos y piezas decorativas de interior. PETG si la pieza va a recibir golpes, algo de calor o humedad. ASA para exterior, porque aguanta mejor el sol. TPU cuando necesitas algo flexible, como fundas o topes. Nylon para piezas técnicas que sufren desgaste. Si no lo tienes claro, cuéntanos para qué es y te recomendamos uno.'
  },
  {
    q: '¿Podéis copiar una pieza rota?',
    a: 'En muchos casos sí. Mándanos fotos de la pieza, mejor con una regla o un metro al lado para ver las medidas, y te decimos si se puede reproducir y en qué material. Es una buena solución para repuestos que ya no se fabrican.'
  },
  {
    q: '¿Qué formatos de archivo necesitáis?',
    a: 'La calculadora online acepta STL, 3MF y OBJ, que son los formatos que exportan casi todos los programas de diseño y las webs de modelos 3D.'
  },
  {
    q: '¿Diseñáis piezas desde cero si no tengo archivo?',
    a: 'Sí. A partir de una foto, unas medidas o un boceto preparamos el modelo antes de imprimirlo. Escríbenos por WhatsApp y te contamos cómo lo haríamos en tu caso.'
  },
  {
    q: '¿Puedo ver el color real antes de encargar?',
    a: 'Claro. En el muestrario tienes más de 30 colores, y si quieres estar seguro te mandamos una foto real del filamento antes de imprimir, porque en pantalla los colores pueden variar.'
  }
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a }
  }))
};

export function FaqSection() {
  return (
    <section id="faq" className="faq-section" aria-labelledby="faq-title">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="container-3dcc">
        <div className="section-header">
          <div className="section-tag">Preguntas frecuentes</div>
          <h2 id="faq-title" className="section-title">
            Lo que más nos preguntáis
          </h2>
        </div>
        <div className="faq-list">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="faq-item">
              <summary className="faq-q">{q}</summary>
              <p className="faq-a">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
