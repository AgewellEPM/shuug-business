const symbols = {
  tablet: '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M19 11v2"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 18h4"/>',
  features: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  compare: '<path d="M12 4v16m-5 0h10M4 7h16M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7Z"/>',
  shield: '<path d="M12 3c3 2.5 6 3 8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6c2 0 5-.5 8-3Z"/><path d="m9 12 2 2 4-4"/>',
  stand: '<rect x="5" y="3" width="14" height="12" rx="2"/><path d="M12 15v5m-7 1h14"/>',
  bolt: '<path d="m13 2-8 12h6l-1 8 9-12h-6l1-8Z"/>',
  cart: '<path d="M2 4h3l3 10h10l3-8H6"/><circle cx="9" cy="19" r="1"/><circle cx="18" cy="19" r="1"/>',
};

const packageList = [
  { id: 'starter', name: 'Starter Package', icon: 'nursing', configuration: 'Bedside device + essentials',
    purpose: 'Pilot in a room or small unit.', detail: 'Start with a compact AAC device, confirm the charging setup, and choose one daily care routine to try.',
    review: 'Discuss device count, where each device will live, and who will lead the pilot.' },
  { id: 'care', name: 'Care Package', icon: 'tablet', configuration: 'Tablet + bedside devices',
    purpose: 'Support a full unit rollout.', detail: 'Use a large-screen tablet for shared activities and bedside devices where residents communicate one-to-one.',
    review: 'Discuss room coverage, staff onboarding, charging locations, and the rollout schedule.' },
  { id: 'enterprise', name: 'Enterprise Package', icon: 'center', configuration: 'Multi-unit deployment',
    purpose: 'Coordinate across units or facilities.', detail: 'Plan a phased rollout across multiple units with device allocation, training, and a point of contact at each site.',
    review: 'Discuss facility count, equipment needs, implementation owners, and support for each location.' },
];

const featureList = [
  ['chat', 'Picture-based AAC', 'Tap a picture or phrase to speak a message.'],
  ['demo', 'Stroke communication', 'Explore boards for speaking up during bedside care and rehabilitation.'],
  ['team', 'Senior-friendly controls', 'Use large touch targets and familiar symbols.'],
  ['nursing', 'Bedside routines', 'Make common needs like comfort, meals, and rest easier to express.'],
  ['shield', 'Accessibility planning', 'Choose board layouts that fit how each resident communicates.'],
  ['training', 'Staff onboarding', 'Practice with the boards and plan how staff will introduce them.'],
];

const accessoryList = [
  ['bolt', 'Charging dock', 'Keep a compatible bedside device in a designated charging spot between uses.'],
  ['stand', 'Tablet stand', 'Set the tablet at a readable angle for use on a table or bedside surface.'],
  ['shield', 'Protective case', 'Discuss a case that fits the selected device and the facility’s cleaning routine.'],
];

const routes = [
  ['overview', 'products', 'Our Products'], ['tablets', 'tablet', 'Tablets'], ['phones', 'phone', 'Bedside phones'],
  ['features', 'features', 'Features'], ['accessories', 'support', 'Accessories'], ['packages', 'products', 'Packages'],
  ['compare', 'compare', 'Compare'],
];
const tab = name => `#view=products${name === 'overview' ? '' : `&amp;section=${name}`}`;
const quote = (id = '') => `#view=support&amp;request=quote${id ? '&amp;package=' + id : ''}`;
const items = values => `<ul class="products-checklist">${values.map(value => `<li>${value}</li>`).join('')}</ul>`;

export function renderProducts(workspaceIcon) {
  const icon = key => symbols[key]
    ? `<svg class="sdr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[key]}</svg>`
    : workspaceIcon(key);
  const devices = [
    { id: 'tablets', icon: 'tablet', name: 'TinkySpeak™ Tablet', badge: 'Large display',
      image: 'tablet', ratio: 'width="750" height="493"', description: 'A large-screen AAC option for residents, therapy sessions, and shared care routines.',
      points: ['Large picture and phrase buttons', 'Touch-to-speak communication', 'Room for shared activities and demonstrations', 'Tabletop or bedside stand options'] },
    { id: 'phones', icon: 'phone', name: 'TinkySpeak™ Bedside Phone', badge: 'Bedside size',
      image: 'phone', ratio: 'width="390" height="474"', description: 'A compact AAC touchscreen for everyday needs at the bedside.',
      points: ['Compact portrait layout', 'Familiar symbols and short phrases', 'One-to-one communication at the bedside', 'Dedicated charging dock option'] },
  ];
  const searchEntries = [
    ['tablets', 'TinkySpeak Tablet', 'large display tablet ipad aac accessibility symbols touchscreen stand'],
    ['phones', 'TinkySpeak Bedside Phone', 'phone mobile portrait bedside dock touchscreen compact aac'],
    ['features', 'Communication features', featureList.map(([, title, detail]) => title + ' ' + detail).join(' ')],
    ['accessories', 'Accessories', accessoryList.map(([, title, detail]) => title + ' ' + detail).join(' ')],
    ['packages', 'Starter, Care, and Enterprise packages', 'pricing price quotes quantity pilot deployment rollout facility'],
    ['compare', 'Compare devices', 'comparison screen format tablet phone placement stand dock'],
  ];
  return `<section class="sdr-products" data-tab-panel="products" hidden aria-labelledby="products-title">
  <form class="products-search" role="search" aria-label="Product catalog" data-product-search>
    ${icon('discover')}<input type="search" name="query" maxlength="180" aria-label="Search products and packages" placeholder="Search products, devices, accessories, or packages…">
    <button type="button" data-product-clear hidden>Clear</button>
  </form>
  <header class="products-hero">
    <div><p class="products-brand"><span aria-hidden="true">🚂</span> TinkyTown™</p><h1 id="products-title">Our Products</h1>
      <p class="products-hero-subtitle">Accessible communication for senior care</p>
      <p>Explore TinkySpeak devices and setups for daily care, bedside conversations, and stroke communication.</p></div>
  </header>
  <nav class="products-nav" aria-label="Product catalog sections">${routes.map(([id, symbol, label]) =>
    `<a href="${tab(id)}" data-product-tab="${id}"${id === 'overview' ? ' aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>
  <section class="product-panel products-results" data-product-results hidden aria-labelledby="products-search-title">
    <h2 id="products-search-title">Search results</h2><p data-product-search-count role="status"></p>
    <ul>${searchEntries.map(([id, label, keywords]) => `<li data-product-result="${keywords}"><a href="${tab(id)}" data-product-result-link>${label} ${icon('arrow')}</a></li>`).join('')}</ul>
  </section>
  <div class="products-devices" data-product-pane="overview tablets phones">
    ${devices.map(({ id, icon: symbol, name, badge, image, ratio, description, points }) => `<article class="product-panel product-device" data-product-device="${id}">
      <header><h2>${icon(symbol)} ${name}</h2><span class="product-device-badge">${badge}</span></header>
      <div class="product-device-body"><div><p>${description}</p>${items(points)}</div>
        <img src="/sales-products-${image}.webp" ${ratio} alt="Illustration of a TinkySpeak ${image === 'phone' ? 'bedside phone in its dock' : 'tablet on a stand'}" decoding="async"></div>
    </article>`).join('')}
  </div>
  <div class="products-highlights" data-product-pane="overview features">
    <section class="product-panel product-feature-panel" aria-labelledby="products-feature-title">
      <h2 id="products-feature-title">${icon('features')} Key features</h2>
      <ul class="products-feature-grid">${featureList.map(([symbol, name, description]) =>
        `<li>${icon(symbol)}<strong>${name}</strong><p>${description}</p></li>`).join('')}</ul>
    </section>
    <figure class="products-lifestyle"><img src="/sales-campaign-care.webp" alt="A resident and a care worker using a communication tablet" loading="lazy" decoding="async"></figure>
    <section class="product-panel" aria-labelledby="products-benefit-title">
      <h2 id="products-benefit-title">${icon('reports')} What the devices support</h2>
      ${items(['Help residents express everyday needs', 'Give staff more ways to understand requests', 'Support participation in care conversations', 'Introduce picture-based communication during a pilot'])}
      <a class="products-text-link" href="#view=demo&amp;venue=hospital">Try the bedside demo ${icon('arrow')}</a>
    </section>
  </div>
  <section class="product-panel" data-product-pane="accessories" hidden aria-labelledby="products-accessories-title">
    <h2 id="products-accessories-title">${icon('support')} Accessories</h2>
    <div class="products-option-grid">${accessoryList.map(([symbol, name, description]) => `<article>${icon(symbol)}<h3>${name}</h3><p>${description}</p></article>`).join('')}</div>
  </section>
  <div class="products-offers" data-product-pane="overview packages">
    <section class="product-panel" aria-labelledby="products-package-title">
      <h2 id="products-package-title">${icon('products')} Product packages</h2><p class="product-intro">Suggested configurations for pilots, unit rollouts, and multi-site deployments.</p>
      <div class="products-option-grid">${packageList.map(({ id, name, icon: symbol, configuration, purpose }) =>
        `<article data-product-package="${id}"><header>${icon(symbol)}<div><h3>${name}</h3><small>${configuration}</small></div></header>
          <p>${purpose}</p><button class="products-button primary" type="button" data-product-package-open="${id}">Learn more<span class="products-sr-only"> about the ${name}</span></button></article>`).join('')}</div>
    </section>
    <section class="product-panel products-compare-promo" data-product-overview-only aria-labelledby="products-compare-promo-title">
      <h2 id="products-compare-promo-title">${icon('compare')} Compare devices</h2>
      <div class="products-compare-images" aria-hidden="true"><img src="/sales-products-tablet.webp" alt="" width="750" height="493" loading="lazy"><img src="/sales-products-phone.webp" alt="" width="390" height="474" loading="lazy"></div>
      <a class="products-button secondary" href="${tab('compare')}">Compare now ${icon('arrow')}</a>
    </section>
  </div>
  <section class="product-panel" data-product-pane="compare" hidden aria-labelledby="products-compare-title">
    <h2 id="products-compare-title">${icon('compare')} Compare devices</h2>
    <div class="products-table-wrap" tabindex="0" role="region" aria-label="Tablet and bedside phone comparison"><table>
      <thead><tr><th scope="col">Feature</th><th scope="col">TinkySpeak Tablet</th><th scope="col">TinkySpeak Bedside Phone</th></tr></thead>
      <tbody><tr><th scope="row">Display</th><td>Larger landscape touchscreen</td><td>Compact portrait touchscreen</td></tr>
        <tr><th scope="row">Communication</th><td>Picture and phrase boards</td><td>Picture and phrase boards</td></tr>
        <tr><th scope="row">Common setup</th><td>Tabletop or shared care area</td><td>Bedside or one-to-one use</td></tr>
        <tr><th scope="row">Accessories to discuss</th><td>Stand and protective case</td><td>Charging dock and protective case</td></tr>
      </tbody></table></div>
  </section>
  <footer class="product-panel products-cta">
    <div><h2>${icon('demo')} Bring TinkySpeak™ to your facility</h2><p>See the communication boards or discuss the right setup for your residents.</p></div>
    <div><a class="products-button primary" href="/book?type=demo" target="_blank" rel="noopener">${icon('calendar')} Schedule a demo</a>
    <a class="products-button secondary" href="${quote()}">${icon('cart')} Request a quote</a></div>
  </footer>
  <dialog class="products-dialog" data-product-dialog aria-labelledby="products-dialog-title">
    <div class="products-dialog-heading"><h2 id="products-dialog-title"></h2>
      <form method="dialog"><button type="submit" class="products-button secondary">Close</button></form>
    </div>
    ${packageList.map(({ id, name, detail, review }) => `<div data-product-package-detail="${id}" data-product-package-name="${name}" hidden>
      <p>${detail}</p><p>${review}</p><a href="${quote(id)}" data-product-dialog-quote class="products-button primary">Request a quote</a>
    </div>`).join('')}
  </dialog>
</section>`;
}
