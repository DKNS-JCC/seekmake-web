'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { whatsappUrl } from '@/lib/contacto';
import { createClient } from '@/lib/supabase/client';

// Mensaje prellenado según dónde está el cliente. El primer prefijo que
// encaje gana; el resto cae en el genérico.
const MENSAJES: [string, string][] = [
  ['/navidad', 'Hola, quiero un regalo de Navidad.'],
  ['/catalogo', 'Hola, he visto el catálogo y quiero pedir un regalo.'],
  ['/servicios/figuras', 'Hola, quiero una figura desde una foto.'],
  ['/servicios/trofeos', 'Hola, queremos trofeos o medallas.'],
  ['/servicios/grupos', 'Hola, queremos hacer un pedido para un grupo.'],
  ['/servicios/litofanias', 'Hola, quiero una litofanía. Os mando la foto.'],
  ['/servicios/llaveros', 'Hola, quiero llaveros personalizados.'],
  ['/servicios/repuestos', 'Hola, necesito una pieza de repuesto. Os mando fotos.'],
  ['/servicios/diseno', 'Hola, tengo una idea y necesito que la diseñéis.'],
  ['/servicios/semana-santa', 'Hola, quiero mini cofrades.'],
  ['/instant-quote', 'Hola, tengo dudas con el precio de mi pieza.']
];

export function mensajeWhatsApp(pathname: string): string {
  return (
    MENSAJES.find(([p]) => pathname.startsWith(p))?.[1] ??
    'Hola, quiero pedir algo impreso en 3D. Os mando una foto.'
  );
}

export function WhatsAppFAB() {
  const pathname = usePathname() ?? '/';

  // Cuenta cada clic en cualquier enlace de WhatsApp de la web: página y nada
  // más. Sin cookies ni datos de quien pulsa (/admin/estadisticas).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="https://wa.me/"]');
      if (!a || location.pathname.startsWith('/admin')) return;
      void createClient()
        .from('quote_events')
        .insert({ session_id: '', evento: 'whatsapp_clic', payload: { pagina: location.pathname } })
        .then(() => undefined, () => undefined);
    };
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return (
    <a
      href={whatsappUrl(mensajeWhatsApp(pathname))}
      target="_blank"
      rel="noopener noreferrer"
      className="wa-fab"
    >
      <svg width={22} height={22} fill="white" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      Pedir por WhatsApp
    </a>
  );
}
