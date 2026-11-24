const coverage = 'https://www.cms.gov/training-education/medicare-learning-networkr-mln/compliance/medicare-provider-compliance-tips/speech-generating-devices';
const boardTiles = [['👋', 'Hello'], ['🤕', 'I am in pain'], ['📊', 'Pain level'], ['💊', 'Medications'], ['📄', 'Insurance'], ['💧', 'Water']];

export function renderProducts(icon) {
  const tab = (view, label, glyph) => `<a href="#view=products${view === 'overview' ? '' : '&amp;section=' + view}" data-product-view="${view}"${view === 'overview' ? ' aria-current="page"' : ''}>${icon(glyph)}${label}</a>`;
  const quote = (offer = '') => `<a href="#view=support&amp;request=quote${offer ? '&amp;offer=' + offer : ''}" class="product-button" data-product-quote>Request a quote</a>`;
  return `<section class="sdr-products" data-tab-panel="products" hidden aria-labelledby="sales-products-title">
    <header class="product-hero">
      <div><span class="product-brand">🚂 TinkyTown</span>
        <h1 id="sales-products-title">Our Products</h1>
        <p>Communication tools and hardware rentals for nursing homes, senior care, and other facilities.</p></div>
      <a href="#view=demo&amp;product=hospital" class="product-board">
        <strong>TinkyTown Hospital</strong>
        <span class="product-board-tiles" aria-hidden="true">${boardTiles.map(([emoji, text]) => `<span><b>${emoji}</b>${text}</span>`).join('')}</span>
        <span>Try the reception board ${icon('arrow')}</span>
      </a>
    </header>
    <nav class="product-tabs" aria-label="Product views">
      ${tab('overview', 'Our Products', 'products')}${tab('pricing', 'Pricing &amp; commission', 'revenue')}${tab('compare', 'Compare', 'reports')}
    </nav>
    <section data-product-panel="overview" class="product-overview" aria-label="Our products">
      <article class="product-card">
        <h2>${icon('products')} TinkySpeak Facility Hardware Rental</h2>
        <p>A preconfigured tablet gives residents a dedicated place to use picture and text-to-speech communication boards.</p>
        <ul class="product-checks"><li>Tap picture choices to speak everyday requests.</li><li>Use familiar phrases for routine care.</li><li>Try the bedside conversation and pain scale in the stroke demo.</li></ul>
        <p class="product-price" data-product-price>Loading rental pricing…</p>
        <p class="product-commission">Rep commission <strong data-product-commission>Loading…</strong></p>
        <div class="product-actions"><a class="product-button" href="#view=demo&amp;product=stroke&amp;setting=nursing-home">Try the bedside demo</a>${quote('facility-rental')}</div>
      </article>
      <article class="product-card">
        <h2>${icon('demo')} TinkyTown Healthcare</h2>
        <p>QR and kiosk communication boards for healthcare reception and other points of care.</p>
        <ul class="product-checks"><li>Open a board on the visitor’s phone with a QR code.</li><li>Offer a shared board at reception or check-in.</li><li>Choose picture tiles that speak the selected message.</li></ul>
        <p class="product-price">Pricing by quote</p>
        <div class="product-actions"><a class="product-button" href="#view=demo&amp;product=hospital">Try the hospital demo</a>${quote('healthcare')}</div>
      </article>
    </section>
    <section data-product-panel="pricing" class="product-card" hidden aria-labelledby="products-pricing-title">
      <h2 id="products-pricing-title">${icon('revenue')} Facility rental pricing</h2>
      <p data-product-status role="status"></p>
      <dl class="product-rate-grid">
        <div><dt>Facility rental</dt><dd data-product-price>Loading…</dd></div>
        <div><dt>Rep commission</dt><dd data-product-commission>Loading…</dd></div>
        <div data-product-owner hidden><dt>Company hardware cost</dt><dd data-product-cost>—</dd></div>
      </dl>
      <p>Medicare or Medicaid coverage requires verification for the specific device, payer, and care setting before quoting reimbursement. <a href="${coverage}" target="_blank" rel="noopener noreferrer">CMS coverage criteria ↗</a></p>
      <details class="product-edit" data-product-owner hidden>
        <summary>Edit rental price and commission</summary>
        <form data-product-form class="product-form">
          <label>Monthly rental (USD)<input name="rental" inputmode="decimal" maxlength="10" required></label>
          <label>Company hardware cost (USD)<input name="hardwareCost" inputmode="decimal" maxlength="10" placeholder="Optional"></label>
          <label>Rep commission type<select name="kind"><option value="">Awaiting approval</option><option value="fixed">Flat USD amount</option><option value="percent">Percent of rent</option></select></label>
          <label data-product-rule hidden>Commission amount<input name="amount" inputmode="decimal" maxlength="10"></label>
          <label data-product-rule hidden>Applies to<select name="frequency"><option value="first">First paid month</option><option value="each">Each paid month</option></select></label>
          <button type="submit" class="product-button product-primary">Save pricing</button>
        </form>
      </details>
    </section>
    <section data-product-panel="compare" class="product-card" hidden aria-labelledby="products-compare-title">
      <h2 id="products-compare-title">${icon('reports')} Compare products</h2>
      <div class="product-table"><table>
        <thead><tr><th scope="col">Offering</th><th scope="col">Facility hardware rental</th><th scope="col">TinkyTown Healthcare</th></tr></thead>
        <tbody>
          <tr><th scope="row">Use</th><td>Bedside and resident communication</td><td>Reception, check-in, and visitor communication</td></tr>
          <tr><th scope="row">Access</th><td>Preconfigured tablet on site</td><td>QR link or shared kiosk</td></tr>
          <tr><th scope="row">Price</th><td data-product-price>Loading…</td><td>By quote</td></tr>
        </tbody>
      </table></div>
    </section>
    <footer class="product-card product-footer">
      <div><h2>${icon('calendar')} Bring TinkyTown to your facility</h2><p>Book a demo or send the workspace team a quote request.</p></div>
      <div class="product-actions">
        <a class="product-button product-primary" href="/book?type=demo" target="_blank" rel="noopener noreferrer">Schedule a demo</a>${quote()}
      </div>
    </footer>
  </section>`;
}
