import Link from 'next/link';
import type { Metadata } from 'next';
import './terminos.css';

export const metadata: Metadata = {
  title: 'Términos y Condiciones - 3DCC Salamanca',
  description:
    'Términos y condiciones del servicio de impresión 3D de 3DCC Salamanca.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://impresion3dcc.com/terminos' }
};

export default function TerminosPage() {
  return (
    <>
      <nav id="navbar">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <img src="/icons/android-chrome-192x192.png" alt="3DCC Logo" />
            <div>
              <span className="nav-logo-name">3DCC</span>
              <span className="nav-logo-sub">Impresión 3D</span>
            </div>
          </Link>
          <Link href="/" className="back-link">
            ← Volver al inicio
          </Link>
        </div>
      </nav>

      <main id="main" className="terms-page">
        <div className="container-3dcc">
          <div className="section-tag">Legal</div>
          <h1 className="section-title">Términos y Condiciones</h1>
          <p
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: 'var(--muted)',
              marginTop: 12,
              letterSpacing: '0.1em'
            }}
          >
            Última actualización: 1 de mayo de 2026
          </p>

          <div className="terms-card">
            <div className="notice-box">
              <h2 style={{ marginTop: 0 }}>Información previa</h2>
              <p>
                Este sitio ofrece un servicio de impresión 3D realizado de
                forma <strong>artesanal</strong>, con equipos domésticos y
                semi-profesionales y producción de pequeño volumen. Cada
                encargo se valora y se acuerda de manera individualizada. La
                realización de cualquier encargo requiere la aceptación previa
                y expresa de los presentes Términos.
              </p>
            </div>

            <h2>1. Información del responsable</h2>
            <p>
              En cumplimiento de lo previsto en el artículo 10 de la Ley
              34/2002, de Servicios de la Sociedad de la Información y de
              Comercio Electrónico (LSSI-CE), se informa de los datos
              identificativos del responsable de este sitio web:
            </p>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li>
                <strong>Titular:</strong> JORGE CUADRADO CRIADO
              </li>
              <li>
                <strong>Email:</strong>{' '}
                <a href="mailto:info@impresion3dcc.com">
                  info@impresion3dcc.com
                </a>
              </li>
              <li>
                <strong>Teléfono / WhatsApp:</strong>{' '}
                <a href="tel:+34665148956">+34 665 14 89 56</a>
              </li>
            </ul>

            <h2>2. Objeto y naturaleza del servicio</h2>
            <p>
              A través de este sitio web se ofrece un servicio de impresión 3D
              realizado con equipos domésticos y semi-profesionales, con
              producción artesanal y de pequeño volumen. Cada encargo se
              valora y se acuerda de forma individualizada con el cliente,
              atendiendo a las características técnicas del modelo, los
              materiales disponibles y la disponibilidad del equipo.
            </p>
            <p>
              El servicio se presta con las limitaciones técnicas propias de
              la impresión 3D doméstica, descritas en la cláusula 8.
            </p>

            <h2>3. Aceptación expresa de los Términos</h2>
            <p>
              La realización de cualquier encargo requiere la aceptación
              previa y expresa de los presentes Términos por parte del
              cliente, que se entenderá producida cuando, tras haber recibido
              el presupuesto y un enlace o copia de este documento, el cliente
              confirme por escrito (email, WhatsApp u otro medio equivalente)
              su conformidad con el encargo y con estas condiciones.
            </p>
            <p>
              La mera navegación por el sitio web no implica aceptación de
              estos Términos a efectos contractuales: la aceptación se produce
              únicamente con la confirmación del encargo conforme al párrafo
              anterior.
            </p>

            <h2>4. Solicitud de presupuesto y formalización del encargo</h2>
            <p>
              Los presupuestos generados a través de la web o comunicados por
              mensaje son <strong>orientativos</strong> y pueden ajustarse en
              función de:
            </p>
            <ul>
              <li>
                la complejidad geométrica del modelo y los soportes
                necesarios,
              </li>
              <li>el material seleccionado y su disponibilidad,</li>
              <li>el tamaño, peso y volumen final de la pieza,</li>
              <li>los gastos de envío o entrega.</li>
            </ul>
            <p>
              El presupuesto definitivo se confirmará por escrito antes de
              iniciar la impresión. Cualquier modificación posterior
              solicitada por el cliente podrá implicar una revisión del precio
              y del plazo.
            </p>

            <h2>5. Pago</h2>
            <ul>
              <li>
                El pago se solicita <strong>antes del envío</strong> y, en
                encargos de cierta entidad, antes de iniciar la impresión.
              </li>
              <li>
                Los medios de pago admitidos se acuerdan con el cliente en
                cada caso (transferencia bancaria, Bizum u otros).
              </li>
              <li>
                El pago confirma la conformidad del cliente con el presupuesto
                definitivo y con estos Términos.
              </li>
            </ul>

            <h2>6. Plazos de entrega</h2>
            <p>
              Los plazos comunicados son <strong>estimativos</strong> y se
              calculan a partir de la confirmación del encargo y del cobro,
              salvo acuerdo en contrario. Pueden verse afectados por la
              complejidad del trabajo, incidencias técnicas (fallos de
              impresión, agotamiento de material) o por los plazos del
              transportista, sin que ello dé lugar a indemnización siempre que
              el retraso se comunique al cliente con la mayor brevedad
              posible.
            </p>
            <p>
              Si el cliente necesita una fecha cierta de entrega, deberá
              comunicarlo antes de aceptar el presupuesto, para valorar su
              viabilidad.
            </p>

            <h2>7. Cancelación del encargo y derecho de desistimiento</h2>
            <p>
              <strong>7.1. Antes del inicio de la impresión.</strong> El
              cliente puede cancelar el encargo sin coste mientras la
              impresión no haya comenzado, salvo que ya se hubiera adquirido
              material específico para el trabajo, en cuyo caso se descontará
              dicho coste de la devolución.
            </p>
            <p>
              <strong>7.2. Una vez iniciada la impresión.</strong> Iniciada la
              impresión, no procede la devolución del importe correspondiente
              al material y tiempo de máquina ya empleados, dado que se trata
              de un bien confeccionado a medida.
            </p>
            <p>
              <strong>7.3. Exclusión del derecho de desistimiento.</strong>{' '}
              Conforme al artículo 103.c) del Real Decreto Legislativo 1/2007,
              de 16 de noviembre, por el que se aprueba el texto refundido de
              la Ley General para la Defensa de los Consumidores y Usuarios
              (LGDCU), <strong>no procede el derecho de desistimiento de 14
              días naturales</strong> previsto en el artículo 102 LGDCU, al
              tratarse de bienes confeccionados conforme a las
              especificaciones del consumidor o claramente personalizados.
            </p>
            <p>
              Esta exclusión se informa expresamente al cliente con carácter
              previo a la formalización de cada encargo.
            </p>

            <h2>8. Calidad y características técnicas</h2>
            <p>
              Las impresiones se realizan con tecnología FDM/FFF y/o resina
              mediante equipos domésticos o semi-profesionales. El cliente
              reconoce y acepta que las piezas pueden presentar
              características inherentes a estas tecnologías, en particular:
            </p>
            <ul>
              <li>líneas de capa visibles propias del proceso aditivo,</li>
              <li>pequeñas imperfecciones superficiales,</li>
              <li>
                variaciones leves de tonalidad entre lotes de filamento o
                resina,
              </li>
              <li>
                necesidad de post-procesado (lijado, imprimación, pintura)
                para alcanzar acabados profesionales o estéticos avanzados.
              </li>
            </ul>
            <p>
              Estas características no constituyen defecto y no dan derecho a
              sustitución, salvo cuando se aparten razonablemente de lo
              pactado o de las muestras facilitadas. A petición del cliente,
              se enviarán fotografías de la pieza terminada antes del envío
              para su validación.
            </p>

            <h2>9. Garantía legal de conformidad</h2>
            <p>
              No se ofrece garantía comercial adicional,{' '}
              <strong>sin perjuicio de la garantía legal de conformidad</strong>{' '}
              prevista en los artículos 114 y siguientes de la LGDCU, que se
              aplica en todo caso a los consumidores.
            </p>
            <p>
              En caso de falta de conformidad imputable al servicio (por
              ejemplo, una pieza que no se corresponde con lo pactado o que
              presenta defectos no atribuibles a las limitaciones técnicas
              descritas en la cláusula 8), el cliente podrá optar entre la
              reparación, sustitución, rebaja proporcional del precio o
              resolución del contrato, en los términos previstos en la ley.
            </p>
            <p>
              Las reclamaciones por falta de conformidad deben comunicarse en
              cuanto el cliente tenga conocimiento de ellas, aportando
              fotografías de la pieza recibida y, si es posible, del embalaje.
            </p>

            <h2>10. Propiedad intelectual e industrial</h2>
            <p>
              <strong>10.1. Modelos aportados por el cliente.</strong> El
              cliente declara y garantiza, al solicitar un encargo, que es
              titular de los derechos necesarios sobre el modelo 3D enviado o
              que cuenta con la licencia o autorización suficiente para su
              impresión, y que dicho modelo no infringe derechos de autor,
              marcas, dibujos o modelos industriales, patentes ni cualesquiera
              otros derechos de terceros.
            </p>
            <p>
              <strong>10.2. Indemnidad.</strong> El cliente{' '}
              <strong>mantendrá indemne</strong> al titular de este sitio web
              frente a cualquier reclamación, sanción, indemnización, gasto de
              defensa jurídica o coste que se derive de una reclamación de
              tercero relacionada con los derechos de propiedad intelectual,
              industrial o de imagen sobre el modelo aportado.
            </p>
            <p>
              <strong>10.3. Derecho de rechazo.</strong> El titular se reserva
              el derecho a rechazar cualquier encargo que, a su criterio
              razonable, pueda infringir derechos de terceros o que contenga
              material ofensivo, ilegal o claramente inapropiado, sin que ello
              dé lugar a indemnización.
            </p>
            <p>
              <strong>10.4. Contenido del sitio web.</strong> Los textos,
              imágenes, fotografías y demás contenidos propios de este sitio
              web pertenecen a su titular y no podrán reproducirse sin
              autorización, salvo los usos permitidos por la ley.
            </p>

            <h2>11. Envíos y entregas</h2>
            <ul>
              <li>
                Los envíos se realizan a través de servicios de mensajería
                estándar (la concreta empresa transportista se comunicará con
                el seguimiento).
              </li>
              <li>
                Los plazos de entrega del transportista son los publicados por
                el propio operador y no son responsabilidad del titular.
              </li>
              <li>
                El embalaje se realiza con el cuidado adecuado para el tipo de
                pieza. Se conservan fotografías y/o vídeo del embalaje previo
                al envío como prueba en caso de incidencia.
              </li>
              <li>
                En caso de daños o pérdida durante el transporte, el titular
                gestionará junto al cliente la reclamación frente al
                transportista, sin perjuicio de las obligaciones que
                correspondan al titular como vendedor frente al consumidor
                conforme a la legislación aplicable.
              </li>
              <li>
                Para piezas de valor elevado, podrá ofrecerse al cliente la
                contratación de un seguro de envío adicional, cuyo coste se
                sumará al presupuesto.
              </li>
              <li>
                Alternativamente, el cliente puede optar por la{' '}
                <strong>recogida en mano en Salamanca</strong>, previa cita.
              </li>
            </ul>

            <h2>12. Privacidad y protección de datos personales</h2>
            <p>
              En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y de la Ley
              Orgánica 3/2018, de Protección de Datos Personales y garantía
              de los derechos digitales (LOPDGDD):
            </p>
            <ul>
              <li>
                <strong>Responsable del tratamiento:</strong> Jorge Cuadrado
                Criado, con los datos de contacto indicados en la cláusula 1.
              </li>
              <li>
                <strong>Finalidades:</strong> gestionar la solicitud de
                presupuesto, formalizar el encargo, coordinar la entrega o
                recogida, atender consultas y prestar soporte post-venta.
              </li>
              <li>
                <strong>Base jurídica:</strong> ejecución del contrato o
                aplicación de medidas precontractuales a petición del
                interesado (art. 6.1.b RGPD); cumplimiento de obligaciones
                legales aplicables (art. 6.1.c RGPD); y consentimiento del
                interesado para comunicaciones no esenciales (art. 6.1.a
                RGPD).
              </li>
              <li>
                <strong>Categorías de datos:</strong> datos identificativos y
                de contacto (nombre, email, teléfono, dirección), datos del
                encargo y datos económicos relativos al pago.
              </li>
              <li>
                <strong>Destinatarios:</strong> los datos no se comunican a
                terceros salvo a la empresa de mensajería seleccionada para el
                envío y a los proveedores de pago, en la medida estrictamente
                necesaria para la prestación del servicio. No se realizan
                transferencias internacionales de datos fuera del Espacio
                Económico Europeo.
              </li>
              <li>
                <strong>Plazo de conservación:</strong> los datos se
                conservarán durante la vigencia de la relación con el cliente
                y, posteriormente, durante los plazos legales aplicables para
                la atención de eventuales responsabilidades.
              </li>
              <li>
                <strong>Derechos:</strong> el interesado puede ejercer en
                cualquier momento los derechos de acceso, rectificación,
                supresión, oposición, limitación del tratamiento y
                portabilidad, dirigiéndose por escrito al email indicado en la
                cláusula 1, acreditando su identidad. Asimismo, puede
                presentar una reclamación ante la Agencia Española de
                Protección de Datos (
                <a
                  href="https://www.aepd.es"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.aepd.es
                </a>
                ) si considera que el tratamiento no se ajusta a la normativa.
              </li>
            </ul>

            <h2>13. Servicios de terceros (presupuesto online)</h2>
            <p>
              El sistema de presupuestos disponible en la web puede estar
              prestado por una plataforma externa (por ejemplo, Seekmake u
              otras). El uso de dicha herramienta se rige también por los
              términos y la política de privacidad de su proveedor, que se
              facilitarán o enlazarán al cliente antes de utilizarla. El
              titular de este sitio web no es responsable de las prácticas de
              tratamiento de datos ni del funcionamiento técnico de dichos
              servicios externos.
            </p>

            <h2>14. Modificación de los Términos</h2>
            <p>
              El titular se reserva el derecho a modificar estos Términos para
              futuros encargos. La versión aplicable a cada encargo será la
              vigente en el momento de su confirmación por el cliente, sin que
              las modificaciones posteriores afecten a encargos ya aceptados.
            </p>

            <h2>15. Resolución de conflictos, ley aplicable y jurisdicción</h2>
            <p>
              Las partes intentarán resolver de forma amistosa cualquier
              discrepancia que pueda surgir.
            </p>
            <p>Estos Términos se rigen por la legislación española.</p>
            <p>
              Para cualquier controversia que no pueda resolverse
              amistosamente, las partes se someten a los juzgados y tribunales
              de Salamanca (España),{' '}
              <strong>
                sin perjuicio del fuero que corresponda al consumidor conforme
                al artículo 90.2 LGDCU cuando este sea distinto
              </strong>
              .
            </p>
            <p>
              Cuando el cliente sea consumidor, podrá igualmente acudir a la
              plataforma de resolución de litigios en línea de la Comisión
              Europea, disponible en{' '}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
              >
                ec.europa.eu/consumers/odr
              </a>
              .
            </p>

            <h2>16. Contacto</h2>
            <p>Para cualquier consulta, reclamación o ejercicio de derechos:</p>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              <li>
                <strong>Email:</strong>{' '}
                <a href="mailto:info@impresion3dcc.com">
                  info@impresion3dcc.com
                </a>
              </li>
              <li>
                <strong>Teléfono/WhatsApp:</strong>{' '}
                <a href="tel:+34665148956">+34 665 14 89 56</a>
              </li>
              <li>
                <strong>Ubicación:</strong> Salamanca, España
              </li>
            </ul>

            <div className="terms-footer">
              <p>
                Al confirmar un encargo, el cliente declara haber leído,
                entendido y aceptado los presentes Términos y Condiciones.
              </p>
              <p style={{ marginTop: 12 }}>
                <strong>— 3DCC Salamanca</strong>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-copy">
            &copy; 2026 Impresión 3DCC Salamanca.
          </span>
          <span className="footer-copy">
            <Link href="/terminos" className="footer-link">
              Términos y Condiciones
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
