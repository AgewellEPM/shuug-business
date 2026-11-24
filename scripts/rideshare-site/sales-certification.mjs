const sections = [
  ['overview', 'training', 'Program overview'],
  ['training', 'demo', 'Training'],
  ['certificates', 'certification', 'Certification'],
  ['earnings', 'revenue', 'Earnings & bonuses'],
  ['requirements', 'contracts', 'Requirements'],
  ['apply', 'prospects', 'Get started'],
];

const tab = id => '#view=certification' + (id === 'overview' ? '' : '&amp;section=' + id);

export function renderCertification(icon) {
  return `<section class="sdr-certification" data-tab-panel="certification" hidden aria-labelledby="certification-title">
  <form class="cert-search" role="search" aria-label="Certification program" data-cert-search>
    ${icon('discover')}<input type="search" name="query" maxlength="120" placeholder="Search training, certificates, or earnings…" aria-label="Search the certification program">
    <button type="button" data-cert-clear hidden>Clear</button>
  </form>
  <header class="cert-hero">
    <div><p class="cert-brand"><span aria-hidden="true">🚂</span> TinkyTown™</p>
      <h1 id="certification-title">Certified Sales Representative Program</h1>
      <p>Learn the product, practice real sales scenarios, and earn TinkyTown certificates.</p>
    </div>
  </header>
  <nav class="cert-nav" aria-label="Certification program sections">${sections.map(([id, glyph, label]) =>
    `<a href="${tab(id)}" data-cert-tab="${id}"${id === 'overview' ? ' aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('')}</nav>
  <p class="cert-status" role="status" data-cert-status hidden></p>
  <section class="cert-card" data-cert-results hidden aria-labelledby="cert-search-title">
    <h2 id="cert-search-title">Search results</h2><p role="status" data-cert-match-count></p>
    <ul>${sections.map(([id, , label]) => `<li data-cert-result="${id}"><a href="${tab(id)}">${label}</a></li>`).join('')}</ul>
  </section>
  <div class="cert-intro-grid" data-cert-group>
    <section class="cert-card cert-intro" data-cert-part="overview" aria-labelledby="cert-intro-title">
      <div><h2 id="cert-intro-title">${icon('certification')} Become a TinkyTown Certified Sales Rep</h2>
        <p>Learn to lead conversations with nursing homes and senior centers, demonstrate TinkySpeak, and take a qualified prospect from discovery to a reviewed agreement.</p></div>
      <img src="/sales-products-tablet.webp" alt="TinkySpeak communication board on a tablet" width="750" height="493" loading="lazy">
    </section>
    <section class="cert-card" data-cert-part="overview" aria-labelledby="cert-benefits-title">
      <h2 id="cert-benefits-title">${icon('check')} Why get certified?</h2>
      <ul class="cert-checks"><li>Practice product demonstrations and discovery calls</li>
        <li>Use sales playbooks and guided scenarios</li><li>Build specialist skills for healthcare and accessibility</li>
        <li>Earn a completion certificate for each learning path</li></ul>
    </section>
  </div>
  <div class="cert-path-grid" data-cert-group>
    <section class="cert-card" data-cert-part="overview training" aria-labelledby="cert-path-title">
      <div class="cert-heading"><h2 id="cert-path-title">${icon('reports')} Certification paths</h2><a href="#view=training&amp;section=paths">View learning paths ${icon('arrow')}</a></div>
      <ol class="cert-paths" data-cert-paths aria-label="Certification learning paths"></ol>
    </section>
    <section class="cert-card" data-cert-part="overview earnings" aria-labelledby="cert-earnings-title">
      <h2 id="cert-earnings-title">${icon('revenue')} Earnings &amp; bonuses</h2>
      <dl class="cert-earnings" data-cert-earnings></dl><p data-cert-earnings-note></p>
    </section>
  </div>
  <div class="cert-detail-grid" data-cert-group>
    <section class="cert-card" data-cert-part="overview requirements" aria-labelledby="cert-steps-title">
      <h2 id="cert-steps-title">${icon('contracts')} Certification steps</h2>
      <ol class="cert-steps">
        <li><strong>Start the program</strong><span>Add the core courses to My Plan.</span></li>
        <li><strong>Complete the lessons</strong><span>Work through every lesson for each course in your path.</span></li>
        <li><strong>Pass the knowledge checks</strong><span>Finish the practice checklists and pass each course assessment.</span></li>
        <li><strong>Earn your certificate</strong><span>Open the completion record when all required courses are finished.</span></li>
      </ol>
    </section>
    <section class="cert-card" data-cert-part="overview training" aria-labelledby="cert-progress-title">
      <h2 id="cert-progress-title">${icon('training')} Your training progress</h2>
      <dl class="cert-progress" data-cert-progress></dl><a class="cert-text-link" href="#view=training&amp;section=plan">Open My Plan ${icon('arrow')}</a>
    </section>
    <section class="cert-card" data-cert-part="overview certificates" aria-labelledby="cert-awards-title">
      <h2 id="cert-awards-title">${icon('certification')} My certificates</h2>
      <ul class="cert-awards" data-cert-awards></ul>
      <a class="cert-text-link" href="#view=training&amp;section=certificates">Open certifications ${icon('arrow')}</a>
    </section>
  </div>
  <section class="cert-card cert-get-started" data-cert-part="apply" hidden aria-labelledby="cert-apply-title">
    <h2 id="cert-apply-title">${icon('prospects')} Start your certification</h2>
    <p>Add the core certification courses to My Plan and open your first unfinished course.</p>
    <button type="button" class="cert-button primary" data-cert-enroll disabled>Add to My Plan &amp; start</button>
    <p data-cert-enroll-status role="status" hidden></p>
  </section>
  <footer class="cert-card cert-footer">
    <div><h2>${icon('certification')} Ready to get certified?</h2><p>Start with Sales Onboarding and work through the core learning path.</p></div>
    <div><a class="cert-button primary" href="${tab('apply')}">${icon('demo')} Get started</a>
    <a class="cert-button secondary" href="#view=training&amp;section=catalog">${icon('training')} View training curriculum</a></div>
  </footer>
</section>`;
}
