const care = [
  ['hospital','🏥','TinkyTown Hospital','Admissions, bedside care and discharge'],
  ['nursing-home','🏡','Nursing home','Daily care, meals and resident preferences'],
  ['senior-center','☀️','Senior center','Programs, transportation and community services'],
  ['stroke','🗣️','TinkyStroke','Patient communication, nurse tools and handoff'],
];
const places = [
  ['townhall','🏛️','Hartford Town Hall','City offices and public counters'],
  ['directory','📍','All venue conversations','Find a place to visit or call'],
  ['college','🎓','Colleges & universities','Campus offices, student life and support'],
  ['airport','✈️','Airports','From check-in to baggage claim'],
  ['home','🏠','Home & family','Daily routines and personal communication'],
  ['school','🏫','Schools','Classroom, nurse, play and school day'],
  ['restaurants','🍽️','Restaurants','Choose a venue and place an order'],
  ['boards','💬','All picture boards','Browse the TinkyTown board library'],
  ['community','🚌','Community & transit','Schools, libraries, restaurants and transportation'],
  ['bank','🏦','Banks','Teller windows and branch services'],
  ['grocery','🛒','Grocery stores','Service counters and checkout'],
  ['hotel','🛎️','Hotels','Reception, rooms and guest services'],
  ['pharmacy','💊','Pharmacies','Prescriptions and pharmacy counters'],
  ['dmv','🚙','Motor vehicles','Licenses, permits and registration'],
  ['usps','✉️','Post offices','Stamps, parcels and counter services'],
  ['clinic','🩺','Medical office','Hartford medical office check-in'],
  ['library','📚','Hartford library','Public library desk'],
  ['police','🏢','Police front desk','Non-emergency visitor communication'],
];
const guides = [['airports','Airports'],['banks','Banks'],['dmv','DMV'],['grocery','Grocery'],
  ['home','Home & family'],['hospitals','Hospitals & clinics'],['hotels','Hotels'],['libraries','Libraries'],
  ['pharmacies','Pharmacies'],['police','Police front desks'],['restaurants','Restaurants'],['schools','Schools'],
  ['town-halls','Town halls'],['usps','Post offices']];
function links(items) {
  return items.map(([id, icon, title, description]) => `<a class="care-launch" href="#view=demo&amp;venue=${id}" data-care-launch="${id}">
    <span class="care-launch-icon" aria-hidden="true">${icon}</span>
    <span><strong>${title}</strong><small>${description}</small></span><span aria-hidden="true">›</span></a>`).join('');
}

const demos = new Set([...care, ...places].map(([id]) => id));
export function demoDestination(path) {
  if (path === '/demo' || path === '/demo/') return '/sales/senior-care#view=demo';
  if (!path?.startsWith('/demo/')) return;
  const slug = path.slice(6).replace(/\/$/, '');
  const venue = slug === 'ct/hartford/townhall' ? 'townhall' : slug;
  if (demos.has(venue)) return '/sales/senior-care#view=demo&venue=' + venue + '&present=1';
}

export function renderCareDemo() {
  return `<section class="sdr-demo" data-tab-panel="demo" aria-labelledby="sales-demo-title" hidden>
  <div data-care-home>
    <header class="sdr-demo-hero care-demo-hero">
      <div><h2 id="sales-demo-title">TinkyTown locations</h2>
        <p>Choose a setting, let your guest try both sides of a conversation, then plan where their team will use it first.</p></div>
      <img src="/care-town.webp" alt="" width="590" height="393">
    </header>
    <a class="button" href="#view=training-demo">Open Training Demo Lab</a>
    <section class="care-destinations"><h3>Care settings</h3>
      <div class="care-launch-grid">${links(care)}</div></section>
    <section class="care-destinations"><h3>Explore TinkyTown</h3>
      <div class="care-launch-grid care-compact">${links(places)}</div></section>
    <details class="care-public-pages"><summary>Venue guides on TinkyTown.com</summary>
      <div>${guides.map(([slug,name]) => `<a href="https://tinkytown.com/venues/${slug}.html" target="_blank" rel="noopener noreferrer">${name} ↗</a>`).join('')}</div>
    </details>
  </div>
  <section data-care-stage hidden aria-label="Location demo">
    <nav class="care-stage-header" aria-label="Demo navigation">
      <a href="#view=demo" data-care-return>← Demo locations</a>
      <strong id="care-stage-title" data-care-place></strong>
      <div class="care-stage-actions">
        <a href="#view=demo" data-care-plan-toggle>Plan a pilot</a>
        <button type="button" data-care-present aria-pressed="false">Present kiosk</button>
      </div>
    </nav>
    <a class="button" href="#view=training-demo">Back to Training Demo Lab</a>
    <div data-care-plan hidden></div>
    <div data-care-experience>
    <div data-care-tour-shell><div data-care-tour></div></div>
    <div class="care-stage-links" data-care-modes></div>
    <div data-care-mount></div>
    <div data-care-stroke hidden></div>
    <div data-care-guide hidden>
  <div class="sdr-demo-products" role="group" aria-label="Product demo">
    <button type="button" data-demo-product="stroke" aria-pressed="true">
      <span class="sdr-demo-product-icon" aria-hidden="true">🗣️</span>
      <span><strong>TinkyStroke</strong><small>Communication after a stroke</small></span>
    </button>
    <button type="button" data-demo-product="hospital" aria-pressed="false">
      <span class="sdr-demo-product-icon" aria-hidden="true">🏥</span>
      <span><strong>TinkyTown Hospital</strong><small>QR and kiosk communication at reception</small></span>
    </button>
  </div>
  <p data-demo-loading role="status">Loading communication boards…</p>
  <button type="button" class="button" data-demo-retry hidden>Try again</button>
  <div data-demo-session hidden>
    <div class="sdr-demo-session-bar">
      <div data-demo-scenarios class="sdr-demo-scenarios" role="group" aria-label="Care setting"></div>
      <button type="button" class="button sdr-demo-reset" data-demo-reset>Restart demo</button>
    </div>
    <div class="sdr-demo-columns">
      <section class="sdr-card sdr-demo-board" aria-labelledby="sales-demo-board-title">
        <div class="sdr-demo-board-head">
          <div><h3 id="sales-demo-board-title" data-demo-board-title></h3><p data-demo-board-subtitle></p></div>
          <label>Board<select data-demo-board-picker></select></label>
        </div>
        <div class="sdr-demo-message" aria-labelledby="sales-demo-message-title">
          <div><span id="sales-demo-message-title">Selected message</span>
            <p data-demo-message role="status" aria-atomic="true">Choose a tile to say something.</p></div>
          <div class="sdr-demo-message-actions">
            <button type="button" class="button primary" data-demo-speak disabled>Speak</button>
            <button type="button" class="button" data-demo-save disabled hidden>Save phrase</button>
          </div>
        </div>
        <p class="sdr-demo-feedback" data-demo-feedback role="status"></p>
        <div class="sdr-demo-board-tools">
          <button type="button" class="button" data-demo-back hidden>← Back to previous board</button>
          <label data-demo-language-field hidden>Board language<select data-demo-language></select></label>
          <label><input type="checkbox" data-demo-auto checked> Speak on tap</label>
        </div>
        <div class="sdr-demo-tiles" data-demo-tiles role="group" tabindex="-1" aria-labelledby="sales-demo-board-title"></div>
        <p data-demo-scan-help id="sales-demo-scan-help" hidden>Press Space or Enter when the tile you want is highlighted. Press Escape to stop scanning.</p>
        <details class="sdr-demo-details">
          <summary>Access options</summary>
          <div class="sdr-demo-access">
            <label><input type="checkbox" data-demo-large> Larger tiles</label>
            <label><input type="checkbox" data-demo-dwell> Select by holding the pointer over a tile</label>
            <button type="button" class="button" data-demo-scan aria-pressed="false">Start switch scan</button>
          </div>
        </details>
      </section>
      <aside class="sdr-card sdr-demo-guide" aria-labelledby="sales-demo-guide-title">
        <div class="sdr-demo-guide-heading"><h3 id="sales-demo-guide-title">Walkthrough</h3><span data-demo-progress></span></div>
        <p data-demo-setting></p>
        <div class="sdr-demo-prompt"><span data-demo-speaker></span><p data-demo-prompt></p></div>
        <p data-demo-instruction></p>
        <div class="sdr-demo-independence"><h4>What they can do independently</h4><p data-demo-independence></p></div>
        <div class="sdr-demo-guide-actions">
          <button type="button" class="button" data-demo-prev disabled>Back</button>
          <button type="button" class="button primary" data-demo-next>Next prompt</button>
        </div>
        <details class="sdr-demo-details" data-demo-notes>
          <summary>Conversation this session</summary>
          <p data-demo-empty>No messages yet.</p><ol data-demo-history></ol>
          <p data-demo-pain hidden></p>
        </details>
        <details class="sdr-demo-details" data-demo-native hidden>
          <summary>More TinkyStroke tools</summary>
          <p><a href="#view=demo&amp;venue=stroke">Open TinkyStroke tools →</a></p>
          <ul><li>Eye-gaze and switch scanning for tile selection.</li>
            <li>Speech input, a recorded message bank, and custom tiles.</li>
            <li>Nurse Tools with pain history, vitals, and a handoff card.</li>
            <li>Session history and a speech-language pathologist report.</li></ul>
        </details>
        <p class="sdr-demo-training">Practice session. Tiles display and speak messages here.</p>
      </aside>
    </div>
  </div>
    </div>
    </div>
  </section>
</section>`;
}
