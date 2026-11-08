import { seoIndexable } from './seo.mjs';

// Retain existing public links while giving search engines one preferred URL.
export function canonicalRedirects(aliases, origin) {
  const paths = [
    ['/index.html', '/'],
    ...(aliases.includes('about-the-app') ? [['/app-features', '/about-the-app'], ['/app-features.html', '/about-the-app']] : []),
    ...aliases.filter(seoIndexable).map(slug => [`/${slug}.html`, `/${slug}`]),
    ['/tour/index.html', '/tour/'],
    ['/tour', '/tour/'],
  ];
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    vercel: [
      ...(origin === 'https://gigtax.pro' ? [{ src: '/(.*)', has: [{ type: 'host', value: 'www.gigtax.pro' }], status: 308, headers: { Location: `${origin}/$1` } }] : []),
      ...paths.map(([from, to]) => ({ src: `^${escape(from)}$`, status: 308, headers: { Location: to } })),
    ],
    cloudflare: paths.map(([from, to]) => `${from} ${to} 301`).join('\n') + '\n',
  };
}
