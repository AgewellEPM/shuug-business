export function renderSalesEmail(icon) {
  return `<section data-tab-panel="email" hidden aria-labelledby="sales-email-title">
    <div class="sdr-email-hero">
      <div>${icon('mail')}<h2 id="sales-email-title">Email</h2><p data-email-account></p></div>
      <button type="button" class="button primary" data-email-compose>Compose</button>
    </div>
    <div class="sdr-card sdr-email-setup" data-email-setup hidden>
      <div><h3>Connect your business email</h3><p>Open your inbox and send from your own address inside TinkyTown.</p></div>
      <button type="button" class="button primary" data-email-settings>Open Senders</button>
    </div>
    <section class="sdr-card sdr-email-workspace" aria-label="Mailbox">
      <div class="sdr-email-toolbar">
        <div class="sdr-email-folders" role="group" aria-label="Mail folders">
          <button type="button" data-email-folder="inbox" aria-pressed="true">Inbox</button>
          <button type="button" data-email-folder="sent" aria-pressed="false">Sent</button>
          <button type="button" data-email-folder="drafts" aria-pressed="false">Drafts</button>
        </div>
        <form class="sdr-email-search" role="search" aria-label="Search email">
          <input type="search" name="query" maxlength="160" aria-label="Subject or email address" placeholder="Subject or email address">
          <button type="submit" class="button secondary">Search</button>
        </form>
        <button type="button" class="button secondary" data-email-refresh>Refresh</button>
      </div>
      <div class="sdr-email-contact-filter" data-email-contact-filter hidden><strong></strong><button type="button" class="button secondary">Clear contact filter</button></div>
      <p class="sdr-email-status" role="status" aria-live="polite" data-email-status></p>
      <div class="sdr-email-grid">
        <div class="sdr-email-index"><ul data-email-list aria-label="Messages"></ul>
          <div class="sdr-email-pages" hidden>
            <button type="button" class="button secondary" data-email-newer>Newer</button>
            <button type="button" class="button secondary" data-email-older>Older</button>
          </div>
        </div>
        <article class="sdr-email-reader" data-email-reader aria-label="Selected message"></article>
        <section class="sdr-email-editor" data-email-editor aria-label="Compose email" hidden></section>
      </div>
    </section>
  </section>`;
}
