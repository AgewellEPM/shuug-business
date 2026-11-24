export function renderProspects({ icon, map, linkedIn, seniorCare }) {
  const metrics = [
    ['total', 'Saved prospects', 'team', 'blue'],
    ['active', 'Active', 'arrow', 'green'],
    ['due', 'Follow-ups due', 'calendar', 'gold'],
    ['progress', 'In progress', 'pipeline', 'violet'],
    ['ready', 'Ready to contract', 'contracts', 'mint'],
  ];
  return `<section class="sdr-prospects" data-tab-panel="prospects" hidden aria-labelledby="sdr-prospects-title">
  <header class="prospects-hero">
    ${icon('team')}
    <div><h2 id="sdr-prospects-title">Prospects</h2><p>Manage potential customers, track progress, and move opportunities to contracts.</p></div>
  </header>
  <div class="prospects-metrics" aria-label="Prospect summary">
    ${metrics.map(([key, label, symbol, color]) => `<div class="prospects-metric ${color}"><span>${icon(symbol)}</span><div><p>${label}</p><strong data-prospect-metric="${key}">0</strong></div></div>`).join('')}
  </div>
  <div class="prospects-grid">
    <section class="prospects-card prospects-filters" aria-labelledby="prospects-filter-title">
      <div class="prospects-card-head"><h3 id="prospects-filter-title">Filters</h3><button type="button" class="prospects-text" data-prospect-clear>Clear all</button></div>
      <form id="sales-business-prospect-filter">
        <div class="prospects-filter-fields">
          <label>Search<input type="search" name="query" maxlength="180" placeholder="Search prospects…"></label>
          <label>Office type<select name="type"><option value="">All types</option></select></label>
          <label>Territory<select name="state"><option value="">All territories</option></select></label>
          <button type="button" class="button secondary" data-prospect-save-filter>Save filter</button>
        </div>
        <fieldset><legend>Status</legend><div data-prospect-stages></div></fieldset>
      </form>
      <p data-prospect-filter-status class="prospects-muted" role="status"></p>
    </section>
    <div class="prospects-center">
      <section class="prospects-card prospects-list-card" aria-labelledby="prospects-list-title">
        <div class="prospects-list-head"><h3 id="prospects-list-title">Prospects <span data-prospect-count>(0)</span></h3><button type="button" class="button primary" data-prospect-add><span aria-hidden="true">+</span> Add prospect</button></div>
        <div class="prospects-views" role="group" aria-label="Prospect view">
          <button type="button" data-prospect-view="list" aria-pressed="true">${icon('contacts')} List</button>
          <button type="button" data-prospect-view="map" aria-pressed="false">${icon('locations')} Map</button>
          <button type="button" data-prospect-view="pipeline" aria-pressed="false">${icon('pipeline')} Pipeline</button>
        </div>
        <div data-prospect-pane="list">
          <div class="prospects-table-scroll" data-prospect-saved-table><table class="prospects-table">
            <thead><tr><th scope="col" aria-sort="ascending"><button type="button" data-prospect-sort>Office / organization <span aria-hidden="true">↕</span></button></th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Next action</th></tr></thead>
            <tbody data-prospect-rows></tbody>
          </table></div>
          <p class="prospects-empty" data-prospect-empty hidden></p>
          <section class="prospects-directory" data-prospect-directory hidden aria-labelledby="prospects-directory-title">
            <div class="prospects-directory-head">
              <h4 id="prospects-directory-title">Directory matches</h4>
              <div data-prospect-directory-sources></div>
            </div>
            <p data-prospect-directory-status role="status"></p>
            <div class="prospects-table-scroll prospects-directory-scroll" data-prospect-directory-table hidden>
              <table class="prospects-table">
                <thead><tr><th scope="col">Office / organization</th><th scope="col">Type</th><th scope="col">Facility Administrator</th><th scope="col">Action</th></tr></thead>
                <tbody data-prospect-directory-results></tbody>
              </table>
            </div>
            <nav class="prospects-pagination" data-prospect-directory-pages aria-label="Directory result pages" hidden>
              <button type="button" class="button secondary" data-prospect-directory-prev>‹ Previous</button>
              <button type="button" class="button secondary" data-prospect-directory-next>Next ›</button>
            </nav>
            <button type="button" class="button secondary" data-prospect-directory-retry hidden>Retry directory</button>
          </section>
        </div>
        <div class="prospects-map" data-prospect-pane="map" hidden>${map}<div data-prospect-map-summary></div></div>
        <div class="prospects-board" data-prospect-pane="pipeline" hidden></div>
      </section>
      <nav class="prospects-pagination" aria-label="Prospect result pages" data-prospect-pages hidden>
        <button type="button" class="button secondary" data-prospect-prev>‹ Previous</button><div data-prospect-page-buttons></div>
        <button type="button" class="button secondary" data-prospect-next>Next ›</button><span data-prospect-range role="status"></span>
      </nav>
    </div>
    <aside class="prospects-card prospects-detail" data-prospect-detail aria-label="Selected prospect">
      <div class="prospects-detail-head"><span>${icon('contacts')}</span><div><h3>Prospect details</h3><p>Choose a prospect to view its record.</p></div></div>
    </aside>
  </div>
  <section class="prospects-card prospects-add" data-prospect-editor hidden aria-labelledby="prospects-add-title">
    <div class="prospects-card-head"><h3 id="prospects-add-title">Add prospect</h3><button type="button" class="prospects-text" data-prospect-cancel>Cancel</button></div>
    <form class="sales-form" id="sales-business-prospect-form">
      <label>Office or organization<input name="name" maxlength="180" required></label>
      <label>Office type<select name="facilityType" ${seniorCare ? 'required' : ''}>
        <option value="">${seniorCare ? 'Choose a type' : 'Other business'}</option>
        <option value="nursing-home">Nursing home</option><option value="senior-center">Senior community center</option>
        ${seniorCare ? '' : '<option value="assisted-living">Assisted living</option><option value="independent-living">Independent living</option><option value="long-term-care">Rehab / long-term care</option>'}
      </select></label>
      <label>Street address<input name="address" maxlength="300" required></label>
      <label>City<input name="city" maxlength="100" required></label>
      <label>State<select name="state" data-states required></select></label>
      <label>ZIP code<input name="postalCode" maxlength="10" autocomplete="postal-code"></label>
      <label>Business website<input name="website" type="url" maxlength="1200"></label>
      <label>Contact name<input name="contact" maxlength="140"></label>
      <label>Business email<input name="email" type="email" maxlength="200"></label>
      <label>Business phone<input name="phone" type="tel" maxlength="60"></label>
      <div class="prospects-editor-actions"><button type="submit" class="button primary">Save prospect</button><button type="button" class="button secondary" data-prospect-linkedin>Add from LinkedIn</button></div>
      <p data-prospect-editor-status role="status"></p>
    </form>
  </section>
  <details class="prospects-card prospects-linkedin" id="sales-linkedin-prospects"><summary>LinkedIn prospects</summary>${linkedIn}</details>
  <dialog class="facility-profile" data-facility-profile aria-labelledby="facility-profile-title">
    <header class="facility-profile-header">
      <div><p data-facility-profile-location></p><h2 id="facility-profile-title" data-facility-profile-title></h2></div>
      <div class="facility-profile-actions">
        <button type="button" class="button primary" data-facility-outreach aria-controls="facility-outreach-drafts" hidden>Quick Email</button>
        <button type="button" class="button secondary" data-facility-profile-close aria-label="Close facility profile" autofocus>Close</button>
      </div>
    </header>
    <div class="facility-profile-body">
      <section aria-labelledby="facility-overview-title">
        <h3 id="facility-overview-title">Facility overview</h3>
        <p data-facility-profile-description></p>
        <dl class="facility-facts" data-facility-profile-facts></dl>
        <div class="facility-profile-links" data-facility-profile-links></div>
      </section>
      <section class="facility-team" aria-labelledby="facility-team-title">
        <div><h3 id="facility-team-title">Organization chart</h3><p data-facility-profile-team-status></p></div>
        <div class="facility-team-layout">
          <div class="facility-team-chart" data-facility-profile-team></div>
          <section class="facility-team-contact" aria-labelledby="facility-contact-title">
            <h4 id="facility-contact-title">Contact details</h4>
            <div data-facility-profile-contact></div>
          </section>
        </div>
      </section>
      <section class="facility-outreach" id="facility-outreach-drafts" data-facility-outreach-drafts aria-labelledby="facility-outreach-title" hidden>
        <h3 id="facility-outreach-title" tabindex="-1">Individual outreach drafts</h3>
        <p data-facility-outreach-status role="status"></p>
        <div data-facility-outreach-list></div>
      </section>
    </div>
  </dialog>
</section>`;
}
