// Browser-side gzip for quote uploads. STL/OBJ compress 60-80%; 3MF is
// already a zip so it goes up untouched. Falls back to raw upload on
// browsers without CompressionStream (Safari < 16.4).

export function canCompress(): boolean {
  return typeof CompressionStream !== 'undefined';
}

/** Gzip a file. Returns null when the browser can't compress. */
export async function gzipFile(file: File): Promise<Blob | null> {
  if (!canCompress()) return null;
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

/** Formats worth compressing (3MF/ZIP-likes are skipped). */
export function shouldCompress(ext: string): boolean {
  return ext === 'stl' || ext === 'obj';
}

/**
 * Download a stored quote file, transparently gunzipping `.gz` uploads so
 * the admin gets the original printable file back.
 */
export async function downloadQuoteFile(
  url: string,
  originalName: string
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Descarga fallida (HTTP ${res.status})`);

  let blob: Blob;
  if (url.endsWith('.gz') && typeof DecompressionStream !== 'undefined' && res.body) {
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
    blob = await new Response(stream).blob();
  } else {
    blob = await res.blob();
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = url.endsWith('.gz') && originalName.endsWith('.gz')
    ? originalName.slice(0, -3)
    : originalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
