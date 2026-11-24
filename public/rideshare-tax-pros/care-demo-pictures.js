// Original illustrations. Row order matches the two local WebP sheets.
(() => {
  'use strict';

  const sheets = {
    care: [
      'yes no nurse water', 'bathroom meal pain bed', 'help listen speech clock', 'unsure choices wait care',
      'head neck chest back', 'knee leg arm elbow', 'eye ear tooth hand', 'hot cold juice coffee',
      'rested hard-night interrupted-sleep awake', 'early tired bedpan straw',
      'sit-up pillow turn-over blood-pressure', 'swallow sick home repeat',
    ],
    places: [
      'language luggage hotel medicine', 'cash wallet parcel letter', 'groceries fish meat id', 'directions school phone emergency',
      'thanks sleep scared sad', 'happy angry family glasses', 'walk wheelchair blanket tea', 'soup apple bread milk',
    ],
  };
  const positions = new Map();
  for (const [sheet, rows] of Object.entries(sheets)) {
    rows.forEach((row, y) => row.split(' ').forEach((name, x) => positions.set(name, { sheet, x, y })));
  }

  // Use the visitor's original words before a board's symbolic hint. A hint is often
  // reused on an entire set of possible replies and can imply the wrong answer.
  const meanings = [
    ['rested', /\b(slept (?:very |really )?(?:well|great)|good night.s (?:rest|sleep)|well rested|i feel rested)\b/],
    ['hard-night', /\b((?:hard|rough|bad|restless|awful) night|poor sleep|slept (?:poorly|badly))\b/],
    ['interrupted-sleep', /\b(on and off|woke up (?:a lot|often)|kept waking|in and out of sleep)\b/],
    ['awake', /\b((?:didn.t|couldn.t|can.t|did not|could not|cannot) sleep|trouble sleeping|up all night|wide awake)\b/],
    ['early', /\b(woke up early|up early|early (?:wake|start))\b/],
    ['tired', /\b(tired|exhausted|weary|sleepy)\b/],
    ['sleep', /\b(nap|sleep|asleep)\b/],
    ['bedpan', /\bbedpan\b/], ['straw', /\bstraw\b/], ['pillow', /\bpillows?\b/],
    ['sit-up', /\b(sit (?:me )?up|raise (?:the|my) bed|prop me up)\b/],
    ['turn-over', /\b(turn (?:me )?over|onto my side|change (?:my )?position)\b/],
    ['blood-pressure', /\b(blood pressure|vitals)\b/], ['swallow', /\bswallow(?:ing)?\b/],
    ['sick', /\b(sick|nauseous|nausea|queasy)\b/], ['home', /\b(go home|go back home|back at home|my home)\b/],
    ['repeat', /\b(repeat|say (?:it )?again|say that again|replay)\b/],
    ['happy', /\b(no (?:pain|problem|discomfort|trouble)(?: right now)?|feel better|feeling better|that.s better)\b/],
    ['no', /^(?:(?:i.m |i am )?not (?:hungry|thirsty|ready|really|at all)\b|please stop\b)/],
    ['unsure', /\b(not sure|unsure|don.t know|do not know|uncertain|no idea|maybe|confused|don.t understand|i.m not sure)\b/],
    ['wait', /\b(wait|hold on|pause|a moment|minute|slow down|not yet|not right now|not now|later)\b/],
    ['no', /^(?:no(?:[,!.?]|$| (?:thanks?|thank you|please|i|that|don.t|more)\b)|nope\b|neither\b|stop\b|wrong one\b|decline\b|i (?:disagree|don.t want|refuse)\b|that.s (?:wrong|incorrect)\b)/],
    ['yes', /^(?:yes\b|yep\b|yeah\b|sure\b|i agree\b|absolutely\b|that.s (?:right|correct)\b)/],
    ['emergency', /\b(emergency|911|alarm|urgent help|call for help now)\b/],
    ['nurse', /\b(nurse|nurses|doctor|clinician)\b/],
    ['bathroom', /\b(bathroom|restroom|toilet|washroom|pee|poop|commode)\b/],
    ['family', /\b(family|mother|father|sister|brother|daughter|son|spouse|grandchildren|wife|husband)\b/],
    ['blanket', /\b(blankets?|comforter)\b/],
    ['wheelchair', /\b(wheelchair|accessibility|accessible|mobility aid|disability|ada accommodation)\b/],
    ['walk', /\b(walk|walking|cane|walker|shoes)\b/],
    ['glasses', /\b(glasses|reading glasses|eyeglasses)\b/],
    ['medicine', /\b(medicine|medication|meds|pills?|tablets?|prescriptions?|pharmacy|refill|rx|vaccine)\b/],
    ['milk', /\bmilk\b/], ['tea', /\btea\b/], ['coffee', /\bcoffee\b/], ['juice', /\bjuice\b/],
    ['soup', /\bsoup\b/], ['apple', /\bapples?\b/], ['bread', /\b(bread|loaf|toast|bakery)\b/],
    ['fish', /\b(fish|seafood|salmon|tuna)\b/], ['meat', /\b(meat|beef|steak|butcher)\b/],
    ['meal', /\b(food|eat|eating|meal|hungry|hunger|breakfast|lunch|dinner|snack|restaurant|deli)\b/],
    ['water', /\b(water|thirst|thirsty|drink|drinks|hydration|hydrated)\b/],
    ['head', /\b(headache|my head|head hurts|head pain)\b|^head$/],
    ['neck', /\bneck\b/], ['chest', /\bchest\b/],
    ['back', /\b(lower back|upper back|my back hurts|back pain|my back is sore)\b/],
    ['knee', /\bknees?\b/], ['leg', /\b(legs?|feet|foot|ankles?)\b/],
    ['elbow', /\belbows?\b/], ['arm', /\barms?\b/],
    ['eye', /\beyes?\b/], ['ear', /\bears?\b/], ['tooth', /\b(tooth|teeth|toothache)\b/], ['hand', /\b(my hand|hand hurts|fingers?)\b|^hand$/],
    ['pain', /\b(pain|hurts?|hurting|stomachache|stomach|ache|sore|cramps?)\b/],
    ['hot', /\b(hot|overheated)\b/], ['cold', /\b(cold|chilly|freezing|ice)\b/],
    ['thanks', /\b(thank|thanks|grateful|appreciate)\b/],
    ['scared', /\b(scared|worried|worry|fear|afraid|nervous|anxious|anxiety)\b/],
    ['sad', /\b(sad|lonely|crying|upset|unhappy|tired|exhausted)\b/],
    ['angry', /\b(angry|mad|frustrated)\b/], ['happy', /\b(happy|excited|great|cheerful|feel good)\b/],
    ['bed', /\b(bed|pillow|bedroom|lie down|rest)\b/],
    ['care', /\b(caregiver|carer|counseling|talk to someone|comfort)\b/],
    ['language', /\b(language|interpreter|translate|translation|español|english|asl)\b/],
    ['luggage', /\b(luggage|bags?|baggage|airport|flight|tsa|my gate)\b/],
    ['hotel', /\b(hotel|check.in|check.out|concierge|my room)\b/],
    ['id', /\b(passport|licen[cs]es?|identity|identification|id card|driver.s id)\b/],
    ['wallet', /\b(wallet|debit|credit card|payment card|insurance card)\b/],
    ['cash', /\b(bank|cash|deposit|withdraw|dollars?|money|loan|financial|payment|cost|price|pay)\b/],
    ['parcel', /\b(parcel|package|shipping|ship|tracking)\b/],
    ['letter', /\b(letter|stamps?|postage|envelope|mail|email)\b/],
    ['groceries', /\b(grocery|groceries|shopping|cart|checkout|find an item)\b/],
    ['school', /\b(school|student|books?|bookstore|college|academics|teacher|class)\b/],
    ['phone', /\b(phone|telephone|call|dial)\b/],
    ['directions', /\b(map|directions?|where|navigate|way out|go back|go home|go left|go right)\b/],
    ['choices', /\b(more|choices|options|something else|another option|different choice)\b/],
    ['listen', /\b(listen|replay|repeat|say again|hear it|speak again)\b/],
    ['clock', /\b(time|clock|schedule|appointment|my day)\b/],
    ['help', /\b(help|assist|assistance|support|customer service)\b/],
  ];

  const hints = new Map();
  const addHints = (key, values) => values.split(' ').forEach(value => hints.set(value.replace(/\uFE0F/g, ''), key));
  addHints('yes', '👍 ✅ ✔'); addHints('no', '👎 ❌ 🚫'); addHints('unsure', '🤷 🤔');
  addHints('bathroom', '🚻 🚽'); addHints('water', '💧 🚰 🥤'); addHints('meal', '🍽 🍴');
  addHints('medicine', '💊'); addHints('nurse', '🩺 👩‍⚕️ 👨‍⚕️'); addHints('emergency', '🚨 🆘');
  addHints('phone', '☎️ 📞'); addHints('listen', '🎧 🔊'); addHints('clock', '⏰ 🕒');
  addHints('coffee', '☕'); addHints('milk', '🥛'); addHints('bread', '🍞 🥖'); addHints('sleep', '😴 💤');
  addHints('sad', '😢 😞'); addHints('scared', '😟 😨'); addHints('angry', '😡 😠');
  addHints('help', '🫱 🤝'); addHints('directions', '🧭 🔙'); addHints('choices', '🔄');
  addHints('cash', '💵 💰'); addHints('wallet', '💳'); addHints('id', '🪪'); addHints('luggage', '🧳');
  addHints('letter', '✉️ 📮'); addHints('parcel', '📦'); addHints('school', '📚 🎓'); addHints('language', '🌐');
  addHints('cold', '🧊 🥶'); addHints('hot', '🥵'); addHints('wheelchair', '♿ 🦽'); addHints('bed', '🛏');

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^[^\p{L}\p{N}]+|[\s›»→]+$/gu, '').trim();
  }

  function identify(tile) {
    if (typeof tile === 'string') tile = { label: tile };
    if (!tile) return 'speech';
    const label = normalize(tile.label);
    const phrase = normalize(tile.spokenText || tile.say || tile.sentence);
    if (label === 'back' && /\bmy back\b/.test(phrase)) return 'back';
    if (tile.action === 'back' || tile.action === 'go_back') return 'directions';
    if (tile.action === 'more_choices') return 'choices';
    if (label === 'no safe place tonight' || label === 'a friend is in crisis') return 'help';
    for (const words of [label, phrase]) {
      const match = meanings.find(([, pattern]) => pattern.test(words));
      if (match) return match[0];
    }
    return hints.get(String(tile.emoji || tile.icon || '').replace(/\uFE0F/g, '')) || 'speech';
  }

  function create(tile) {
    const name = identify(tile);
    const { sheet, x, y } = positions.get(name);
    const picture = document.createElement('span');
    picture.className = 'care-demo-picture';
    picture.setAttribute('aria-hidden', 'true');
    picture.dataset.picture = name;
    picture.dataset.sheet = sheet;
    picture.dataset.column = x;
    picture.dataset.row = y;
    return picture;
  }

  window.CareDemoPictures = { create, identify };
})();
