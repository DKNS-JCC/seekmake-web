import { cache } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import type { Database } from '@/lib/types';
import { buildSafe } from '@/lib/supabase/buildSafe';
import { CONTACTO, siteUrl } from '@/lib/contacto';
import { productoSlug } from '@/lib/slug';
import { ProductDetail } from '../CatalogoClient';

export const dynamicParams = false;

// cache(): generateStaticParams, generateMetadata and the page share one fetch.
const loadProducts = cache(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  return buildSafe(async () => {
    const supabase = createClient<Database>(url, key);
    const { data, error } = await supabase.from('productos').select('*');
    if (error) throw error;
    return data ?? [];
  }, []);
});

async function loadProduct(slug: string) {
  return (await loadProducts()).find((p) => productoSlug(p) === slug) ?? null;
}

export async function generateStaticParams() {
  const result = (await loadProducts()).map((p) => ({ slug: productoSlug(p) }));
  return result.length > 0 ? result : [{ slug: 'placeholder' }];
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadProduct(slug);
  const alternates = { canonical: siteUrl(`/catalogo/${slug}/`) };
  if (!p) return { alternates, robots: { index: false } };
  // Sin concordancia de género («Lámpara… impreso»): «· Impresión 3D» vale para todos.
  const full = `${p.nombre} · Impresión 3D | 3DCC`;
  const title = full.length <= 60 ? full : `${p.nombre} | 3DCC`;
  // La ficha lleva un texto largo; a Google le damos las frases completas que quepan en 155.
  const text = p.descripcion.replace(/\s+/g, ' ').trim();
  const description =
    text.length <= 155
      ? text
      : (text.slice(0, 156).match(/^.*[.!?](?=\s)/)?.[0] ??
        text.slice(0, 155).replace(/\s+\S*$/, '') + '…');
  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      ...(p.imagen ? { images: [p.imagen] } : {})
    }
  };
}

export default async function ProductoPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await loadProduct(slug);
  if (!p) {
    return (
      <main style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px' }}>
        <h1>Producto no encontrado</h1>
        <Link href="/catalogo/">← Volver al catálogo</Link>
      </main>
    );
  }

  const pageUrl = siteUrl(`/catalogo/${slug}/`);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.nombre,
      description: p.descripcion,
      image: p.imagen || undefined,
      url: pageUrl,
      category: p.categoria,
      brand: { '@type': 'Brand', name: '3DCC' },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        // precio 0 means "a consultar": omit it rather than claim it is free.
        // 'Personalizado' items are services whose precio is a starting price.
        ...(p.precio > 0
          ? p.categoria === 'Personalizado'
            ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: p.precio.toFixed(2), priceCurrency: 'EUR' } }
            : { price: p.precio.toFixed(2) }
          : {}),
        availability: 'https://schema.org/InStock',
        url: pageUrl,
        seller: { '@type': 'Organization', name: CONTACTO.nombre }
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Catálogo', item: siteUrl('/catalogo/') },
        { '@type': 'ListItem', position: 3, name: p.nombre, item: pageUrl }
      ]
    }
  ];

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Migas de pan" style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
        <Link href="/">Inicio</Link> › <Link href="/catalogo/">Catálogo</Link> › {p.nombre}
      </nav>
      <article className="cat-modal" style={{ transform: 'none', maxHeight: 'none' }}>
        <ProductDetail p={p} titleAs="h1" />
      </article>
      <div className="cat-modal-actions" style={{ marginTop: 24 }}>
        <Link href="/catalogo/" className="btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
          ← Volver al catálogo
        </Link>
        <Link href="/instant-quote/" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
          Calcular precio de tu pieza
        </Link>
      </div>
    </main>
  );
}
