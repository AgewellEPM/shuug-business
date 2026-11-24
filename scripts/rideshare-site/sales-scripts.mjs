const versions = [
  ['script', 'contracts', 'What to say'], ['email', 'mail', 'Email Version'], ['voicemail', 'microphone', 'Voicemail'],
  ['talking', 'chat', 'Rep notes'], ['objections', 'support', 'Objections'], ['followup', 'calendar', 'Follow-Up'],
];
const variables = [
  ['FirstName', 'First name'], ['LastName', 'Last name'], ['Organization', 'Organization'], ['Title', 'Job title'],
  ['YourName', 'Your name'], ['Phone', 'Phone number'], ['DemoDate', 'Demo date and time'], ['Product', 'Product'],
];
const stats = [
  ['library', 'contracts', 'Scripts in Library'], ['top', 'products', 'Most-Used Script'],
  ['uses', 'reports', 'Total Uses'], ['custom', 'certification', 'Custom Scripts'],
];

export function renderSalesScripts(icon) {
  const search = (where, placeholder) => `<form role="search" aria-label="${where}" class="scripts-search">
    ${icon('discover')}<input type="search" maxlength="140" data-scripts-search placeholder="${placeholder}" aria-label="${where}">
  </form>`;
  const button = (action, name, glyph, style = '') => `<button type="button" class="scripts-button ${style}" data-scripts-action="${action}">${icon(glyph)}<span>${name}</span></button>`;
  const stat = ([key, glyph, label]) => `<div class="scripts-stat scripts-stat-${key}"><span class="scripts-stat-icon">${icon(glyph)}</span><div><dt>${label}</dt><dd data-scripts-stat="${key}">—</dd></div></div>`;
  return `<section class="sdr-sales-scripts" data-tab-panel="scripts" hidden aria-labelledby="sales-scripts-title">
    ${search('Search sales scripts', 'Search scripts, audiences, or topics…')}
    <header class="scripts-hero">
      <span class="scripts-hero-icon" aria-hidden="true">${icon('chat')}</span>
      <div><h1 id="sales-scripts-title">Sales Scripts</h1><p>Find the words for a first visit, a demo, or an agreement conversation.</p></div>
      <span class="scripts-hero-art" aria-hidden="true"><span class="scripts-hero-mic">${icon('microphone')}</span><span class="scripts-hero-page"><i></i><i></i><i></i>${icon('demo')}</span></span>
    </header>
    <nav class="scripts-actions" aria-label="Face-to-face visit">
      <button type="button" class="scripts-button" data-visit-script="visit-walk-in">Walk in</button>
      <button type="button" class="scripts-button" data-visit-script="visit-demo">Show the board</button>
      <button type="button" class="scripts-button" data-visit-script="visit-objection">Handle hesitation</button>
      <button type="button" class="scripts-button" data-visit-script="visit-sign">Ask for the signature</button>
    </nav>
    <dl class="scripts-stats">${stats.map(stat).join('')}</dl>
    <p data-scripts-status class="scripts-status" role="status" aria-atomic="true" hidden></p>
    <div class="scripts-layout">
      <aside class="scripts-library-column" aria-label="Sales script selection">
        <section class="scripts-card scripts-library" aria-labelledby="scripts-library-title">
          <h2 id="scripts-library-title">${icon('contracts')} Script Library</h2>
          <p>Choose an audience or sales stage.</p>
          ${search('Search the script library', 'Search scripts…')}
          <ul class="scripts-categories" data-scripts-categories></ul>
          <p data-scripts-empty hidden>No scripts match your search.</p>
        </section>
        <section class="scripts-card scripts-builder" aria-labelledby="scripts-builder-title">
          <h2 id="scripts-builder-title">${icon('chat')} AI Script Builder</h2>
          <p>Describe the audience, the offer, and what you want to happen next.</p>
          <form data-scripts-builder>
            <textarea name="prompt" required maxlength="500" rows="3" placeholder="Try an intro for a nursing home demo…" aria-label="Describe the script you want"></textarea>
            <button type="submit" class="scripts-button scripts-violet">${icon('check')} <span>Generate Script</span></button>
          </form>
        </section>
      </aside>
      <section class="scripts-card scripts-workspace" data-scripts-workspace hidden aria-labelledby="scripts-selected-title">
        <header class="scripts-workspace-header">
          <span class="scripts-audience-icon">${icon('team')}</span>
          <div>
            <h2 id="scripts-selected-title" tabindex="-1"></h2>
            <p class="scripts-meta"><span data-scripts-description></span><span data-scripts-kind class="scripts-kind"></span></p>
          </div>
          ${button('primary', 'Set as Primary', 'certification')}
        </header>
        <div class="scripts-version-tabs" role="tablist" aria-label="Script formats">${versions.map(([id, glyph, label], index) =>
          `<button type="button" id="scripts-tab-${id}" role="tab" data-scripts-version="${id}" aria-selected="${index === 0}" aria-controls="scripts-version-panel" tabindex="${index === 0 ? 0 : -1}">${icon(glyph)}<span>${label}</span></button>`).join('')}</div>
        <div class="scripts-content">
          <div class="scripts-script" id="scripts-version-panel" role="tabpanel" aria-labelledby="scripts-tab-script" tabindex="0"></div>
          <aside class="scripts-utilities" aria-label="Script options">
            <section class="scripts-utility scripts-variables" aria-labelledby="scripts-variables-title">
              <h3 id="scripts-variables-title"><span class="scripts-braces" aria-hidden="true">{ }</span> Insert Variables</h3>
              <p>Personalize this script.</p>
              <div class="scripts-variable-chips">${variables.map(([key, label]) => `<button type="button" data-scripts-variable="${key}" aria-label="Set ${label.toLowerCase()}">{{${key}}}</button>`).join('')}</div>
              <details data-scripts-personalize>
                <summary>Personalization fields</summary>
                <div>${variables.map(([key,label]) => `<label>${label}<input name="${key}" maxlength="120" data-scripts-value="${key}"></label>`).join('')}</div>
              </details>
            </section>
            <section class="scripts-utility" aria-labelledby="scripts-channels-title">
              <h3 id="scripts-channels-title">${icon('chatSend')} Delivery Channels</h3>
              <ul data-scripts-channels></ul>
            </section>
            <section class="scripts-utility scripts-performance" aria-labelledby="scripts-performance-title">
              <h3 id="scripts-performance-title">${icon('reports')} Script Usage</h3>
              <p><strong data-scripts-selected-uses>0</strong> recorded uses by you</p>
            </section>
          </aside>
        </div>
        <p data-scripts-signing hidden><a href="#view=contracts">Open Contracts to review the approved agreement</a> ·
          <a href="#view=training&amp;course=first-week-in-the-field&amp;lesson=decide">Practice the signing conversation</a></p>
        <footer class="scripts-actions">
          ${button('copy', 'Copy Script', 'contracts', 'scripts-blue')}
          ${button('email', 'Generate Email', 'mail')}
          ${button('followup', 'Create Follow-Up', 'calendar')}
          ${button('save', 'Save to Library', 'contracts')}
          ${button('share', 'Share with Team', 'team', 'scripts-violet')}
        </footer>
      </section>
    </div>
    <dialog data-scripts-dialog class="scripts-dialog" aria-labelledby="scripts-dialog-title">
      <form data-scripts-editor>
        <h2 id="scripts-dialog-title">Save to Library</h2>
        <p data-scripts-dialog-summary></p>
        <label>Script title<input name="title" required maxlength="120"></label>
        <label>Email subject<input name="subject" required maxlength="160"></label>
        <label><span data-scripts-dialog-format>Script</span><textarea name="version" required maxlength="1800" rows="10"></textarea></label>
        <p role="status" data-scripts-dialog-status></p>
        <div class="scripts-dialog-actions">
          <button type="button" class="scripts-button" data-scripts-close>Cancel</button>
          <button type="submit" class="scripts-button scripts-blue" data-scripts-dialog-submit>Save Script</button>
        </div>
      </form>
    </dialog>
    <dialog data-scripts-copy-dialog class="scripts-dialog" aria-labelledby="scripts-copy-title">
      <h2 id="scripts-copy-title">Copy Script</h2>
      <p>Select and copy the script text.</p>
      <textarea aria-label="Script text" readonly rows="10"></textarea>
      <button type="button" class="scripts-button" data-scripts-close>Close</button>
    </dialog>
  </section>`;
}
