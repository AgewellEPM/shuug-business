const visionPoints = [
  'Communication access', 'Senior and stroke support', 'Across abilities', 'Open and accessible', 'Inclusive communities',
];
const tracks = [
  ['People', 'Communication support across ages, abilities, and stages of life.'],
  ['Places', 'Schools, libraries, town halls, nursing homes, hospitals, and rehabilitation centers.'],
  ['Tools', 'TinkySpeak boards, QR access points, and tools for care teams.'],
  ['Access', 'Picture choices, spoken messages, and accessible ways to select a tile.'],
  ['Partnerships', 'Work with facility staff and local organizations to bring access to more places.'],
];

export function renderMission(icon) {
  const title = (id, heading, symbol) => `<h2 id="mission-${id}" tabindex="-1">${icon(symbol)}${heading}</h2>`;
  const list = values => `<ul class="mission-checklist">${values.map(value => `<li>${value}</li>`).join('')}</ul>`;
  const actions = [
    ['chat', 'Try a communication board', '#view=demo'],
    ['nursing', 'Explore senior care', '#view=demo&venue=nursing-home'],
    ['territories', 'Find facilities', '#view=facilities'],
    ['training', 'Learn to lead a demo', '#view=training-demo'],
  ];
  return `<section class="sdr-mission" data-tab-panel="mission" hidden aria-labelledby="sales-mission-title">
    <form class="mission-search" data-mission-search role="search" aria-label="Mission page">
      ${icon('discover')}
      <input type="search" name="query" maxlength="150" placeholder="Search the mission, accessibility, senior care, or stroke…" aria-label="Search the mission page">
      <button type="button" class="mission-clear" hidden>Clear</button>
    </form>
    <div class="mission-card mission-search-results" data-mission-results hidden>
      <p role="status" data-mission-result-status></p>
      <ul data-mission-result-links></ul>
    </div>

    <header class="mission-hero">
      <div class="mission-hero-copy">
        <p class="mission-brand"><span aria-hidden="true">🚂</span> TinkyTown™</p>
        <h1 id="sales-mission-title">Our Mission</h1>
        <p class="mission-hero-line">Laying the tracks for a world where everyone can communicate.</p>
        <p>Bring picture-based communication to the places people live, learn, receive care, and take part in their communities.</p>
        <button type="button" class="mission-button mission-button-primary mission-talk" data-sdr-talk aria-haspopup="dialog" aria-controls="coach-popup" hidden>${icon('microphone')} Talk to Tinky</button>
      </div>
    </header>
    <ul class="mission-principles" aria-label="Mission priorities">
      ${visionPoints.map(point => `<li>${icon('check')}${point}</li>`).join('')}
    </ul>

    <div class="mission-row mission-intro">
      <section class="mission-card mission-vision" data-mission-topic="vision" aria-labelledby="mission-vision">
        ${title('vision', 'The Vision', 'territories')}
        <p>Picture a world where everyone can ask for help, make a choice, and join a conversation, from classrooms and community spaces to homes, nursing facilities, and hospitals.</p>
      </section>
      <section class="mission-card" data-mission-topic="train" aria-labelledby="mission-train">
        ${title('train', 'The Train We’re Building', 'mission')}
        ${list([
          'Picture and phrase boards for people who use little or no speech.',
          'Communication support for seniors and people living with aphasia after a stroke.',
          'TinkySpeak tools, QR access points, and community partners.',
        ])}
      </section>
    </div>

    <div class="mission-row">
      <section class="mission-card mission-tinkyspeak" data-mission-topic="tinkyspeak" aria-labelledby="mission-tinkyspeak">
        ${title('tinkyspeak', 'TinkySpeak™', 'chat')}
        <p class="mission-subtitle">Picture-based communication across abilities</p>
        <p>Use symbols and phrases to express a message in classrooms, care settings, and daily life.</p>
        <a class="mission-link" href="#view=products">Explore TinkySpeak ${icon('arrow')}</a>
        <img src="/sales-products-tablet.webp" width="750" height="493" loading="lazy" decoding="async" alt="">
      </section>
      <section class="mission-card mission-angelcare" data-mission-topic="angelcare" aria-labelledby="mission-angelcare">
        ${title('angelcare', 'AngelCare™', 'nursing')}
        <p class="mission-subtitle">Our senior and stroke care focus</p>
        <p>Help people express comfort needs, ask questions, and participate in everyday care conversations.</p>
        <a class="mission-link" href="#view=demo&amp;product=stroke&amp;setting=nursing-home">Try the TinkyStroke demo ${icon('arrow')}</a>
      </section>
    </div>

    <div class="mission-row mission-practice">
      <section class="mission-card" data-mission-topic="action" aria-labelledby="mission-action">
        ${title('action', 'Our Mission in Action', 'check')}
        <ul class="mission-action-grid">${actions.map(([symbol, label, href]) => `<li><a href="${href}">${icon(symbol)}<span>${label}</span></a></li>`).join('')}</ul>
      </section>
      <section class="mission-card" data-mission-topic="tracks" aria-labelledby="mission-tracks">
        ${title('tracks', 'The Tracks We’re Laying', 'products')}
        <dl class="mission-tracks">${tracks.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl>
      </section>
    </div>

    <div class="mission-row mission-practice">
      <section class="mission-card" data-mission-topic="impact" aria-labelledby="mission-impact">
        ${title('impact', 'What Access Looks Like', 'team')}
        <div class="mission-impact">
          <img src="/sales-campaign-care.webp" loading="lazy" decoding="async" alt="">
          ${list(['Ask for water or help at the bedside.', 'Tell staff where something hurts.', 'Take part in a conversation without relying on speech.'])}
        </div>
      </section>
      <section class="mission-card mission-destination" data-mission-topic="destination" aria-labelledby="mission-destination">
        ${title('destination', 'Our Long-Term Destination', 'mission')}
        <p>Communication access as part of everyday life. A person should be able to be heard and understood wherever they receive care, learn, work, or ask for a public service.</p>
        <a class="mission-link" href="https://tinkytown.com/mission.html">Read the TinkyTown mission ${icon('arrow')}</a>
      </section>
    </div>

    <footer class="mission-card mission-footer">
      <div>
        ${title('journey', 'Join the Journey', 'mission')}
        <p>See how a communication board fits a real setting or talk with the team about bringing access to yours.</p>
      </div>
      <div class="mission-footer-actions">
        <a class="mission-button mission-button-primary" href="#view=demo">${icon('demo')} Explore the demos</a>
        <a class="mission-button" href="/book?type=demo" target="_blank" rel="noopener noreferrer">${icon('calendar')} Partner with TinkyTown</a>
      </div>
    </footer>
  </section>`;
}
