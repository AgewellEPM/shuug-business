const topics = [
  ['access', 'Login & Access'], ['prospects', 'Adding Prospects'], ['pipeline', 'CRM & Pipeline'],
  ['contracts', 'Contracts'], ['mobile', 'App & Mobile'], ['billing', 'Billing'],
];

const art = name => `<img class="support-reference-icon reference-${name}" src="/support-art/${name}.png" alt="" aria-hidden="true">`;

export function renderSupportSidebar() {
  return `<section class="support-sidebar-help">
    ${art('rocket')}<strong>Need help?</strong><p>Get guides and training materials.</p>
    <button type="button" data-support-sidebar-resources>View Resources</button>
  </section>`;
}

export function renderSupport() {
  const cards = [
    ['article', 'articles', 'Help Articles', 'Step-by-step guides and how-to articles.', 'Browse Articles'],
    ['guide', 'guides', 'User Guides', 'Documentation for sales and admin tools.', 'View Guides'],
    ['tutorial', 'tutorials', 'Quick Tutorials', 'Short walkthroughs to get you up and running.', 'Browse Tutorials'],
    ['create', 'contact', 'Contact Support', 'Get help from your workspace team.', 'Submit a Request'],
    ['chat', 'chat', 'Support Chat', 'Start a conversation and get replies here.', 'Start Chat'],
  ];
  const metrics = [
    ['connection', 'connection', 'System Status'], ['open', 'requests', 'My Requests'],
    ['response', 'response', 'Avg. Response Time'], ['resolved', 'resolved', 'Resolved This Month'],
    ['satisfaction', 'satisfaction', 'Satisfaction'],
  ];
  return `<section class="sdr-support" data-tab-panel="support" aria-labelledby="support-title" hidden>
    <header class="support-hero">${art('headset')}<div><h1 id="support-title">Support Center</h1>
      <p>Get help, submit a request, and find answers for TinkyTown.</p></div>
    </header>
    <div class="support-metrics" aria-label="Support summary">${metrics.map(([name, glyph, label]) => `
      <div class="support-metric support-metric-${name}">${art(glyph)}<div><span>${label}</span>
        <strong data-support-metric="${name}">—</strong>${name === 'open' ? ' <small>Open</small>' : ''}</div></div>`).join('')}</div>
    <section class="support-search" aria-labelledby="support-search-title">
      <h2 id="support-search-title">How can we help you today?</h2>
      <form data-support-search role="search" aria-label="Search help resources">
        <label class="support-search-input">${art('search')}<input type="search" name="query" aria-label="Search help resources" placeholder="Search for answers, guides, or troubleshooting…"></label>
        <button type="submit" class="support-button support-primary">Search</button>
      </form>
      <div class="support-topics" aria-label="Popular topics"><span>Popular topics:</span>
        ${topics.map(([key, label]) => `<button type="button" data-support-topic="${key}" aria-pressed="false">${label}</button>`).join('')}
      </div>
    </section>
    <div class="support-cards">${cards.map(([action, glyph, title, copy, label]) => `
      <article class="support-card">
        <span class="support-card-art">${art(glyph)}</span><h2>${title}</h2><p>${copy}</p>
        <button type="button" class="support-button" data-support-action="${action}">${label} ${art('arrow')}</button>
      </article>`).join('')}
    </div>
    <section class="support-panel" data-support-library hidden aria-labelledby="support-library-title">
      <header class="support-panel-head"><h2 id="support-library-title" tabindex="-1">Help library</h2>
        <button type="button" class="support-link" data-support-action="clear-library">Close library</button></header>
      <p class="support-panel-note" data-support-results-count role="status"></p>
      <div class="support-library-results" data-support-results></div>
    </section>
    <div class="support-bottom">
      <section class="support-panel" data-support-request-panel aria-labelledby="support-requests-title">
        <header class="support-panel-head"><h2 id="support-requests-title" tabindex="-1">${art('panel-ticket')}<span>My Support Requests</span></h2>
          <button type="button" class="support-link" data-support-action="requests" aria-expanded="false" hidden>View All Requests ${art('arrow')}</button>
        </header>
        <p class="support-panel-note" data-support-request-note role="status">Loading requests…</p>
        <div class="support-table-scroll" data-support-table hidden>
          <table aria-label="Support requests"><thead><tr><th scope="col">#</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Last Update</th></tr></thead><tbody data-support-request-rows></tbody></table>
        </div>
      </section>
      <section class="support-panel" aria-labelledby="support-status-title">
        <header class="support-panel-head"><h2 id="support-status-title">${art('panel-status')}System Status</h2>
          <button type="button" class="support-link" data-support-action="refresh">Refresh Status ${art('arrow')}</button>
        </header>
        <ul class="support-service-list"><li><span>Sales Workspace (CRM)</span><strong data-support-service="workspace">Checking…</strong></li>
          <li><span>Support requests</span><strong data-support-service="requests">Checking…</strong></li>
        </ul>
        <p class="support-panel-note" data-support-check-time role="status"></p>
      </section>
    </div>
    <dialog class="support-dialog" data-support-dialog aria-labelledby="support-dialog-title">
      <header><h2 id="support-dialog-title"></h2><button type="button" class="support-icon-button" data-support-action="close-dialog" aria-label="Close">×</button></header>
      <div data-support-dialog-body></div>
    </dialog>
    <template data-support-create>
      <form class="support-form" data-support-form="create">
        <label>Subject<input name="subject" required maxlength="160" placeholder="Summarize your question or issue"></label>
        <label>Category<select name="category" required>${[...topics, ['other', 'Other']].map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label>
        <label>Message<textarea name="message" required maxlength="5000" rows="5" placeholder="Describe what you need help with."></textarea></label>
        <p role="status" data-support-form-note></p>
        <button type="submit" class="support-button support-primary">Submit request</button>
      </form>
    </template>
  </section>`;
}
