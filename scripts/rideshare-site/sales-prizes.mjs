const schedule = { id: '2026-11', month: 'November 2026', signGoal: 10, demoGoal: 20 };
const prizes = [
  ['grand', 'Grand Prize', 'Top overall performer by total points.', 'MacBook Air M4', '13-inch', 'Top rep', 'laptop'],
  ['tier1', 'Tier 1 · 10+ Activations', 'Sign 10+ new locations or reach 150% of your goal.', 'iPad Air', '11-inch, 256 GB', '10+ deals', 'tablet'],
  ['tier2', 'Tier 2 · 5–9 Activations', 'Sign 5–9 new locations or reach 125% of your goal.', 'Apple Watch', 'Series 10', '5–9 deals', 'watch'],
  ['tier3', 'Tier 3 · 3–4 Activations', 'Sign 3–4 new locations or reach 100% of your goal.', 'AirPods Pro', '2nd generation', '3–4 deals', 'earbuds'],
  ['tier4', 'Tier 4 · 1–2 Activations', 'Sign 1–2 new locations or complete the monthly mission.', '$100 Amazon', 'Gift card', '1–2 deals', 'gift-card'],
];
const bonuses = [
  ['resources', 'Early Bird Prize', 'Sign your first 3 new locations by the 10th to qualify for a gift card.'],
  ['forecast', 'Referral Bonus', 'Refer a qualified new rep for a $250 bonus.'],
  ['certification', 'Monthly Raffle', 'Active reps are eligible for the monthly raffle.'],
];

export function renderMonthlyPrizes(icon) {
  const summary = [
    ['calendar', 'Prize month', schedule.month],
    ['discover', 'How to earn', 'Sign new locations, book demos, and take part in the monthly mission.'],
    ['trophy', 'Top performer', 'The highest total points qualify for the Grand Prize.'],
    ['team', 'All active reps eligible', 'Work toward tiered prizes, bonuses, and the monthly raffle.'],
  ];
  return `<section class="sdr-prizes" data-tab-panel="resources" data-prize-month="${schedule.id}" hidden aria-labelledby="sales-prizes-title">
  <form class="prize-search" role="search" aria-label="Monthly prizes" data-prize-search>
    ${icon('discover')}<input name="query" type="search" maxlength="120" placeholder="Search prize items or tiers…" aria-label="Search prize items or tiers">
    <button type="button" data-prize-clear hidden>Clear</button>
  </form>
  <header class="prize-hero">${icon('resources')}<div><h1 id="sales-prizes-title">Monthly Prize List</h1>
    <p>Sales incentives and rewards for top performance each month.</p></div></header>
  <dl class="prize-summary">${summary.map(([symbol, title, detail]) =>
    `<div>${icon(symbol)}<dt>${title}</dt><dd>${detail}</dd></div>`).join('')}</dl>
  <div class="prize-layout">
    <section class="prize-panel prize-list" aria-labelledby="prize-list-title">
      <h2 id="prize-list-title">${icon('trophy')} ${schedule.month} prizes</h2>
      <p>Sign new locations to work toward higher prize tiers.</p>
      <p class="prize-empty" role="status" data-prize-empty hidden>No prizes match your search.</p>
      <ol>${prizes.map(([id, title, goal, product, detail, tag, image]) => `
        <li class="prize-row" data-prize-row="${id}">
          <div class="prize-rule">${icon(id === 'tier4' ? 'resources' : 'trophy')}<div><h3>${title}</h3><p>${goal}</p></div></div>
          <img src="/sales-prizes/${image}.webp" alt="" width="200" height="125" decoding="async">
          <div class="prize-product"><strong>${product}</strong><span>${detail}</span><small>${tag}</small></div>
        </li>`).join('')}</ol>
    </section>
    <div class="prize-side">
      <section class="prize-panel" aria-labelledby="prize-goals-title">
        <h2 id="prize-goals-title">${icon('reports')} Monthly goals</h2>
        <p data-prize-scope>Progress for ${schedule.month}.</p>
        <ul class="prize-goals">
          <li>${icon('discover')}<div><strong>Primary goal</strong><span>Sign ${schedule.signGoal}+ new locations</span></div><span data-prize-count="signedLocations" data-prize-target="${schedule.signGoal}">—</span></li>
          <li>${icon('calendar')}<div><strong>Bonus goal</strong><span>Book ${schedule.demoGoal}+ demos for the month</span></div><span data-prize-count="confirmedDemos" data-prize-target="${schedule.demoGoal}">—</span></li>
          <li>${icon('forecast')}<div><strong>Mission bonus</strong><span>Complete the assigned monthly mission</span></div><span>+ Points</span></li>
        </ul>
        <p data-prize-status class="prize-activity" role="status"></p>
      </section>
      <section class="prize-panel" aria-labelledby="prize-bonus-title">
        <h2 id="prize-bonus-title">${icon('resources')} Bonuses &amp; raffles</h2>
        <div class="prize-bonuses">${bonuses.map(([symbol, name, detail], index) => `<article>${icon(symbol)}<h3>${name}</h3><p>${detail}</p>${index === 0 ? '<small data-prize-early></small>' : ''}</article>`).join('')}</div>
        <p class="prize-activity">The workspace owner reviews eligibility and confirms awards.</p>
      </section>
    </div>
  </div>
</section>`;
}
