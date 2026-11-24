/* TinkySpeak native catalog, including the local restaurant order board. */
(function () {
  'use strict';

  const base = new URL('.', document.currentScript?.src || new URL('/care-library.js', location.href));
  const categories = {
    core: 'Everyday life',
    emotion_reasons: 'Feelings',
    location: 'Places',
    school: 'School',
    venues: 'Restaurant menus',
    story: 'Social stories',
    number: 'Numbers',
    packs: 'Skills & activities'
  };
  const entrances = {
    home: 'core/main_board',
    school: 'school/school_board',
    restaurants: 'core/restaurants_board'
  };
  const sessions = new WeakMap();
  const cache = new Map();
  const el = (tag, name, text) => {
    const element = document.createElement(tag);
    if (name) element.className = name;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function btn(name, fn, css = 'cl-button') {
    const element = el('button', css, name);
    element.type = 'button';
    element.addEventListener('click', fn);
    return element;
  }
  async function load(name, signal) {
    if (cache.has(name)) return cache.get(name);
    const response = await fetch(new URL('care-library-' + name + '.json', base), {
      signal
    });
    if (!response.ok) throw Error('Board unavailable');
    const data = await response.json();
    if (!signal.aborted) cache.set(name, data);
    return data;
  }
  function langName(code) {
    try {
      return new Intl.DisplayNames(['en'], {
        type: 'language'
      }).of(code) || code;
    } catch {
      return code;
    }
  }
  function unmount(host) {
    const session = sessions.get(host);
    if (!session) return;
    session.controller.abort();
    session.stop();
    sessions.delete(host);
  }
  async function mount(host, entrance = 'library') {
    if (!host) return;
    unmount(host);
    const controller = new AbortController();
    const shell = el('section', 'care-library');
    shell.setAttribute('aria-label', 'TinkySpeak board library');
    host.replaceChildren(shell);
    let speech;
    const stop = () => {
      if (speech && window.speechSynthesis) window.speechSynthesis.cancel();
      speech = null;
    };
    const session = {
      controller,
      stop
    };
    sessions.set(host, session);
    const alive = () => sessions.get(host) === session && !controller.signal.aborted;
    const cleanup = () => {
      if (alive()) unmount(host);
    };
    const voices = Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
    let voice = voices;
    let language = 'source';
    let directoryCategory = '';
    let search = '';
    let catalog;
    let entry;
    let board;
    let translations;
    let sequence = 0;
    let trail = [];
    let last;
    let message = '';
    let orderOpen = false;
    const orders = new Map();
    const additions = new Map();
    function speak(value, code) {
      if (!value || !voice) return;
      stop();
      const utterance = new window.SpeechSynthesisUtterance(value);
      utterance.lang = code || 'en';
      utterance.onend = utterance.onerror = () => {
        if (speech === utterance) speech = null;
      };
      speech = utterance;
      window.speechSynthesis.speak(utterance);
    }
    function errorPane(retry) {
      shell.replaceChildren(el('p', 'cl-note', 'This board could not load.'), btn('Try again', retry));
    }
    function focusHeader() {
      const heading = shell.querySelector('h3');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({
          preventScroll: true
        });
      }
    }
    function byKey(key) {
      return catalog.boards.find(item => item.key === key);
    }
    function target(id) {
      return byKey(id) || catalog.boards.find(item => item.id === id && item.category === entry.category) || catalog.boards.find(item => item.id === id);
    }
    function visibleTile(tile, index) {
      const pair = translations?.[index] || [];
      return {
        label: pair[0] || tile.label,
        say: pair[1] || tile.spokenText || tile.label,
        labelLang: pair[0] ? language : 'en',
        sayLang: pair[1] ? language : 'en'
      };
    }
    function remember(text, lang = 'en') {
      last = {
        text,
        lang
      };
      speak(text, lang);
    }
    function directory(focus) {
      ++sequence;
      entry = board = null;
      orderOpen = false;
      shell.replaceChildren();
      const top = el('div', 'cl-row');
      const title = el('h3', null, 'Board library');
      top.append(title);
      const controls = el('div', 'cl-controls');
      const field = el('input');
      field.type = 'search';
      field.placeholder = 'Find a board or topic';
      field.setAttribute('aria-label', field.placeholder);
      field.value = search;
      const select = el('select');
      select.setAttribute('aria-label', 'Filter by category');
      select.append(new Option('All categories', ''));
      for (const [code, label] of Object.entries(categories)) select.append(new Option(label, code));
      select.value = directoryCategory;
      controls.append(field, select);
      const count = el('p', 'cl-note');
      count.setAttribute('role', 'status');
      const grid = el('div', 'cl-catalog');
      function filter() {
        const words = search.toLocaleLowerCase().trim().split(/\s+/);
        const entries = catalog.boards.filter(item => {
          if (directoryCategory && item.category !== directoryCategory) return false;
          const terms = [item.name, categories[item.category], ...item.topics].join(' ').toLocaleLowerCase();
          return words.every(word => terms.includes(word));
        });
        count.textContent = entries.length + (entries.length === 1 ? ' entry' : ' entries');
        grid.replaceChildren();
        for (const item of entries) {
          const b = btn('', () => open(item.key), 'cl-entry');
          b.dataset.key = item.key;
          b.append(el('strong', null, item.name), el('small', null, categories[item.category]));
          grid.append(b);
        }
        if (!entries.length) grid.append(el('p', 'cl-note', 'No matching boards. Try another topic.'));
      }
      field.addEventListener('input', () => {
        search = field.value;
        filter();
      });
      select.addEventListener('change', () => {
        directoryCategory = select.value;
        filter();
      });
      shell.append(top, controls, count, grid);
      filter();
      if (focus) focusHeader();
    }
    async function open(key, options = {}) {
      const next = byKey(key);
      if (!next) return;
      const token = ++sequence;
      if (!options.noTrail && entry && entry.key !== key) trail.push(entry.key);
      entry = next;
      orderOpen = false;
      message = '';
      shell.replaceChildren(el('p', 'cl-note', 'Opening ' + next.name + '…'));
      try {
        const [group, locale] = await Promise.all([load(next.category, controller.signal), language === 'source' ? null : load('lang-' + language, controller.signal)]);
        if (!alive() || token !== sequence) return;
        board = group[key];
        translations = locale?.[key];
        draw();
        if (!options.noFocus) focusHeader();
      } catch {
        if (alive() && token === sequence) errorPane(() => open(key, {
          noTrail: true
        }));
      }
    }
    function previous() {
      const key = trail.pop();
      if (key) open(key, { noTrail: true });
      else directory(true);
    }
    function groupSelector() {
      const group = el('label', 'cl-language', 'Language');
      const select = el('select');
      select.setAttribute('aria-label', 'Board language');
      select.append(new Option('Original English', 'source'));
      for (const lang of [...catalog.languages].sort((a, b) => langName(a).localeCompare(langName(b)))) {
        select.append(new Option(langName(lang), lang));
      }
      select.value = language;
      select.addEventListener('change', () => {
        language = select.value;
        open(entry.key, {
          noTrail: true
        });
      });
      group.append(select);
      return group;
    }
    function recordTile(tile, index) {
      const shown = visibleTile(tile, index);
      const next = tile.navigateTo || tile.navigationTarget;
      const action = tile.customAction || tile.actionType || tile.action;
      remember(shown.say, shown.sayLang);
      message = '';
      if (next) {
        const item = target(next);
        if (item && !tile.requiresPin) {
          open(item.key);
          return;
        }
        message = tile.requiresPin ? 'The parent view opens in the native app.' : 'The original board links to a page outside this catalog.';
      } else if (tile.label === 'BACK') {
        previous();
        return;
      } else if (action === 'view_order') {
        orderOpen = true;
      } else if (tile.label === 'ADD NEW') {
        editPhrase();
        return;
      } else if (action) message = 'This shortcut opens in the native TinkySpeak app.';
      updateMessage();
      if (orderOpen) drawOrder();
      const add = shell.querySelector('.cl-add-order');
      if (add) add.hidden = !board.orderTracking || Boolean(next || action || tile.label === 'ADD NEW');
      session.selection = {
        ...shown,
        key: entry.key
      };
    }
    function updateMessage() {
      const sentence = shell.querySelector('.cl-sentence strong');
      if (sentence) {
        sentence.textContent = last?.text || 'Choose a tile to speak.';
        sentence.lang = last?.lang || 'en';
        sentence.dir = 'auto';
      }
      const replay = shell.querySelector('.cl-repeat');
      if (replay) replay.disabled = !last || !voice;
      const note = shell.querySelector('.cl-feedback');
      if (note) note.textContent = message;
    }
    function editPhrase() {
      const panel = shell.querySelector('.cl-extra');
      panel.replaceChildren();
      const form = el('form', 'cl-controls');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 180;
      input.placeholder = 'New English phrase for this demo';
      input.setAttribute('aria-label', input.placeholder);
      input.required = true;
      const save = el('button', 'cl-button', 'Add phrase');
      save.type = 'submit';
      form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        const items = additions.get(entry.key) || [];
        items.push({
          label: text,
          spokenText: text,
          emoji: '💬'
        });
        additions.set(entry.key, items);
        draw();
      });
      form.append(input, save, btn('Cancel', () => {
        panel.replaceChildren();
      }));
      panel.append(form);
      input.focus();
    }
    function drawOrder() {
      const panel = shell.querySelector('.cl-order');
      if (!panel) return;
      const items = orders.get(entry.key) || [];
      panel.replaceChildren();
      if (!orderOpen) return;
      const top = el('div', 'cl-row');
      top.append(el('h4', null, 'My order'), btn('Close', () => {
        orderOpen = false;
        drawOrder();
      }));
      panel.append(top);
      if (!items.length) {
        panel.append(el('p', 'cl-note', 'Choose a menu tile and use Add to order.'));
      } else {
        items.forEach((item, i) => {
          const row = el('div', 'cl-order-item');
          row.append(el('strong', null, item.label), btn('Remove', () => {
            items.splice(i, 1);
            drawOrder();
          }));
          panel.append(row);
        });
        panel.append(btn('Read order', () => {
          const text = items.map(item => item.say).join('. ');
          last = {
            text,
            lang: items[0].sayLang
          };
          updateMessage();
          if (voice) {
            stop();
            for (const [index, item] of items.entries()) {
              const utterance = new window.SpeechSynthesisUtterance(item.say);
              utterance.lang = item.sayLang;
              if (index === items.length - 1) {
                speech = utterance;
                utterance.onend = () => {
                  if (speech === utterance) speech = null;
                };
              }
              window.speechSynthesis.speak(utterance);
            }
          }
        }));
      }
    }
    function draw() {
      shell.replaceChildren();
      const nav = el('div', 'cl-controls');
      nav.append(btn('Board library', () => {
        trail = [];
        directory(true);
      }));
      if (trail.length) nav.append(btn('‹ Previous board', previous));
      const top = el('div', 'cl-row');
      top.append(el('h3', null, entry.name), groupSelector());
      const sentence = el('div', 'cl-sentence');
      const output = el('strong');
      output.setAttribute('role', 'status');
      const repeat = btn('Repeat', () => {
        if (last) speak(last.text, last.lang);
      }, 'cl-button cl-repeat');
      const sound = btn(voice ? 'Sound on' : 'Sound off', () => {
        voice = !voice;
        if (!voice) stop();
        sound.textContent = voice ? 'Sound on' : 'Sound off';
        sound.setAttribute('aria-pressed', String(voice));
        updateMessage();
      });
      sound.disabled = !voices;
      sound.setAttribute('aria-pressed', String(voice));
      sentence.append(output, repeat, sound);
      shell.append(nav, top, sentence);
      if (board.venues) {
        const grid = el('div', 'cl-catalog');
        for (const venue of board.venues) {
          const dest = target(venue.boardId);
          if (dest) grid.append(btn(venue.name, () => open(dest.key), 'cl-entry'));
        }
        shell.append(grid);
      } else {
        const tiles = [...board.tiles, ...(additions.get(entry.key) || [])];
        if (language !== 'source') {
          const available = tiles.filter((_, i) => translations?.[i]?.[0] && translations[i][1]).length;
          if (available < tiles.length) shell.append(el('p', 'cl-note', available + ' of ' + tiles.length + ' tiles have labels and speech in ' + langName(language) + '. English fills in missing text.'));
        }
        const tools = el('div', 'cl-controls');
        if (board.orderTracking) {
          const add = btn('Add to order', () => {
            const selected = session.selection;
            if (!selected || selected.key !== entry.key) return;
            const items = orders.get(entry.key) || [];
            items.push(selected);
            orders.set(entry.key, items);
            message = selected.label + ' added to your demo order.';
            updateMessage();
            orderOpen = true;
            drawOrder();
          }, 'cl-button cl-add-order');
          add.hidden = true;
          tools.append(btn('My order', () => {
            orderOpen = !orderOpen;
            drawOrder();
          }), add);
        }
        const feedback = el('p', 'cl-feedback');
        feedback.setAttribute('role', 'status');
        const order = el('section', 'cl-order');
        const grid = el('div', 'cl-tiles');
        tiles.forEach((tile, i) => {
          const shown = visibleTile(tile, i);
          const b = btn('', () => recordTile(tile, i), 'cl-tile');
          const icon = window.CareDemoResponses.illustration(b, tile);
          const title = el('span', null, shown.label);
          title.dir = 'auto';
          title.lang = shown.labelLang;
          b.append(icon, title);
          const color = tile.colorHex || tile.color;
          if (/^#[a-f\d]{6}$/i.test(color)) b.style.setProperty('--cl-ink', color);
          b.dataset.tile = i;
          grid.append(b);
        });
        shell.append(tools, feedback, order, el('div', 'cl-extra'), grid);
      }
      updateMessage();
    }
    shell.append(el('p', 'cl-note', 'Opening the board library…'));
    try {
      catalog = await load('catalog', controller.signal);
      if (!alive()) return cleanup;
      if (entrances[entrance]) await open(entrances[entrance], { noFocus: true });
      else directory();
    } catch {
      if (alive()) errorPane(() => mount(host, entrance));
    }
    return cleanup;
  }
  window.CareLibrary = Object.freeze({
    mount,
    unmount
  });
})();
