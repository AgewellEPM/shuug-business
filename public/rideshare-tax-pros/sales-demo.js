(() => {
  'use strict';

  const panel = document.querySelector('[data-tab-panel="demo"]');
  if (!panel) return;
  const workspace = document.getElementById('sales-workspace');
  const find = part => panel.querySelector(`[data-demo-${part}]`);
  const grid = find('tiles');
  const productButtons = [...panel.querySelectorAll('[data-demo-product]')];
  const scenarios = {
    stroke: [
      { id: 'nursing-home', label: 'Nursing home', speaker: 'Care team member', steps: [
        { board: 'basic_needs', prompt: 'What would make you more comfortable?',
          instruction: 'Try Blanket to hear the resident ask for what they want.',
          independence: 'Ask for water, a blanket, or help getting comfortable.' },
        { board: 'stroke_answers', prompt: 'Would you like help sitting up now?',
          instruction: 'Choose Yes, No, or Please wait. Let the resident set the pace.',
          independence: 'Say yes, say no, or ask for more time.' },
        { board: 'stroke_fears_feelings', prompt: 'Is there anything else you’d like to tell me?',
          instruction: 'Try Call my family. Use Save phrase to keep it on the Saved phrases board for this session.',
          independence: 'Ask to speak with someone or share how they feel.' },
      ] },
      { id: 'hospital-ward', label: 'Hospital ward', speaker: 'Nurse', steps: [
        { board: 'quick_staff', prompt: 'What do you need right now?',
          instruction: 'Try Nurse or Question to hear a patient start the conversation.',
          independence: 'Ask for the right person or raise a question about their care.' },
        { board: 'pain_body_board', prompt: 'Can you show me where it hurts?',
          instruction: 'Choose a body area. The selected location appears in Conversation this session.',
          independence: 'Point to where it hurts and put that choice into words.' },
        { board: 'stroke_pain_scale', prompt: 'How strong is the pain, from zero to ten?',
          instruction: 'Choose a number. Open Conversation this session to see the location and rating together.',
          independence: 'Report their own pain level for the care team to hear.' },
      ] },
      { id: 'rehab', label: 'Rehab', speaker: 'Therapist', steps: [
        { board: 'stroke_mobility_recovery', prompt: 'How do you feel about standing today?',
          instruction: 'Try Scared to stand to hear how a patient can raise a concern.',
          independence: 'Say how movement feels before deciding what to try.' },
        { board: 'basic_needs', prompt: 'When you’re ready, let me know how I can help.',
          instruction: 'Try Sit up. You can open Quick answers to ask for more time.',
          independence: 'Ask for the kind of assistance they want.' },
        { board: 'stroke_mobility_recovery', prompt: 'Do you have a question about therapy?',
          instruction: 'Try When therapy? to let the patient ask about their own schedule.',
          independence: 'Ask what comes next and take part in the conversation.' },
      ] },
    ],
    hospital: [
      { id: 'reception', label: 'Hospital reception', speaker: 'Front desk', steps: [
        { board: 'hospital_reception', prompt: () => catalog.hospitalWelcome,
          instruction: 'A visitor opens this board on the kiosk or through the location’s QR code. Try I am in pain to open Pain assessment.',
          independence: 'Tell the front desk why they’re there by choosing a phrase.' },
        { board: 'hospital_pain', prompt: 'Can you show me how much it hurts and where?',
          instruction: 'Choose a pain level and a location. Each tile speaks its own message.',
          independence: 'Describe the pain in their own choices, one detail at a time.' },
        { board: 'hospital_reception', prompt: 'Is there anything you need while you wait?',
          instruction: 'Try Water or Bathroom to make a request at the counter.',
          independence: 'Ask for what they need at reception.' },
      ] },
    ],
  };
  const describeLanguage = new Intl.DisplayNames(['en'], { type: 'language' });
  const defaultMessage = 'Choose a tile to say something.';
  const state = { product: 'stroke', setting: scenarios.stroke[0], step: 0 };
  let catalog, loading, speechRun = 0, scanTimer, scanIndex = -1, dwellTimer, dwellTile;

  const guide = panel.querySelector('[data-care-guide]');
  const visible = () => !panel.hidden && !workspace.hidden && !guide.hidden;
  const text = (part, value) => { find(part).textContent = value; };
  const step = () => state.setting.steps[state.step];
  const boards = () => state.saved.length
    ? [...catalog[state.product], { id: 'saved_phrases', title: 'Saved phrases', tiles: state.saved }]
    : catalog[state.product];
  const currentBoard = () => boards().find(board => board.id === state.board);
  const messageOf = tile => {
    const language = tile.lang || (tile.spokenTexts?.[state.language] ? state.language : 'en');
    return { label: tile.labels?.[state.language] || tile.label, text: tile.spokenTexts?.[language] || tile.spokenText, language };
  };

  function stopSpeech() {
    speechRun++;
    window.speechSynthesis?.cancel();
  }

  function speak(message) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      text('feedback', 'Voice unavailable. The message is on screen.');
      return;
    }
    stopSpeech();
    const run = speechRun;
    const phrase = new SpeechSynthesisUtterance(message.text);
    phrase.lang = message.language === 'en' ? 'en-US' : message.language;
    phrase.rate = 0.9;
    const voice = speechSynthesis.getVoices().find(item => item.localService && item.lang.toLowerCase().split('-')[0] === message.language);
    if (voice) phrase.voice = voice;
    const feedback = value => { if (run === speechRun) text('feedback', value); };
    phrase.onstart = () => feedback('Speaking…');
    phrase.onend = () => feedback('Spoken.');
    phrase.onerror = () => feedback('Voice unavailable. The message is on screen.');
    try { speechSynthesis.speak(phrase); }
    catch { feedback('Voice unavailable. The message is on screen.'); }
  }

  function clearDwell() {
    clearTimeout(dwellTimer);
    dwellTile?.removeAttribute('data-dwelling');
    dwellTile = null;
  }

  function advanceScan() {
    if (!grid.children.length) return;
    grid.querySelector('[data-scanning]')?.removeAttribute('data-scanning');
    scanIndex = (scanIndex + 1) % grid.children.length;
    const tile = grid.children[scanIndex];
    tile.dataset.scanning = 'true';
    if (grid.contains(document.activeElement)) tile.scrollIntoView?.({ block: 'nearest' });
  }

  function setScan(active) {
    clearInterval(scanTimer);
    scanTimer = null;
    scanIndex = -1;
    grid.querySelector('[data-scanning]')?.removeAttribute('data-scanning');
    const button = find('scan');
    button.setAttribute('aria-pressed', active);
    button.textContent = active ? 'Stop switch scan' : 'Start switch scan';
    find('scan-help').hidden = !active;
    if (active) {
      clearDwell();
      grid.setAttribute('aria-describedby', 'sales-demo-scan-help');
      grid.focus();
      advanceScan();
      scanTimer = setInterval(advanceScan, 1500);
    } else grid.removeAttribute('aria-describedby');
  }

  function renderMessage() {
    text('message', state.message?.text || defaultMessage);
    find('message').lang = state.message?.language || 'en';
    find('speak').disabled = !state.message;
    find('save').hidden = state.product !== 'stroke';
    find('save').disabled = !state.message || state.saved.some(tile => tile.spokenText === state.message.text && tile.lang === state.message.language);
  }

  function renderNotes() {
    find('empty').hidden = state.history.length > 0;
    find('history').replaceChildren(...state.history.map(message => {
      const item = document.createElement('li');
      item.lang = message.language;
      item.textContent = message.text;
      return item;
    }));
    const pain = [state.pain.location, state.pain.level == null ? '' : `${state.pain.level}/10`].filter(Boolean).join(' · ');
    find('pain').hidden = !pain;
    text('pain', pain ? `Pain reported in this demo: ${pain}` : '');
  }

  function renderGuide() {
    const current = step();
    text('setting', state.setting.label);
    text('speaker', state.setting.speaker);
    text('progress', state.completed ? 'Complete' : `${state.step + 1} of ${state.setting.steps.length}`);
    text('prompt', typeof current.prompt === 'function' ? current.prompt() : current.prompt);
    text('instruction', state.completed ? 'Choose another setting or restart this walkthrough to try different messages.' : current.instruction);
    text('independence', current.independence);
    text('next', state.completed ? 'Start over' : state.step === state.setting.steps.length - 1 ? 'Finish' : 'Next prompt');
    find('prev').disabled = state.step === 0;
    find('native').hidden = state.product !== 'stroke';
  }

  function renderPicker() {
    const picker = find('board-picker');
    picker.replaceChildren(...boards().map(board => new Option(board.title, board.id)));
    picker.value = state.board;
  }

  function renderBoard() {
    clearDwell();
    const board = currentBoard();
    const languages = [...new Set(['en', ...board.tiles.flatMap(tile => Object.keys(tile.spokenTexts || {}))])].sort();
    if (!languages.includes(state.language)) state.language = 'en';
    const language = find('language');
    find('language-field').hidden = languages.length < 2;
    language.replaceChildren(...languages.map(code => new Option(describeLanguage.of(code), code)));
    language.value = state.language;
    find('board-picker').value = board.id;
    find('back').hidden = !state.trail.length;
    text('board-title', board.title);
    text('board-subtitle', state.product === 'stroke' ? 'TinkyStroke communication board' : 'TinkyTown Hospital kiosk');

    grid.replaceChildren(...board.tiles.map(tile => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sdr-demo-tile';
      const color = tile.colorHex || tile.color;
      if (/^#[a-f\d]{6}$/i.test(color)) button.style.setProperty('--demo-tile-color', color);
      const picture = window.CareDemoResponses.illustration(button, tile);
      const label = document.createElement('span');
      const message = messageOf(tile);
      label.textContent = message.label;
      label.lang = message.language;
      if (tile.navigateTo === 'hospital_pain') button.setAttribute('aria-label', `${message.label}. Opens Pain assessment`);
      button.append(picture, label);
      button.addEventListener('click', () => choose(tile, button));
      button.addEventListener('pointerenter', event => {
        if (!find('dwell').checked || scanTimer || event.pointerType === 'touch') return;
        clearDwell();
        dwellTile = button;
        button.dataset.dwelling = 'true';
        dwellTimer = setTimeout(() => { if (visible()) button.click(); }, 1350);
      });
      button.addEventListener('pointerleave', clearDwell);
      return button;
    }));
    scanIndex = -1;
    if (scanTimer) advanceScan();
  }

  function showBoard(board, { drill = false, back = false, focus = false } = {}) {
    if (drill) state.trail.push(state.board);
    else if (!back) state.trail = [];
    state.board = board;
    renderBoard();
    if (focus || scanTimer) grid.focus({ preventScroll: true });
  }

  function choose(tile, button) {
    clearDwell();
    if (['main_board', 'action_board'].includes(tile.navigateTo)) {
      showBoard('basic_needs', { focus: true });
      return;
    }
    const message = messageOf(tile);
    if (message.text) {
      if (state.product === 'stroke') panel.dispatchEvent(new CustomEvent('care:stroke-message', {detail: message.text}));
      state.message = { ...message, emoji: tile.emoji, colorHex: tile.colorHex };
      state.history = [...state.history.slice(-19), message];
      if (state.board === 'pain_body_board') state.pain.location = tile.label;
      if (tile.level != null) state.pain.level = tile.level;
      grid.querySelector('[data-selected]')?.removeAttribute('data-selected');
      button.dataset.selected = 'true';
      renderMessage();
      renderNotes();
      if (find('auto').checked) speak(message);
      else { stopSpeech(); text('feedback', ''); }
    }
    if (tile.navigateTo === 'hospital_pain') showBoard(tile.navigateTo, { drill: true, focus: true });
  }

  function setStep(index) {
    stopSpeech();
    text('feedback', '');
    state.step = index;
    state.completed = false;
    showBoard(step().board);
    renderGuide();
  }

  function start(product, settingId) {
    const available = scenarios[product];
    const setting = available.find(item => item.id === settingId) || available[0];
    setScan(false);
    Object.assign(state, { product, setting, history: [], saved: [], pain: {}, message: null, language: 'en', board: setting.steps[0].board });
    productButtons.forEach(button => button.setAttribute('aria-pressed', button.dataset.demoProduct === product));
    const chooser = find('scenarios');
    chooser.hidden = available.length === 1;
    chooser.replaceChildren(...available.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button';
      button.textContent = item.label;
      button.dataset.setting = item.id;
      button.setAttribute('aria-pressed', item === setting);
      return button;
    }));
    find('notes').open = false;
    renderPicker();
    renderMessage();
    renderNotes();
    setStep(0);
  }

  function requested() {
    const args = new URLSearchParams(location.hash.slice(1));
    const product = args.get('product');
    return { product: Object.hasOwn(scenarios, product) ? product : 'stroke', setting: args.get('setting') };
  }

  async function load() {
    if (catalog || loading) return;
    loading = true;
    find('retry').hidden = true;
    text('loading', 'Loading communication boards…');
    try {
      const response = await fetch('/sales-demo-boards.json');
      if (!response.ok) throw new Error('Board file unavailable');
      catalog = await response.json();
      const { product, setting } = requested();
      start(product, setting);
      find('loading').hidden = true;
      find('session').hidden = false;
    } catch {
      catalog = null;
      text('loading', 'The communication boards could not load.');
      find('retry').hidden = false;
    } finally { loading = false; }
  }

  productButtons.forEach(button => button.addEventListener('click', () => {
    if (catalog && button.dataset.demoProduct !== state.product) start(button.dataset.demoProduct);
  }));
  find('scenarios').addEventListener('click', event => {
    const button = event.target.closest('[data-setting]');
    if (button && button.dataset.setting !== state.setting.id) {
      start(state.product, button.dataset.setting);
      find('scenarios').querySelector('[aria-pressed="true"]').focus();
    }
  });
  find('reset').addEventListener('click', () => start(state.product, state.setting.id));
  find('retry').addEventListener('click', load);
  find('prev').addEventListener('click', () => setStep(state.step - 1));
  find('next').addEventListener('click', () => {
    if (state.completed) start(state.product, state.setting.id);
    else if (state.step + 1 < state.setting.steps.length) setStep(state.step + 1);
    else { state.completed = true; renderGuide(); }
  });
  find('board-picker').addEventListener('change', event => showBoard(event.target.value));
  find('language').addEventListener('change', event => { state.language = event.target.value; renderBoard(); });
  find('back').addEventListener('click', () => showBoard(state.trail.pop(), { back: true, focus: true }));
  find('large').addEventListener('change', event => { grid.dataset.large = event.target.checked; });
  find('dwell').addEventListener('change', clearDwell);
  find('speak').addEventListener('click', () => { if (state.message) speak(state.message); });
  find('save').addEventListener('click', () => {
    const { label, text: spokenText, language: lang, emoji, colorHex } = state.message;
    state.saved.push({ label, spokenText, lang, emoji, colorHex });
    renderPicker();
    renderMessage();
    text('feedback', 'Saved to the Saved phrases board.');
  });
  find('scan').addEventListener('click', () => setScan(!scanTimer));
  grid.addEventListener('keydown', event => {
    if (!scanTimer || event.repeat) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setScan(false);
      find('scan').focus();
    } else if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      grid.children[scanIndex]?.click();
    }
  });

  const observe = new MutationObserver(() => {
    if (visible()) load();
    else { setScan(false); clearDwell(); if (state.message) stopSpeech(); }
  });
  for (const element of [panel, workspace, guide]) observe.observe(element, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('hashchange', () => {
    if (!catalog) return;
    const args = new URLSearchParams(location.hash.slice(1));
    if (args.get('view') !== 'demo' || (!args.has('product') && !args.has('setting'))) return;
    const { product, setting } = requested();
    if (product !== state.product || (setting && setting !== state.setting.id)) start(product, setting);
  });
  if (visible()) load();
})();
