/** @type {import('next').NextConfig} */
// Static export mode: produces a fully static site in `out/` that can be hosted on
// GitHub Pages, Supabase Storage, Cloudflare Pages, etc. The Supabase client runs
// in the browser. If we later need SSR (e.g. for protected admin server actions),
// remove the `output: 'export'` line and deploy to Vercel.
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    // Static export cannot use the Next.js image optimizer.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'media.printables.com' },
      { protocol: 'https', hostname: 'makerworld.bblmw.com' },
      { protocol: 'https', hostname: '*.supabase.co' }
    ]
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
