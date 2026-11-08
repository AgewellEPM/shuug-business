import { platformBar } from './platform-bar.mjs';
import { origin } from './content.mjs';
import { brand, dialogs, escape as e, footer, quickActions } from './layout.mjs';
import { publicHeader, publicNavigation } from './public-navigation.mjs';

export function referenceArt(box, name = '') {
  return `<svg class="marketing-art ${name}" viewBox="${box.join(' ')}" aria-hidden="true" focusable="false"><image href="/assets/drivers-reference.png" width="1199" height="1312"/></svg>`;
}
export function marketingPage({ slug, label, description, body, scripts = '' }) {
  body = body.replace('</section>', `</section>${platformBar('marketing-platforms')}`);
  return { slug, label, file: `${slug}.html`, html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#08040e"><title>${e(label)} | Gig Tax Pros</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${origin}/${slug}"><meta property="og:title" content="${e(label)} | Gig Tax Pros"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${origin}/${slug}"><meta property="og:type" content="website"><meta property="og:image" content="${origin}/assets/drivers-reference.png"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/inner-pages.css"><link rel="stylesheet" href="/navigation.css"><link rel="stylesheet" href="/marketing-pages.css"><link rel="stylesheet" href="/hero-mobile.css"><script src="/links.js" defer></script><script src="/app.js" defer></script><script src="/inner-pages.js" defer></script>${scripts}</head><body class="marketing-page ${slug}-page"><a class="skip-link" href="#main">Skip to content</a>${publicHeader(`/${slug}`, brand())}<main id="main" tabindex="-1">${body}</main>${footer()}${quickActions()}${publicNavigation(`/${slug}`)}${dialogs()}</body></html>` };
}
