// Supabase Edge Function: quote-file
//
// Sirve un archivo del bucket quote-uploads listo para usar: si está
// almacenado comprimido (.gz, ver lib/quote/compress en la web) lo
// descomprime al vuelo. Lo usan la bandeja web de la Calculadora
// ("Descargar" / "Abrir en OrcaSlicer" / "Abrir en Bambu Studio" — los
// deep links orcaslicer:// y bambustudio:// descargan la URL que se les
// pasa, así que necesitan el modelo sin comprimir).
//
// Seguridad: mismo modelo que el bucket público — el path es no adivinable
// (uuid) y actúa como capability, igual que la URL pública actual. Por eso
// se despliega SIN verificación de JWT (los slicers no mandan cabeceras).
//
// ── Deploy ──
//   supabase functions deploy quote-file --no-verify-jwt
//
// GET /functions/v1/quote-file?path=<path en el bucket>&name=<nombre>&dl=1
//   path — obligatorio, path del objeto (archivos[].path de la quote)
//   name — nombre de archivo para Content-Disposition (por defecto, el path)
//   dl   — si está presente, fuerza descarga (attachment)

// @ts-nocheck — Deno target.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CONTENT_TYPES: Record<string, string> = {
  stl: 'model/stl',
  obj: 'model/obj',
  '3mf': 'model/3mf',
  step: 'application/step',
  stp: 'application/step',
};

function contentTypeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

// RFC 5987 minimal — keep ASCII fallback for filename=
function asciiFilename(s: string): string {
  return (s || 'modelo.stl').replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '';
  // Solo paths razonables dentro del bucket, sin traversal.
  if (!path || path.includes('..') || !/^[a-zA-Z0-9_\-./]+$/.test(path)) {
    return new Response('path inválido', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data, error } = await supabase.storage.from('quote-uploads').download(path);
  if (error || !data) {
    return new Response('Archivo no encontrado', { status: 404 });
  }

  const gz = path.toLowerCase().endsWith('.gz');
  let stream: ReadableStream<Uint8Array> = data.stream();
  if (gz) {
    stream = stream.pipeThrough(new DecompressionStream('gzip'));
  }

  const fallbackName = path.split('/').pop()!.replace(/\.gz$/i, '');
  const name = asciiFilename(url.searchParams.get('name') || fallbackName);
  const disposition = url.searchParams.has('dl') ? 'attachment' : 'inline';

  return new Response(stream, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': contentTypeFor(name),
      'Content-Disposition': `${disposition}; filename="${name}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
