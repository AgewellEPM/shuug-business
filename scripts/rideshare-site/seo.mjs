import { createHash } from 'node:crypto';

const routes = {
  '': ['Gig Tax Pros | Gig Tax Experts for Rideshare & Delivery', 'Gig Tax Pros helps gig workers explore tax preparation, mileage and expense records, quarterly tax support, and tools for rideshare and delivery work.', 'Home'],
  services: ['Gig Worker Tax Services & Support | Gig Tax Pros', 'Explore tax preparation, deductions, mileage records, quarterly tax questions, business setup, and year-round support for gig workers.', 'Services'],
  'how-it-works': ['How Gig Tax Pros Works | Free Tools & Tax Support', 'See how Gig Tax Pros helps you organize gig income, mileage, and expenses with free tools, then choose professional services when you need them.', 'How It Works'],
  drivers: ['Gig Driver Tax Help for Rideshare & Delivery | Gig Tax Pros', 'Find tax help and financial tools for Uber, Lyft, DoorDash, Instacart, Amazon Flex, and other gig work. Explore mileage, expenses, and local support.', 'Drivers'],
  'get-the-app': ['Get the Gig Tax Pros App | iPhone & Android', 'Explore the free Gig Tax Pros app for gig workers. Public iPhone and Android download links are coming soon. See mileage, expenses, profitability, and tax-planning tools.', 'Get The App'],
  'app-features': ['Gig Tax Pros App Features | Gig Work Tools', 'Explore Gig Tax Pros earnings, mileage, expenses, profitability, route and tax-planning features. See how the app brings gig-work tools together.', 'App Features'],
  offices: ['Local Office Support for Gig Workers | Gig Tax Pros', 'Explore the Gig Tax Pros office directory and local support for gig workers. Approved locations and contact details appear as availability is confirmed.', 'Offices'],
  resources: ['Gig Economy Tax Resources & Guides | Gig Tax Pros', 'Find gig-worker tax guides, forms, mileage resources, and checklists. Prepare useful questions for gig tax experts and organize your records.', 'Resources'],
  about: ['About Gig Tax Pros | Built by Gig Workers', 'Learn why gig workers built Gig Tax Pros: clearer earnings information, useful financial tools, organized records, and access to professional tax support.', 'About'],
  'tax-preparation': ['Gig Economy Tax Preparation for Drivers | Gig Tax Pros', 'Prepare for gig-economy tax filing with records for Uber, Lyft, delivery, and other independent work. Explore the tax preparation process and questions.', 'Tax Preparation', 'services'],
  'mileage-and-expenses': ['Mileage & Expense Records for Gig Workers | Gig Tax Pros', 'Organize business mileage, vehicle costs, phone bills, and other gig-work expense records before reviewing eligible deductions with your tax professional.', 'Mileage & Expenses', 'services'],
  'quarterly-taxes': ['Quarterly Tax Help for Gig Workers | Gig Tax Pros', 'Prepare for a quarterly tax review with gig-income records, estimated payments, and withholding questions. Find IRS resources and practical next steps.', 'Quarterly Tax Support', 'services'],
  bookkeeping: ['Bookkeeping for Gig Workers & Drivers | Gig Tax Pros', 'Build a year-round routine for gig income, expenses, and business records. Explore bookkeeping preparation and follow-up questions for independent work.', 'Bookkeeping', 'services'],
  free: ['Free Gig Worker Tools | Gig Tax Pros', 'Explore free Gig Tax Pros tools for organizing gig work and tax records. There is no subscription; you pay only for professional services you choose.', 'Free Tools'],
  'get-started': ['Get Tax-Ready for Gig Work | Gig Tax Pros', 'Build a free preparation plan around your gig work, platforms, tax year, and the help you want. Start organizing records for a useful tax conversation.', 'Get Started'],
  'document-checklist': ['Gig Worker Tax Document Checklist | Gig Tax Pros', 'Organize the income, mileage, expense, and tax documents you want to discuss with your preparer. Mark records ready, then print or download your checklist.', 'Document Checklist'],
  'guides/uber-lyft-tax-forms': ['Uber & Lyft Tax Forms: 1099s & Summaries | Gig Tax Pros', 'Find official Uber and Lyft tax-document resources. Learn how annual summaries, 1099 forms, gross earnings, and payouts fit into your record review.', 'Uber & Lyft Tax Forms', 'resources'],
  faq: ['Gig Economy Tax Questions & Answers | Gig Tax Pros', 'Find answers about gig-worker tax records, mileage, quarterly reviews, platform forms, free tools, professional services, and client-workspace access.', 'Frequently Asked Questions'],
  contact: ['Contact & Availability | Gig Tax Pros', 'Check Gig Tax Pros contact and client-access availability. Prepare service questions while verified phone, email, and onboarding details are finalized.', 'Contact & Availability'],
  tour: ['Gig Tax Pros App Tour | Features, Chapters & Transcript', 'Watch a narrated tour of the Gig Tax Pros iPhone app with captions, chapters, and a full transcript covering earnings, mileage, expenses, and more.', 'App Tour'],
  'client-portal': ['My Portal | Gig Tax Pros', 'Check availability for the private Gig Tax Pros client workspace and follow verified access instructions from your firm.', 'My Portal'],
  sales: ['Private Sales Workspace | Gig Tax Pros', 'Private Gig Tax Pros sales workspace for independent office recruitment.', 'Sales Workspace'],
  'office-signup': ['Office Enrollment | Gig Tax Pros', 'Review your private Gig Tax Pros office invitation and enrollment terms.', 'Office Enrollment'],
  privacy: ['Privacy Notice | Gig Tax Pros', 'Read how the Gig Tax Pros public website handles information, hosting, contact links, and client-access availability.', 'Privacy Notice'],
  terms: ['Website Terms | Gig Tax Pros', 'Read the terms for using the Gig Tax Pros public website, information pages, and preparation tools.', 'Website Terms'],
  accessibility: ['Accessibility | Gig Tax Pros', 'Read the accessibility information for the Gig Tax Pros website and its public information and preparation tools.', 'Accessibility'],
  'bank-return': ['Return to the App | Gig Tax Pros', 'Return to the Gig Tax Pros app after completing an external connection step.', 'Return to the App'],
  '404': ['Page Not Found | Gig Tax Pros', 'The requested Gig Tax Pros page could not be found. Use the website navigation to find your next step.', 'Page Not Found'],
};
const excluded = new Set(['client-portal', 'sales', 'office-signup', '404', 'bank-return']);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const decode = value => String(value || '').replace(/&(?:amp|quot|apos|lt|gt|#39);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>' })[entity]);
const safeJson = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[character]);

function slugKey(slug) {
  const key = String(slug || '').replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '');
  if (!/^[a-z0-9/-]*$/.test(key) || key.includes('..')) throw new TypeError('Invalid SEO page slug.');
  return key === 'index' ? '' : key === 'tour/index' ? 'tour' : key;
}
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}
const metaTags = /<meta\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const linkTags = /<link\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
const scriptTags = /<script\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
const ownedMetadata = new Set(['description', 'robots', 'og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'og:locale', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']);

export function seoIndexable(slug) {
  return !excluded.has(slugKey(slug));
}

function structuredData(key, canonical, base, title, description, label, parent) {
  if (!seoIndexable(key)) return null;
  const website = `${base}/#website`;
  const organization = `${base}/#organization`;
  const graph = [];
  if (!key) {
    graph.push({ '@type': 'Organization', '@id': organization, name: 'Gig Tax Pros', alternateName: 'gigtax.pro', url: `${base}/`, logo: { '@type': 'ImageObject', url: `${base}/assets/brand-mark.svg`, width: 144, height: 144 } });
    graph.push({ '@type': 'WebSite', '@id': website, name: 'Gig Tax Pros', alternateName: 'gigtax.pro', url: `${base}/`, inLanguage: 'en-US', publisher: { '@id': organization } });
  }
  const page = { '@type': 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: 'en-US', isPartOf: { '@id': website }, publisher: { '@id': organization } };
  graph.push(page);
  if (key) {
    const trail = [{ name: 'Home', item: `${base}/` }];
    if (parent) trail.push({ name: routes[parent][2], item: `${base}/${parent}` });
    trail.push({ name: label, item: canonical });
    const breadcrumb = `${canonical}#breadcrumb`;
    page.breadcrumb = { '@id': breadcrumb };
    graph.push({ '@type': 'BreadcrumbList', '@id': breadcrumb, itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, ...item })) });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function optimizeSeo(html, { slug = '', origin }) {
  if (typeof html !== 'string') throw new TypeError('SEO input must be HTML text.');
  const site = new URL(origin);
  if (site.protocol !== 'https:' || site.username || site.password) throw new TypeError('SEO origin must be a public HTTPS origin without credentials.');
  const base = site.origin;
  const key = slugKey(slug);
  const canonical = `${base}/${key === 'tour' ? 'tour/' : key}`;
  const route = routes[key] || [`Gig Tax Pros | ${key.split('/').at(-1).replace(/-/g, ' ')}`, 'Explore Gig Tax Pros information and practical preparation resources for gig workers.', 'Gig Tax Pros'];
  const [title, description, label, parent] = route;
  let foundHead = false;
  const result = html.replace(/(<head\b(?:[^"'<>]|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/head\s*>)/i, (_, open, head, close) => {
    foundHead = true;
    let existingImage;
    for (const tag of head.match(metaTags) || []) {
      const attrs = attributes(tag);
      if ((attrs.property || attrs.name || '').toLowerCase() !== 'og:image' || !attrs.content) continue;
      try {
        const url = new URL(attrs.content, `${base}/`);
        if (url.protocol === 'https:') { existingImage = url.href; break; }
      } catch { /* Invalid existing image metadata falls back to the real tour poster. */ }
    }
    const image = existingImage || `${base}/tour/poster.jpg`;
    const robots = key === 'sales' || key === 'office-signup' || key === 'bank-return' ? 'noindex, nofollow' : excluded.has(key) ? 'noindex, follow' : 'index, follow, max-image-preview:large';
    const cleaned = head
      .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '')
      .replace(metaTags, tag => {
        const attrs = attributes(tag);
        return ownedMetadata.has((attrs.name || attrs.property || '').toLowerCase()) ? '' : tag;
      })
      .replace(linkTags, tag => (attributes(tag).rel || '').toLowerCase().split(/\s+/).includes('canonical') ? '' : tag)
      .replace(scriptTags, (tag, attrs) => attributes(attrs).id === 'site-seo-structured-data' ? '' : tag);
    const metadata = [
      `<title>${escape(title)}</title>`,
      `<meta name="description" content="${escape(description)}">`,
      `<link rel="canonical" href="${escape(canonical)}">`,
      `<meta name="robots" content="${robots}">`,
      `<meta property="og:site_name" content="Gig Tax Pros">`,
      `<meta property="og:locale" content="en_US">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escape(title)}">`,
      `<meta property="og:description" content="${escape(description)}">`,
      `<meta property="og:url" content="${escape(canonical)}">`,
      `<meta property="og:image" content="${escape(image)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${escape(title)}">`,
      `<meta name="twitter:description" content="${escape(description)}">`,
      `<meta name="twitter:image" content="${escape(image)}">`,
    ];
    const data = structuredData(key, canonical, base, title, description, label, parent);
    if (data) metadata.push(`<script id="site-seo-structured-data" type="application/ld+json">${safeJson(data)}</script>`);
    return `${open}${cleaned.trimEnd()}\n${metadata.join('\n')}\n${close}`;
  });
  if (!foundHead) throw new Error('SEO input is missing its head element.');
  return result;
}

// Unquoted CSP source expressions; the builder can deduplicate and quote them.
export function structuredDataHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(scriptTags)) {
    const attrs = attributes(match[1]);
    if ((attrs.type || '').toLowerCase() !== 'application/ld+json' || 'src' in attrs) continue;
    hashes.add(`sha256-${createHash('sha256').update(match[2]).digest('base64')}`);
  }
  return [...hashes];
}
