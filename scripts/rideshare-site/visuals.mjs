// Only photographic regions of the design references are used as imagery.
// All labels, numbers, charts and controls are rendered by the browser.
const shapes = {
  chart: '<path d="M5 27V19h5v8m5 0V12h5v15m5 0V5h5v22"/>',
  route: '<path d="M9 25h15c9 0 9-10 0-10H13" stroke-dasharray="3 3"/><path d="M15 8c0 5-6 10-6 10S3 13 3 8a6 6 0 1 1 12 0Z"/><circle cx="9" cy="8" r="2"/>',
  document: '<path d="M7 3h13l7 7v20H7Z M20 3v8h7M12 17h10M12 22h10"/>',
  calendar: '<rect x="3" y="7" width="27" height="23" rx="3"/><path d="M10 2v10M23 2v10M3 15h27M10 20h3m7 0h3m-13 5h3m7 0h3"/>',
  car: '<path d="m5 14 4-9h16l4 9M3 16q0-3 4-3h20q4 0 4 3v9H3ZM6 25v4m22-4v4M7 19h4m12 0h4"/>',
  shield: '<path d="M17 2 4 7v9c0 8 13 15 13 15s13-7 13-15V7Z M10 16l5 5 9-11"/>',
  people: '<circle cx="17" cy="9" r="5"/><path d="M6 30v-6a11 11 0 0 1 22 0v6ZM3 10a4 4 0 0 1 5 7m-6 12v-5a6 6 0 0 1 4-6M31 10a4 4 0 0 0-5 7m6 12v-5a6 6 0 0 0-4-6"/>',
  office: '<path d="M4 14v16h26V14M2 13 7 3h20l5 10q-4 6-8 0-4 6-8 0-4 6-8 0-4 6-6 0ZM13 30V20h8v10M11 3 9 13M22 3l2 10"/>',
  coins: '<ellipse cx="20" cy="7" rx="11" ry="4"/><path d="M9 7v14c0 5 22 5 22 0V7M9 14c0 5 22 5 22 0M7 18c-8 0-8 8 0 8m-5-4v6c0 3 9 4 14 2"/>',
  diamond: '<path d="M2 11 9 3h16l7 8-15 20ZM2 11h30M9 3l8 28 8-28M9 11l8-8 8 8"/>',
};
export function icon(kind = 'chart', className = '') {
  return `<svg class="line-icon ${className}" viewBox="0 0 34 34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[kind] || shapes.chart}</svg>`;
}
export function photo(source, box, width, height, className) {
  return `<svg class="photo ${className}" viewBox="${box.join(' ')}" aria-hidden="true" focusable="false"><image href="/assets/${source}" width="${width}" height="${height}"/></svg>`;
}
export function dashboard(className = '') {
  return `<div class="dashboard-preview ${className}" aria-label="Illustrative app dashboard"><span class="preview-label">APP PREVIEW</span><div class="preview-brand"><span class="brand-symbol" aria-hidden="true"></span>Gig Tax Pros</div><p>This week</p><strong class="preview-total">$1,428.60</strong><span class="preview-growth">↑ 12%</span><div class="preview-bars" aria-hidden="true">${[1,2,3,4,5,6,7].map(n => `<i class="bar-${n}"></i>`).join('')}</div><dl>${[['Earnings', '$1,428.60'], ['Mileage', '256.4 mi'], ['Expenses', '$186.32'], ['Tax estimate', '$178.00']].map(([label,value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><small>Illustrative figures</small></div>`;
}
export function office(className = '') {
  return `<div class="office-illustration ${className}" aria-hidden="true"><div class="office-sign"><span class="brand-symbol"></span><span>Gig Tax Pros<small>TAX &amp; ACCOUNTING</small></span></div><div class="office-windows"><i></i><i></i><i></i><i></i></div></div>`;
}
export function route(className = '') {
  return `<svg class="route-illustration ${className}" viewBox="0 0 320 160" aria-hidden="true" focusable="false"><path class="route-streets" d="M0 30h320M0 65h320M0 100h320M0 135h320M35 0v160M85 0v160M135 0v160M185 0v160M235 0v160M285 0v160M0 160 320 0"/><path class="route-line" d="M35 30v70h100V65h100v70h50"/><circle cx="35" cy="30" r="8"/><path class="route-house" d="m270 134 15-13 15 13v20h-30ZM281 154v-12h8v12"/></svg>`;
}
// Class names identify existing visual slots without copying any text pixels.
export function visual(page, box, name = '') {
  if (name.includes('icon') || name.includes('feature-art')) {
    const kinds = ['chart', 'route', 'document', 'calendar', 'car', 'shield', 'people', 'office'];
    return icon(kinds[Math.min(7, Math.floor(box[0] / (page === 'services' ? 250 : 150)))], name);
  }
  if (name.includes('office')) return office(name);
  if (name.includes('phone')) return dashboard(name);
  if (name.includes('route')) return route(name);
  if (name.includes('hero')) {
    if (page === 'services') return photo('services-reference.png', [442, 53, 290, 307], 1024, 1536, name);
    if (page === 'how-it-works') return photo('how-it-works-reference.png', [447, 51, 347, 282], 1024, 1536, name);
    if (page === 'about') return photo('about-reference.png', [375, 49, 420, 374], 941, 1672, name);
    // Reuse the unobstructed driver portrait, excluding all headline and logo panels.
    return photo('drivers-reference.png', [590, 60, 443, 320], 1199, 1312, name);
  }
  if (name.includes('story')) return photo('about-reference.png', [35, 445, 300, 180], 941, 1672, name);
  if (name.includes('mission')) return photo('about-reference.png', [18, 1308, 420, 184], 941, 1672, name);
  return icon('chart', name);
}
