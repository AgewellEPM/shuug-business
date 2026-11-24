export function renderCommissions(icon) {
  return `<section class="sdr-commissions" data-tab-panel="commissions" aria-labelledby="commissions-title" hidden>
  <header class="com-hero">
    <span class="com-hero-coins" aria-hidden="true"><i></i><i></i></span>
    <div><h2 id="commissions-title">Commission &amp; Earnings</h2><p>Track commissions, current earnings, and payout history.</p></div>
    <div class="com-hero-art" aria-hidden="true">
      <span class="com-hero-coin-stack"></span>
      <span class="com-hero-screen"><i></i><i></i><i></i><i></i></span>
    </div>
  </header>
  <div class="com-mode">
    <a class="button secondary" href="#view=commissions&amp;sample=1" data-com-sample-open>Preview demo</a>
    <nav class="com-demo-menu" data-com-sample-banner aria-label="Demo controls" hidden>
      <strong>Demo data</strong>
      <a href="#view=team&amp;section=profile&amp;sample=1">Profile</a>
      <a href="#view=commissions">Exit preview</a>
    </nav>
  </div>
  <div class="com-metrics">
    <article><span aria-hidden="true">${icon('mail')}</span><div><h3>Current earnings</h3><strong data-com-total>—</strong><p data-com-total-note></p></div></article>
    <article><span aria-hidden="true">${icon('products')}</span><div><h3>Pending commissions</h3><strong data-com-pending>—</strong><p data-com-pending-note></p></div></article>
    <article><span aria-hidden="true">✓</span><div><h3 data-com-year-title>Recorded this year</h3><strong data-com-year>—</strong><p data-com-year-note>Payments logged in the workspace</p></div></article>
    <article><span aria-hidden="true">🎯</span><div><h3>Monthly goal</h3><strong data-com-goal>—</strong><p data-com-goal-note>No goal set</p><div class="com-goal-track"><progress data-com-progress aria-label="Monthly earnings goal progress" hidden></progress><b data-com-goal-percent></b></div></div></article>
  </div>
  <div class="com-grid">
    <article class="com-card">
      <header>${icon('pipeline')}<div><h3>Commission Overview</h3><p>Breakdown by earnings source</p></div></header>
      <div class="com-breakdown"><div class="com-ring" aria-hidden="true"><strong data-com-overview>—</strong><span>Current earnings</span></div>
      <dl data-com-breakdown></dl></div>
    </article>
    <article class="com-card">
      <header>${icon('products')}<div><h3>Commission Structure</h3><p>Rates by product and service</p></div></header>
      <div data-com-structure></div>
    </article>
    <article class="com-card">
      <header>${icon('pipeline')}<div><h3>Earnings Trend</h3><p data-com-trend-note>Recorded payments over the last six months</p></div>
        <span class="com-projected" data-com-projected hidden><strong>$10,480</strong><small>Projected</small></span></header>
      <canvas class="com-line-chart" data-com-plot aria-hidden="true"></canvas>
      <ol class="com-chart" data-com-trend aria-label="Recorded payments by month"></ol>
      <p data-com-trend-empty></p>
    </article>
    <article class="com-card">
      <header><span aria-hidden="true">🏆</span><div><h3>Earning Tiers &amp; Incentives</h3><p>Monthly earnings milestones</p></div></header>
      <div class="com-tiers" data-com-tiers hidden>
        <div><span aria-hidden="true">★</span><h4>Tier 1</h4><strong>$0–$2,499</strong><small>Base commission</small></div>
        <div><span aria-hidden="true">★</span><h4>Tier 2</h4><strong>$2,500–$4,999</strong><small>+5% bonus</small></div>
        <div><span aria-hidden="true">★</span><h4>Tier 3</h4><strong>$5,000–$9,999</strong><small>+10% bonus</small></div>
        <div><span aria-hidden="true">👑</span><h4>Tier 4</h4><strong>$10,000+</strong><small>+15% bonus</small></div>
      </div>
      <p data-com-incentives></p>
    </article>
    <article class="com-card com-ledger" data-com-ledger hidden>
      <header>${icon('calendar')}<div><h3 data-com-ledger-title>Recorded earnings</h3><p data-com-ledger-note></p></div><button type="button" class="com-all-earnings" data-com-all-earnings aria-expanded="false" hidden>View all earnings →</button></header>
      <form class="com-search" data-com-search role="search" aria-label="Search recorded earnings">
        <input type="search" name="query" aria-label="Search payment descriptions" placeholder="Search payment descriptions" maxlength="140">
        <button type="submit" class="button secondary">Search</button>
      </form>
      <div class="com-table-scroll">
        <table><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Description</th><th scope="col" data-com-demo-column hidden>Type</th><th scope="col">Amount</th><th scope="col" data-com-demo-column hidden>Status</th></tr></thead>
        <tbody data-com-receipts></tbody></table>
      </div>
      <p role="status" data-com-ledger-status></p>
      <div class="com-controls" data-com-controls>
        <button class="button secondary" type="button" data-com-previous disabled>Previous</button>
        <button class="button secondary" type="button" data-com-next disabled>Next</button>
      </div>
    </article>
    <article class="com-card">
      <header>${icon('mail')}<div><h3>Payouts &amp; Settings</h3><p>Manage payout preferences and view statements</p></div></header>
      <div class="com-demo-payout" data-com-demo-payout hidden>
        <div class="com-payout-date"><span aria-hidden="true">${icon('calendar')}</span><small>Next payout</small><strong>Dec 5, 2026</strong><p>Estimated <b>$8,400.00</b></p></div>
        <div class="com-payout-options">
          <details><summary><strong>Payout method</strong><span>ACH · •••• 4821</span></summary><p>Electronic bank transfer to the account ending in 4821.</p></details>
          <details><summary><strong>Commission settings</strong><span>View rates</span></summary><p>The rates and tiers shown here are for the demo. Contact your workspace owner for your approved commission plan.</p></details>
          <details><summary><strong>Earnings statements</strong><span>View history</span></summary><p>November 2026 · $4,860.00<br>Year to date · $38,620.00</p></details>
        </div>
      </div>
      <p data-com-payout-notice>Payout scheduling and payment methods are not configured in this workspace.</p>
      <div class="com-settings" data-com-settings hidden>
        <button type="button" class="button secondary" data-com-record>Record a payment</button>
        <form data-com-goal-form>
          <label>Monthly goal (USD)<input name="goal" inputmode="decimal" maxlength="12" placeholder="Optional"></label>
          <button class="button secondary" type="submit">Save goal</button>
        </form>
        <p>Goal settings stay in this browser.</p>
        <p data-com-goal-status role="status"></p>
      </div>
    </article>
  </div>
</section>`;
}
