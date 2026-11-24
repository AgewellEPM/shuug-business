export function renderCareDemo() {
  return `<section class="sdr-demo" data-tab-panel="demo" aria-labelledby="sales-demo-title" hidden>
  <header class="sdr-demo-hero">
    <div><h2 id="sales-demo-title">Demo</h2>
      <p>Show how people can speak for themselves at hospital reception, at the bedside, and in a nursing home.</p></div>
    <img src="/sales-prospects-community.webp" alt="" width="384" height="192" loading="lazy">
  </header>
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
          <ul><li>Eye-gaze and switch scanning for tile selection.</li>
            <li>Speech input, a recorded message bank, and custom tiles.</li>
            <li>Nurse Tools with pain history, vitals, and a handoff card.</li>
            <li>Session history and a speech-language pathologist report.</li></ul>
        </details>
        <p class="sdr-demo-training">Practice session. Tiles display and speak messages here.</p>
      </aside>
    </div>
  </div>
</section>`;
}
