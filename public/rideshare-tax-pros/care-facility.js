/* TinkyTown facility rooms. The catalog is drawn from the TinkySpeak clinical and
   senior packs, TinkyAAC goal-oriented conversations and West Hartford service boards. */
(function () {
  'use strict';
  const assetBase = new URL('.', document.currentScript?.src || new URL('/care-facility.js', location.href));
  const mounts = new WeakMap();
  const languageCodes = { Spanish: 'es', French: 'fr', Portuguese: 'pt', Chinese: 'zh', Arabic: 'ar' };
  let catalogRequest;

  function catalog() {
    if (!catalogRequest) {
      const parts = ['care-facility-data.json', 'care-facility-kiosks.json'];
      catalogRequest = Promise.all(parts.map(async filename => {
        const response = await fetch(new URL(filename, assetBase));
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      })).then(([core, kiosks]) => ({
        facilities: core.facilities, boards: { ...core.boards, ...kiosks }
      })).catch(error => { catalogRequest = undefined; throw error; });
    }
    return catalogRequest;
  }

  function node(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }
  function button(label, handler, className = 'cf-button') {
    const el = node('button', className, label);
    el.type = 'button';
    el.addEventListener('click', handler);
    return el;
  }
  function symbol(icon) {
    const el = node('span', 'cf-symbol', icon);
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  function focusTitle(el) {
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
  }

  function facilityView(host, data, key, directRoom) {
    const facility = data.facilities[key] || data.facilities.hospital;
    const sessions = new Map();
    const shell = node('section', 'care-facility');
    shell.setAttribute('aria-label', facility.name + ' communication demo');
    let room;
    let current;
    let filter = '';
    let voice = Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
    let speech;
    let tool = '';
    let number = '';
    let photoUrl = '';
    let sampleDocument = '';

    host.replaceChildren(shell);

    function stopSpeech() {
      if (speech && window.speechSynthesis) window.speechSynthesis.cancel();
      speech = null;
    }
    function releasePhoto() {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = '';
      sampleDocument = '';
    }
    function say(text, lang = 'en-US') {
      if (!text || !voice) return;
      stopSpeech();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.onend = utterance.onerror = () => {
        if (speech === utterance) speech = null;
      };
      speech = utterance;
      window.speechSynthesis.speak(utterance);
    }
    function clearTools() {
      number = '';
      tool = '';
      releasePhoto();
    }
    function log(role, text, lang = 'en-US') {
      current.lines.push({ role, text, lang });
      if (current.lines.length > 80) current.lines.shift();
    }
    function openRoom(nextRoom) {
      clearTools();
      stopSpeech();
      room = nextRoom;
      current = sessions.get(room.id);
      if (!current) {
        current = { root: room.boards[0], active: room.boards[0], trail: [], role: 'speaker', lines: [], last: null, history: false, text: '' };
        sessions.set(room.id, current);
      }
      drawRoom('heading');
    }
    function directory(focus) {
      clearTools();
      stopSpeech();
      room = null;
      current = null;
      shell.replaceChildren();
      const top = node('div', 'cf-heading');
      const titleGroup = node('div');
      const title = node('h3', null, facility.name + ' directory');
      const unit = facility === data.facilities.hospital ? 'departments and services'
        : facility === data.facilities['nursing-home'] ? 'resident and visitor areas' : 'member services and activities';
      titleGroup.append(title, node('p', null, facility.rooms.length + ' ' + unit));
      const input = node('input', 'cf-filter');
      input.type = 'search';
      input.setAttribute('aria-label', 'Find a room or service');
      input.placeholder = 'Find a room or service';
      input.value = filter;
      top.append(titleGroup, input);
      const listing = node('div', 'cf-rooms');
      function list() {
        const words = filter.toLocaleLowerCase().trim().split(/\s+/);
        const rooms = facility.rooms.filter(item => {
          const terms = [item.name, ...item.boards.map(id => data.boards[id].name)].join(' ').toLocaleLowerCase();
          return words.every(word => terms.includes(word));
        });
        listing.replaceChildren();
        for (const item of rooms) {
          const link = button('', () => openRoom(item), 'cf-room-card');
          link.dataset.room = item.id;
          const label = node('span', 'cf-room-label');
          label.append(node('strong', null, item.name), node('small', null, data.boards[item.boards[0]].name));
          const chevron = node('span', 'cf-chevron', '›');
          chevron.setAttribute('aria-hidden', 'true');
          link.append(symbol(item.icon), label, chevron);
          listing.append(link);
        }
        if (!rooms.length) listing.append(node('p', 'cf-empty', 'No matching rooms. Try a department or service name.'));
      }
      input.addEventListener('input', () => { filter = input.value; list(); });
      shell.append(top, listing);
      list();
      if (focus) {
        const previous = Array.from(listing.children).find(item => item.dataset.room === focus);
        if (previous) previous.focus({ preventScroll: true });
        else focusTitle(title);
      }
    }
    function selectBoard(id) {
      current.root = id;
      current.active = id;
      current.trail = [];
      current.role = 'speaker';
      clearTools();
      drawRoom('board');
    }
    function practiceMessage(text, lang = 'en-US') {
      log(current.role, text, lang);
      current.last = { text, lang, role: current.role };
      say(text, lang);
    }
    function selectPhrase(tile) {
      const lang = current.active === 'language' ? languageCodes[tile.label] : 'en-US';
      practiceMessage(tile.say, lang);
      if (tile.next && data.boards[tile.next]) {
        current.trail.push(current.active);
        current.active = tile.next;
        drawRoom('board');
        return;
      }
      // Leave focus on the selected tile so a switch or keyboard user can keep exploring.
      updateMessage();
      refreshHistory();
    }
    function updateMessage() {
      const output = shell.querySelector('.cf-message');
      if (!output) return;
      const last = current.last;
      output.querySelector('small').textContent = last ? facility[last.role] : 'Speech bar';
      output.querySelector('strong').textContent = last ? last.text : 'Choose a tile to speak.';
      output.querySelector('button').disabled = !last || !voice;
    }
    function refreshHistory() {
      const history = shell.querySelector('.cf-history');
      if (!history) return;
      history.querySelector('summary').textContent = 'Conversation (' + current.lines.length + ')';
      const list = history.querySelector('ol');
      list.replaceChildren();
      for (const entry of current.lines) {
        const item = node('li');
        item.append(node('strong', null, facility[entry.role]), document.createTextNode(entry.text));
        list.append(item);
      }
      if (!list.children.length) list.append(node('li', null, 'Messages appear here as you take turns.'));
    }

    function addTile(grid, text, icon, handler, color) {
      const tile = button('', handler, 'cf-tile');
      tile.append(symbol(icon), node('span', null, text));
      if (color && /^#[\da-f]{6}$/i.test(color)) tile.style.setProperty('--tile-ink', color);
      grid.append(tile);
    }
    function roleSelector(parent) {
      const row = node('div', 'cf-switch');
      row.setAttribute('aria-label', 'Choose who is speaking');
      for (const who of ['speaker', 'partner']) {
        const tab = button(facility[who], () => {
          current.role = who;
          current.text = '';
          clearTools();
          drawRoom('role');
        });
        tab.dataset.role = who;
        tab.setAttribute('aria-pressed', String(who === current.role));
        row.append(tab);
      }
      parent.append(row);
    }
    function addEditor(parent) {
      const form = node('form', 'cf-editor');
      const input = node('input');
      input.type = 'text';
      input.maxLength = 360;
      input.autocomplete = 'off';
      input.placeholder = current.role === 'partner' ? 'Type a staff reply' : 'Type your own message';
      input.setAttribute('aria-label', input.placeholder);
      input.value = current.text;
      input.addEventListener('input', () => { current.text = input.value; });
      const send = node('button', 'cf-button', 'Say it');
      send.type = 'submit';
      form.addEventListener('submit', event => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) { input.focus(); return; }
        practiceMessage(value);
        current.text = '';
        input.value = '';
        updateMessage();
        refreshHistory();
        input.focus({ preventScroll: true });
      });
      form.append(input, send);
      parent.append(form);
    }
    function boardPane(section) {
      const board = data.boards[current.active];
      const titleRow = node('div', 'cf-board-title');
      const title = node('h4', 'cf-board-name', current.role === 'partner' ? 'Staff replies' : board.name);
      titleRow.append(title);
      if (current.trail.length && current.role === 'speaker') {
        titleRow.append(button('‹ Previous board', () => {
          current.active = current.trail.pop();
          drawRoom('board');
        }));
      }
      section.append(titleRow);
      const prompt = board.prompt || room.prompt;
      if (current.role === 'speaker') {
        const promptBox = node('div', 'cf-prompt');
        const promptText = node('div');
        promptText.append(node('small', null, facility.partner), node('p', null, prompt));
        const play = button('Read aloud', () => {
          log('partner', prompt);
          say(prompt);
          refreshHistory();
        });
        play.disabled = !voice;
        promptBox.append(promptText, play);
        section.append(promptBox);
      }
      const grid = node('div', 'cf-tiles');
      if (current.role === 'partner') {
        const askRoom = { say: room.prompt, label: room.prompt, icon: '💬' };
        const replies = [askRoom];
        if (board.prompt && board.prompt !== room.prompt) replies.push({ say: board.prompt, label: board.prompt, icon: '📋' });
        for (const [label, icon] of [['Take your time.', '🕰️'], ['Would you like me to repeat that?', '🔁'], ['Is that what you meant?', '❓'], ['What would you like to do next?', '➡️']]) {
          replies.push({ say: label, label, icon });
        }
        for (const reply of replies) addTile(grid, reply.label, reply.icon, () => selectPhrase(reply));
      } else {
        for (const tile of board.tiles) addTile(grid, tile.label, tile.icon, () => selectPhrase(tile), tile.ink);
      }
      section.append(grid);
      if (current.role === 'speaker' && ['meds','pharmacy1','wellness'].includes(current.active)) {
        section.append(node('p', 'cf-note', 'Confirm medication and allergy information with your doctor and pharmacist.'));
      }
      addEditor(section);
    }
    function numbersPane(section) {
      section.append(node('h4', 'cf-board-name', 'Numbers'));
      const readout = node('output', 'cf-number', number || '0');
      readout.setAttribute('aria-label', 'Number to speak');
      const keypad = node('div', 'cf-keypad');
      const submit = button('Say number', () => {
        if (!number) return;
        practiceMessage(number);
        updateMessage();
        refreshHistory();
      });
      submit.disabled = !number;
      for (const digit of ['1','2','3','4','5','6','7','8','9','Clear','0','Delete']) {
        keypad.append(button(digit, () => {
          if (digit === 'Clear') number = '';
          else if (digit === 'Delete') number = number.slice(0,-1);
          else if (number.length < 20) number += digit;
          readout.textContent = number || '0';
          submit.disabled = !number;
        }));
      }
      section.append(readout, keypad, submit);
    }
    function documentsPane(section) {
      section.append(node('h4', 'cf-board-name', 'Show a document'), node('p', 'cf-note', 'Show a sample card or a photo from this device.'));
      const choices = node('div', 'cf-tools');
      const preview = node('div', 'cf-preview');
      function display() {
        preview.replaceChildren();
        if (photoUrl) {
          const img = node('img');
          img.src = photoUrl;
          img.alt = 'Document selected for this demonstration';
          preview.append(img);
        } else if (sampleDocument) {
          const card = node('div', 'cf-sample-card');
          card.append(node('small', null, 'TinkyTown · Demo document'), node('strong', null, sampleDocument), node('span', null, 'Sample visitor · 0001'));
          preview.append(card);
        }
        if (preview.children.length) {
          preview.append(button('Put away', () => { releasePhoto(); display(); }));
        }
      }
      for (const sample of ['Visitor card','Appointment card']) {
        choices.append(button(sample, () => { releasePhoto(); sampleDocument = sample; display(); }));
      }
      const picker = node('label', 'cf-upload');
      picker.append(node('span', null, 'Choose a photo'));
      const file = node('input');
      file.type = 'file';
      file.accept = 'image/*';
      file.setAttribute('aria-label','Choose a photo to show');
      file.addEventListener('change', () => {
        const chosen = file.files && file.files[0];
        releasePhoto();
        if (chosen && /^image\//.test(chosen.type)) {
          photoUrl = URL.createObjectURL(chosen);
        }
        file.value = '';
        display();
      });
      picker.append(file);
      choices.append(picker);
      section.append(choices, preview);
      display();
    }
    function interpreterPane(section) {
      section.append(node('h4', 'cf-board-name', 'Ask for language assistance'));
      const grid = node('div', 'cf-tiles');
      for (const tile of data.boards.language.tiles) {
        addTile(grid, tile.label, tile.icon, () => {
          practiceMessage(tile.say, languageCodes[tile.label] || 'en-US');
          updateMessage(); refreshHistory();
        });
      }
      section.append(grid);
    }
    function drawRoom(focus) {
      shell.replaceChildren();
      const bar = node('div', 'cf-room-bar');
      const back = button('‹ ' + facility.name + ' directory', () => directory(room.id));
      const voiceButton = button(voice ? 'Sound on' : 'Sound off', () => {
        voice = !voice;
        if (!voice) stopSpeech();
        drawRoom('sound');
      });
      voiceButton.dataset.sound = '';
      voiceButton.setAttribute('aria-pressed', String(voice));
      voiceButton.disabled = !(window.speechSynthesis && window.SpeechSynthesisUtterance);
      bar.append(back, voiceButton);
      const head = node('div', 'cf-room-head');
      head.append(symbol(room.icon), node('h3', null, room.name));
      const boards = node('div', 'cf-board-list');
      boards.setAttribute('aria-label', 'Room boards');
      for (const id of room.boards) {
        const b = button(data.boards[id].name, () => selectBoard(id));
        b.setAttribute('aria-pressed', String(id === current.root && !tool));
        b.dataset.board = id;
        boards.append(b);
      }
      const message = node('div', 'cf-message');
      const content = node('div');
      content.setAttribute('role','status');
      content.append(node('small'), node('strong'));
      message.append(content, button('Repeat', () => {
        if (current.last) say(current.last.text, current.last.lang);
      }));
      const choices = node('div', 'cf-controls');
      roleSelector(choices);
      const tools = node('div','cf-tools');
      for (const [id, text] of [['numbers','Numbers'],['documents','Documents'],['languages','Language help']]) {
        const action = button(text, () => {
          if (tool === 'documents' && id !== 'documents') releasePhoto();
          tool = tool === id ? '' : id;
          drawRoom('tool');
        });
        action.dataset.tool = id;
        action.setAttribute('aria-pressed', String(tool === id));
        tools.append(action);
      }
      choices.append(tools);
      const pane = node('section', 'cf-board');
      if (tool === 'numbers') numbersPane(pane);
      else if (tool === 'documents') documentsPane(pane);
      else if (tool === 'languages') interpreterPane(pane);
      else boardPane(pane);
      const history = node('details','cf-history');
      history.open = current.history;
      history.addEventListener('toggle', () => { if (history.isConnected && current) current.history = history.open; });
      history.append(node('summary'), node('ol'));
      shell.append(bar, head, boards, message, choices, pane, history);
      updateMessage();
      refreshHistory();
      if (focus === 'heading') focusTitle(head.querySelector('h3'));
      else if (focus === 'board' || focus === 'tool') focusTitle(pane.querySelector('h4'));
      else if (focus === 'role') choices.querySelector('[data-role][aria-pressed="true"]').focus({ preventScroll: true });
      else if (focus === 'sound') voiceButton.focus({ preventScroll: true });
    }

    const start = facility.rooms.find(item => item.id === directRoom);
    if (start) openRoom(start);
    else directory();
    return () => { stopSpeech(); clearTools(); };
  }

  function unmount(host) {
    const active = mounts.get(host);
    if (active && active.cleanup) active.cleanup();
    mounts.delete(host);
  }
  async function mount(host, setting = 'hospital', roomId) {
    if (!host) return;
    unmount(host);
    const active = {};
    mounts.set(host, active);
    host.replaceChildren(node('p', 'cf-empty', 'Opening the facility directory…'));
    try {
      const data = await catalog();
      if (mounts.get(host) !== active) return;
      active.cleanup = facilityView(host, data, setting, roomId);
    } catch {
      if (mounts.get(host) !== active) return;
      host.replaceChildren(node('p', 'cf-empty','The facility directory could not open.'), button('Try again', () => mount(host, setting, roomId)));
    }
  }
  window.CareFacility = Object.freeze({ mount, unmount });
})();
