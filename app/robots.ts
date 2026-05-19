import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/qr/'],
      },
    ],
    sitemap: 'https://impresion3dcc.com/sitemap.xml',
  };
}
