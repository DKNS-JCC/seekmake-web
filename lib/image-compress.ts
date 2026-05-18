// Client-side image compression before uploading to Supabase Storage.
// Re-encodes to WebP (transparency-friendly, ~30% smaller than JPEG at the
// same perceived quality) and resizes so the longest edge fits a sane web
// display size. Keeps the free-tier 1 GB storage quota usable.

const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.82;
// Smaller images (or formats that don't benefit) pass through untouched.
const MIN_BYTES_TO_COMPRESS = 80 * 1024;
const PASS_THROUGH_TYPES = new Set(['image/svg+xml', 'image/gif']);

export interface CompressResult {
  blob: Blob;
  filename: string;
  contentType: string;
  originalBytes: number;
  finalBytes: number;
  skipped: boolean;
}

export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {}
): Promise<CompressResult> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const base = stripExt(file.name) || 'image';

  // Pass-through cases: SVG, GIF, or already-small files.
  if (PASS_THROUGH_TYPES.has(file.type) || file.size < MIN_BYTES_TO_COMPRESS) {
    return {
      blob: file,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      originalBytes: file.size,
      finalBytes: file.size,
      skipped: true
    };
  }

  // Decode the image. createImageBitmap is hardware-accelerated where
  // available; falls back to a temporary <img> element if not (Safari quirks).
  const bitmap = await decode(file);
  const { width, height } = bitmap;

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context available');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  (bitmap as ImageBitmap).close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality)
  );
  if (!blob) {
    // Browser doesn't support WebP encoding via canvas — fall back to JPEG.
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!jpeg) throw new Error('Image encoding failed');
    return {
      blob: jpeg,
      filename: `${base}.jpg`,
      contentType: 'image/jpeg',
      originalBytes: file.size,
      finalBytes: jpeg.size,
      skipped: false
    };
  }

  return {
    blob,
    filename: `${base}.webp`,
    contentType: 'image/webp',
    originalBytes: file.size,
    finalBytes: blob.size,
    skipped: false
  };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
