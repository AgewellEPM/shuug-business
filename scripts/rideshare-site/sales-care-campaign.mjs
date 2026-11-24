import { escape as e } from './layout.mjs';

const paths = {
  target: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 8-8m-2-2v4h4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  shield: '<path d="m12 3 8 3v5c0 5-3.5 8.2-8 11-4.5-2.8-8-6-8-11V6Z"/><path d="m8 12 3 3 5-6"/>',
  chart: '<rect x="3" y="13" width="3.5" height="8" rx="1"/><rect x="10" y="8" width="3.5" height="13" rx="1"/><rect x="17" y="3" width="3.5" height="18" rx="1"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/>',
  megaphone: '<path d="M3 10h5l10-6v15L8 14H3Zm5 4 2 6m11-12 1-1m-1 8 1 1"/>',
  speech: '<path d="M20 12a7 7 0 0 1-7 7H9l-5 3 1-6a7 7 0 0 1-2-5 7 7 0 0 1 7-7h3a7 7 0 0 1 7 8Z"/><path d="M7 9h9m-9 4h6"/>',
  heart: '<path d="M20.4 4.9a5 5 0 0 0-7.1 0L12 6.2l-1.3-1.3a5 5 0 0 0-7.1 7.1L12 21l8.4-9a5 5 0 0 0 0-7.1Z"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2Zm14-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 4 5v1"/>',
  layers: '<path d="m2 8 10-5 10 5-10 5zm1 5 9 5 9-5m-18 5 9 5 9-5"/>',
  tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18m-14 4h2m4 0h2"/>',
  cloud: '<path d="M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11Z"/>',
  bed: '<path d="M2 20V7m0 10h20v3m0-3v-6a2 2 0 0 0-2-2h-8v6M2 15h20"/><circle cx="7" cy="10" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.1m7.9 0h.1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  play: '<path d="m7 3 13 9-13 9Z" fill="currentColor" stroke="none"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};
const icon = name => `<svg class="cc-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const tabs = [['why', 'Why Nursing Homes?', 'target'], ['benefits', 'Key Benefits', 'star'], ['features', 'Features', 'grid'], ['compliance', 'Compliance', 'shield'], ['roi', 'ROI & Impact', 'chart'], ['materials', 'Sales Materials', 'folder']];
const benefits = [
  ['speech', 'Resident Communication', 'Symbols, text and voice for everyday needs.'],
  ['heart', 'Better Well-Being', 'More ways to express feelings and choices.'],
  ['team', 'Staff Efficiency', 'A shared way to understand a request.'],
  ['shield', 'Accessible Care', 'Communication preferences guide the conversation.'],
];
const selling = [
  ['Give every resident a voice', 'Offer a way to ask, answer or make a choice when speech is difficult.'],
  ['Make care more personal', 'Let residents say what they need in their own time.'],
  ['Support staff on each shift', 'Use familiar boards for meals, activities and comfort.'],
  ['Support accessibility planning', 'Ask how the team identifies and honors communication preferences.'],
  ['Engage families', 'Invite loved ones to share familiar words and interests.'],
  ['Start on one unit', 'Use the pilot findings to decide where to expand.'],
];
const features = [
  ['tablet', 'TinkySpeak™ AAC', 'Tap a symbol to speak a message.'],
  ['team', 'Resident Preferences', 'Identify useful phrases and familiar choices.'],
  ['calendar', 'Daily Care & Activities', 'Explore boards for meals, comfort and routines.'],
  ['heart', 'Family Connection', 'Show how a resident can ask to call family.'],
  ['chart', 'Reporting & Insights', 'Plan how the team will track pilot measures.'],
  ['cloud', 'Deployment Planning', 'Choose a tablet, unit and shift lead for the trial.'],
];
const metrics = [
  ['smile', '↑ 40%', 'Resident engagement', 'Count opportunities where a resident expresses a choice.'],
  ['team', '↓ 30%', 'Repeated requests', 'Tally requests that staff need to clarify more than once.'],
  ['clock', '↓ 25%', 'Time to understand a request', 'Compare the median minutes from a request to staff understanding it.'],
  ['heart', '↑ 50%', 'Family satisfaction', 'Ask the same brief feedback question before and after the pilot.'],
];
const uses = ['Long-term care and skilled nursing homes', 'Memory care and dementia units', 'Post-acute and rehabilitation centers', 'Assisted living communities', 'Speech and cognitive therapy support'];
const kit = '/nursing-home-sales-kit.pdf', demo = '#view=demo&amp;product=stroke&amp;setting=nursing-home';
const title = (symbol, text) => `<h3>${icon(symbol)}${e(text)}</h3>`;
const list = entries => `<ul class="cc-checklist">${entries.map(([name, description]) => `<li>${icon('check')}<span>${description ? `<strong>${e(name)}.</strong> ${e(description)}` : e(name)}</span></li>`).join('')}</ul>`;
const rows = entries => `<ul class="cc-rows">${entries.map(([symbol, name, detail]) => `<li>${icon(symbol)}<div><strong>${e(name)}</strong><span>${e(detail)}</span></div></li>`).join('')}</ul>`;
const card = (symbol, name, body) => `<article class="cc-card">${title(symbol, name)}${body}</article>`;
const metricList = () => `<ul class="cc-metrics">${metrics.map(([symbol, pct, name]) => `<li>${icon(symbol)}<div><b>${pct}</b><span>${e(name)}</span></div></li>`).join('')}</ul>`;
const benefitTiles = () => `<div class="cc-benefits">${benefits.map(([symbol, name, detail]) => `<article class="cc-card">${icon(symbol)}<h4>${e(name)}</h4><p>${e(detail)}</p></article>`).join('')}</div>`;
const pilotButton = label => `<button type="button" class="cc-action cc-primary" data-cc-start>${icon('play')}${label}</button>`;
const kitLink = `<a class="cc-action" href="${kit}" download>${icon('download')}Download Sales Kit</a>`;
const demoLink = `<a class="cc-action" href="/book?type=demo" target="_blank" rel="noopener">${icon('calendar')}Schedule a Demo</a>`;

function overview() {
  return `<div class="cc-lead-grid"><div class="cc-left-stack"><article class="cc-card cc-opportunity">${title('target', 'The Opportunity')}
    <p>Nursing homes need simple, reliable ways for residents to communicate, stay engaged and take part in decisions about their care.</p></article>${benefitTiles()}</div>
    ${card('megaphone', 'Your Key Selling Points', list(selling))}</div>
    <div class="cc-detail-grid">${card('layers', 'Core Features for Nursing Homes', rows(features))}
    ${card('chart', 'Outcomes & ROI', '<p class="cc-target-note">Illustrative pilot targets</p>' + metricList())}
    <div class="cc-right-stack">${card('bed', 'Ideal Use Cases', list(uses.map(use => [use])))}
    <figure class="cc-hands">${icon('heart')}<figcaption>More Than a Tool —<br>A Better Quality of Life</figcaption></figure></div></div>`;
}
function topics() {
  return {
    why: overview(),
    benefits: `<div class="cc-topic-grid">${card('star', 'Benefits for Residents and Staff', rows(benefits))}
      ${card('speech', 'Discovery Questions', list([
        ['Resident choice', 'Which everyday requests are hardest to express?'],
        ['Staff handoffs', 'How does a new caregiver learn a resident’s preferred way to communicate?'],
        ['Family involvement', 'Who can help the team identify meaningful words or activities?'],
      ]))}</div>`,
    features: `<div class="cc-topic-grid">${card('layers', 'What to Demonstrate', rows(features))}
      ${card('tablet', 'Nursing-Home Walkthrough', '<ol class="cc-steps"><li>Open the comfort board and ask the resident what they need.</li><li>Try Yes, No and Please wait to give the resident control.</li><li>Choose Call my family and save it as a familiar phrase.</li></ol><a class="cc-action" href="' + demo + '">' + icon('play') + 'Open walkthrough</a>')}</div>`,
    compliance: `<div class="cc-topic-grid">${card('shield', 'Plan for Accessible Communication', list([
        ['Start with the resident', 'Ask which communication aid or approach works for them.'],
        ['Check the setting', 'Review device placement, cleaning, charging and staff training with the facility.'],
        ['Document the plan', 'Agree who will record preferences and review them across shifts.'],
      ]))}
      ${card('folder', 'Resources for the Facility', '<p>Review the facility’s obligations and practices with its accessibility lead.</p><ul class="cc-resource-links"><li><a href="https://www.ada.gov/resources/effective-communication/" target="_blank" rel="noopener">ADA guidance on effective communication ↗</a></li><li><a href="https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-483/subpart-B/section-483.10" target="_blank" rel="noopener">Federal nursing-facility resident rights ↗</a></li></ul>')}</div>`,
    roi: `<div class="cc-topic-grid">${card('chart', 'Illustrative Pilot Targets', '<p>Choose a target with the facility and compare it with its own baseline.</p>' + metricList())}
      ${card('clock', 'How to Measure the Pilot', rows(metrics.map(([symbol, , label, detail]) => [symbol, label, detail])))}</div>`,
    materials: `<div class="cc-topic-grid">${card('folder', 'Nursing-Home Sales Kit', '<p>A printable campaign overview, discovery guide and pilot worksheet for a conversation with a facility.</p>' + kitLink)}
      ${card('tablet', 'Live Demo Materials', '<p>Rehearse a resident communication scenario or schedule time with a sales rep.</p><div class="cc-actions"><a class="cc-action" href="' + demo + '">' + icon('play') + 'Open walkthrough</a>' + demoLink + '</div>')}</div>`,
  };
}
function pilotDialog() {
  return `<dialog class="cc-dialog" data-cc-dialog aria-labelledby="cc-pilot-title">
    <div class="cc-dialog-head"><h2 id="cc-pilot-title">Start a nursing-home pilot</h2><button type="button" class="cc-close" data-cc-close aria-label="Close pilot form">×</button></div>
    <form data-cc-pilot class="sales-form">
      <label>Facility<select name="office" required></select></label>
      <fieldset data-cc-new hidden disabled><legend>New facility</legend><label>Facility name<input name="name" maxlength="180" required></label>
        <label>Street address<input name="address" maxlength="300" required></label><div class="cc-fields"><label>City<input name="city" maxlength="100" required></label>
        <label>State<select name="state" data-states required></select></label></div></fieldset>
      <div class="cc-fields"><label>Unit or team<input name="unit" maxlength="120" required placeholder="Memory care"></label><label>Target start date<input name="start" type="date" required></label></div>
      <label>Pilot coordinator<input name="coordinator" maxlength="140" placeholder="Staff name or role" required></label>
      <label>What will the team measure?<textarea name="goal" rows="2" maxlength="500" placeholder="For example, how often residents make a choice at lunch" required></textarea></label>
      <button class="cc-action cc-primary" type="submit">Save pilot to facility</button>
    </form><p data-cc-pilot-status role="status" aria-live="polite"></p><button type="button" class="cc-action" data-cc-open-office hidden>Open facility record</button>
  </dialog>`;
}
export function renderCareCampaign(outreach) {
  const content = topics();
  return `<section data-tab-panel="campaigns" data-care-campaign hidden aria-labelledby="cc-title"><div class="cc-shell">
    <section class="cc-search-results cc-card" data-cc-search-results aria-label="Campaign search results" hidden></section>
    <header class="cc-hero"><img src="/sales-campaign-care.webp" alt="A resident and a nurse use a communication tablet together." decoding="async">
      <div class="cc-hero-copy"><div class="cc-wordmark"><span aria-hidden="true">🚂</span> TinkyTown<sup>™</sup></div>
      <h1 id="cc-title">Accessible Communication for Nursing Homes</h1><p>Give every resident a voice and help care teams understand what matters to them.</p></div>
      <ul class="cc-hero-list">${['Resident communication', 'Staff efficiency', 'Accessibility support', 'Family engagement', 'Person-centered care'].map(v => `<li>${icon('check')}${v}</li>`).join('')}</ul></header>
    <div class="cc-tabs" role="tablist" aria-label="Nursing-home campaign topics">${tabs.map(([id,label,symbol], i) => `<button type="button" role="tab" id="cc-tab-${id}" aria-controls="cc-topic-${id}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" data-cc-tab="${id}">${icon(symbol)}${e(label)}</button>`).join('')}</div>
    ${tabs.map(([id]) => `<div id="cc-topic-${id}" class="cc-topic" role="tabpanel" aria-labelledby="cc-tab-${id}" tabindex="0"${id === 'why' ? '' : ' hidden'}>${content[id]}</div>`).join('')}
    <section class="cc-banner">${icon('bed')}<div><h2>Ready to Bring TinkyTown to Your Nursing Home?</h2><p>Choose a next step with your facility.</p></div>
    <div class="cc-actions">${pilotButton('Start a Pilot')}${demoLink}${kitLink}</div></section>
    <details class="cc-outreach" data-owner-only hidden><summary>Manage outreach campaigns</summary>${outreach}</details>
    ${pilotDialog()}</div></section>`;
}
