export function renderCommissions(icon) {
  return `<section class="sdr-commissions" data-tab-panel="commissions" aria-labelledby="commissions-title" hidden>
  <header class="com-hero">
    <span aria-hidden="true">🪙</span>
    <div><h2 id="commissions-title">Commissions &amp; earnings</h2><p>Track recorded earnings and review how commissions are calculated.</p></div>
  </header>
  <div class="com-sample-toolbar">
    <a class="button secondary" href="#view=commissions&amp;sample=1" data-com-sample-open>Show sample earnings</a>
  </div>
  <section class="com-sample-banner" data-com-sample-banner aria-label="Sample earnings notice" hidden>
    <div><strong>Sample earnings</strong><p>These fictional figures and rates are for demonstration.</p></div>
    <div class="com-sample-toolbar"><a class="button secondary" href="#view=team&amp;section=profile&amp;sample=1">Show sample profile</a><a class="button secondary" href="#view=commissions">Exit sample</a></div>
  </section>
  <div class="com-metrics">
    <article><span aria-hidden="true">💵</span><div><h3>Current earnings</h3><strong data-com-total>—</strong><p data-com-total-note></p></div></article>
    <article><span aria-hidden="true">📑</span><div><h3>Pending commissions</h3><strong data-com-pending>—</strong><p data-com-pending-note></p></div></article>
    <article><span aria-hidden="true">✓</span><div><h3>Recorded this year</h3><strong data-com-year>—</strong><p data-com-year-note>Payments logged in the workspace</p></div></article>
    <article><span aria-hidden="true">🎯</span><div><h3>Monthly goal</h3><strong data-com-goal>—</strong><p data-com-goal-note>No goal set</p><progress data-com-progress aria-label="Monthly earnings goal progress" hidden></progress></div></article>
  </div>
  <div class="com-grid">
    <article class="com-card">
      <header>${icon('pipeline')}<h3>Commission overview</h3></header>
      <div class="com-breakdown"><div class="com-ring" aria-hidden="true"><strong data-com-overview>—</strong></div>
      <dl data-com-breakdown></dl></div>
    </article>
    <article class="com-card">
      <header>${icon('products')}<h3>Commission structure</h3></header>
      <div data-com-structure></div>
    </article>
    <article class="com-card">
      <header>${icon('pipeline')}<h3>Earnings trend</h3></header>
      <p data-com-trend-note>Recorded payments over the last six months</p>
      <ol class="com-chart" data-com-trend aria-label="Recorded payments by month"></ol>
      <p data-com-trend-empty></p>
    </article>
    <article class="com-card">
      <header><span aria-hidden="true">🏆</span><h3>Earning tiers &amp; incentives</h3></header>
      <p data-com-incentives></p>
    </article>
    <article class="com-card com-ledger" data-com-ledger hidden>
      <header>${icon('calendar')}<h3 data-com-ledger-title>Recorded earnings</h3></header>
      <form class="com-search" data-com-search role="search" aria-label="Search recorded earnings">
        <input type="search" name="query" aria-label="Search payment descriptions" placeholder="Search payment descriptions" maxlength="140">
        <button type="submit" class="button secondary">Search</button>
      </form>
      <div class="com-table-scroll">
        <table><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Description</th><th scope="col">Amount</th></tr></thead>
        <tbody data-com-receipts></tbody></table>
      </div>
      <p role="status" data-com-ledger-status></p>
      <div class="com-controls" data-com-controls>
        <button class="button secondary" type="button" data-com-previous disabled>Previous</button>
        <button class="button secondary" type="button" data-com-next disabled>Next</button>
      </div>
    </article>
    <article class="com-card">
      <header>${icon('mail')}<h3>Payouts &amp; settings</h3></header>
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
