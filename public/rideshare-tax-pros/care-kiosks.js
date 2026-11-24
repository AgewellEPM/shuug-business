// Local presentation of TinkyTown's kiosk, in the same layout a customer opens from the QR code.
(() => {
  'use strict';
  const langs = { en:'English', es:'Español', fr:'Français', ar:'العربية', pt:'Português', zh:'中文', vi:'Tiếng Việt' };
  // Care settings keep the patient's screen clear: no bottom bar, and the pickers open only when asked for.
  const careSettings = new Set(['bedside','hospital','nursing-home','senior-center','stroke']);
  const published = new Set(['airport','bank','grocery','hotel','pharmacy','dmv','usps']);
  const quickNeeds = [
    { id:'bathroom', label:'Bathroom', spokenText:'I need to use the bathroom.' },
    { id:'help', label:'Help', spokenText:'I need help.', navigateTo:'kiosk_help' },
    { id:'water', label:'Water', spokenText:'I need water.', diet:'drink' },
  ];
  const needsTranslations = {
    es: ['Agua', 'Necesito agua.', 'Necesito usar el baño.'],
    fr: ['Eau', "J’ai besoin d’eau.", "J’ai besoin d’aller aux toilettes."],
    ar: ['ماء', 'أحتاج إلى الماء.', 'أحتاج إلى استخدام الحمام.'],
    pt: ['Água', 'Preciso de água.', 'Preciso usar o banheiro.'],
    zh: ['水', '我需要喝水。', '我需要上洗手间。'],
    vi: ['Nước', 'Tôi cần nước.', 'Tôi cần đi vệ sinh.'],
  };
  const normalize = s => String(s || '').normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g,"'").replace(/[.!?…]+$/g,'').trim();
  const read = name => window.CareKioskPacks.read('/care-kiosks/' + name + '.json');
  const element = (tag, value) => Object.assign(document.createElement(tag), {textContent:value ?? ''});
  function button(label, click) {
    const b = element('button', label);
    b.type = 'button'; b.addEventListener('click', click);
    return b;
  }
  function icon(label, glyph, click, kind) {
    const b = button('', click);
    const mark = element('span', glyph);
    mark.setAttribute('aria-hidden', 'true');
    b.className = kind; b.setAttribute('aria-label', label);
    b.append(mark);
    return b;
  }
  function picker(label, options, selected, onChange) {
    const field = element('label', label), select = document.createElement('select');
    for (const [value,name] of options) select.add(new Option(name,value));
    select.value = selected; select.addEventListener('change', () => onChange(select.value));
    field.append(select); return field;
  }
  function indexed(dictionary) {
    const forward = new Map(), reverse = new Map();
    for (const [original, translated] of Object.entries(dictionary)) {
      const key = normalize(original), back = normalize(translated);
      if (!forward.has(key)) forward.set(key, translated);
      if (!reverse.has(back)) reverse.set(back, original);
    }
    return { dictionary, forward, reverse };
  }
  function mount(root, venue, params, {diet} = {}) {
    let closed = false, pack, place, key, history = [], messages = [], language = 'en', generation = 0;
    let lexicon = indexed({}), lastUtterance, pendingSign = false;
    let recognition = null, privacy = false, exchange = null, lastExchange = null, request = null, afterReplyScreen = false;
    const client = window.crypto?.randomUUID?.() || '';
    const app = element('article'); app.className = 'care-venue-kiosk';
    const header = element('header'), about = element('div'), title = element('h3'), address = element('p'), contact = element('p'), boardName = element('p');
    const captions = element('div'), words = element('div'), speaker = element('strong'), message = element('p'), original = element('p');
    const area = element('div'), heading = element('h4'), grid = element('div'), helper = element('div'), dock = element('footer');
    const transcript = element('details'), transcriptTitle = element('summary','Conversation'), transcriptList = element('ol');
    const selectors = element('div'), status = element('p');
    const back = icon('Back', '←', previous, 'ck-back'); back.dataset.back = '';
    header.className = 'ck-header'; about.className = 'ck-about'; contact.className = 'ck-contact'; boardName.className = 'ck-board';
    about.append(title,address,contact,boardName); header.append(back,about);
    captions.className = 'ck-captions'; words.className = 'ck-words';
    message.className = 'care-kiosk-message'; words.setAttribute('role','status');
    original.className = 'ck-original'; original.hidden = true;
    const hear = icon('Listen for staff', '👂', listenForStaff, 'ck-ear');
    const replay = icon('Speak again', '🔊', () => { const m = messages.at(-1); if (m) utter(m.text,m.lang); }, 'ck-replay'); replay.dataset.replay = '';
    words.append(speaker,message,original); captions.append(words,hear,replay);
    area.className = 'ck-area'; heading.className = 'ck-sr'; heading.tabIndex = -1;
    grid.className = 'care-kiosk-tiles'; helper.className = 'ck-helper';
    const emergency = element('div'); emergency.className = 'ck-strip';
    area.append(heading,emergency,helper,grid);
    const type = element('form'), draft = element('input'), clear = button('Clear', () => { draft.value = ''; draft.focus(); }), send = element('button','↑');
    type.className = 'ck-type'; draft.placeholder = 'Type your question…'; draft.maxLength = 350; draft.setAttribute('aria-label','Type your question');
    clear.className = 'ck-clear'; send.className = 'ck-send'; send.type = 'submit'; send.setAttribute('aria-label','Show reply tiles');
    type.append(draft,clear,send);
    type.addEventListener('submit', event => {
      event.preventDefault();
      const question = draft.value.trim();
      if (!question) return;
      // Typed words get reply tiles, as they do on the public kiosk. The assistant never answers for anyone.
      if (exchange?.listening) return void heardFrom(question);
      closeExchange();
      exchange = { said: '', shown: [], typed: true };
      void heardFrom(question, 'Typed');
    });
    const staff = button('👂 Listen for Staff', listenForStaff); staff.className = 'ck-staff';
    status.className = 'ck-status'; status.setAttribute('role','status');
    transcript.className = 'ck-transcript'; transcript.append(transcriptTitle,transcriptList);
    selectors.className = 'ck-places'; selectors.hidden = true;
    const nav = element('nav'); nav.className = 'ck-nav'; nav.setAttribute('aria-label','Kiosk');
    const tabs = [['Home','🏠',() => { history = []; go('main',false); }],['Numbers','🔢',() => compose('Number',{numeric:true})],
      ['Translate','🌐',() => translateSign()],['Places','📍',() => { selectors.hidden = !selectors.hidden; if (!selectors.hidden) selectors.querySelector('select').focus(); }]];
    for (const [label,glyph,click] of tabs) { const b = icon(label,glyph,click,'ck-tab'); b.append(element('small',label)); nav.append(b); }
    dock.className = 'ck-dock'; dock.append(type,staff,status,transcript);
    const patientScreen = careSettings.has(venue);
    const needs = element('div'); needs.className = 'ck-quick-needs'; needs.hidden = true;
    needs.setAttribute('role','group'); needs.setAttribute('aria-label','Quick needs');
    app.append(header,captions,...(patientScreen ? [] : [selectors]),area,needs,dock,...(patientScreen ? [] : [nav]));
    root.replaceChildren(app);
    const openPlaces = () => { selectors.hidden = false; if (patientScreen) { helper.append(selectors); area.scrollTop = 0; } };
    const live = [captions,dock,nav];
    for (const part of live) part.inert = true;
    const tr = text => Object.hasOwn(lexicon.dictionary,text) ? lexicon.dictionary[text] : lexicon.forward.get(normalize(text));
    function localized(el, english) {
      const translated = tr(english);
      el.textContent = translated || english;
      el.lang = translated ? language : 'en'; el.dir = el.lang === 'ar' ? 'rtl' : 'auto';
      return el;
    }
    function cancelVoice() {
      if (lastUtterance && window.speechSynthesis) window.speechSynthesis.cancel();
      lastUtterance = null;
    }
    function utter(text, lang) {
      cancelVoice();
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      const voice = new window.SpeechSynthesisUtterance(text);
      voice.lang = lang; lastUtterance = voice;
      window.speechSynthesis.speak(voice);
    }
    async function localTranslation(text, sourceLanguage, targetLanguage) {
      if (!window.Translator?.availability || sourceLanguage === targetLanguage) return;
      let translator;
      try {
        const pair = {sourceLanguage,targetLanguage};
        if (await window.Translator.availability(pair) !== 'available') return;
        translator = await window.Translator.create(pair);
        return await translator.translate(text);
      } catch { return undefined; }
      finally { translator?.destroy?.(); }
    }
    function stopListening() {
      if (!recognition) return;
      recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* already ended */ }
      recognition = null;
      for (const b of [staff,hear]) b.removeAttribute('data-listening');
      status.textContent = '';
    }
    // Their turn. What staff say and the replies to it share the tile area, as they do in the app.
    function openExchange() {
      closeExchange();
      exchange = { said: '', shown: [], listening: true };
      heading.textContent = boardName.textContent = 'Their turn';
      emergency.replaceChildren(...(pack.pool[place.boards[key]].strip || []).map(tileButton));
      draft.placeholder = 'Type what they said…';
      waiting('Waiting for their response…', true);
      drawQuickNeeds();
    }
    function cancelReplies() {
      request?.abort();
      request = null;
    }
    function closeExchange() { cancelReplies(); if (exchange) draft.value = ''; exchange = null; draft.placeholder = 'Type your question…'; }
    function panel(...parts) { grid.replaceChildren(); helper.replaceChildren(); const box = element('div'); box.className = 'ck-exchange'; box.append(...parts); grid.append(box); area.scrollTop = 0; return box; }
    function waiting(words, listening) {
      const again = button('🎤  Tap When They Speak', listenForStaff);
      again.className = 'ck-again'; again.hidden = Boolean(listening);
      panel(Object.assign(element('p','👂'),{className:'ck-big'}), element('p',words), again, element('p','— or type what they said below —'));
    }
    async function heardFrom(said, who = 'Staff') {
      stopListening();
      lastExchange = null;
      // Sending a correction replaces what was heard.
      if (exchange?.said && messages.at(-1)?.who === who) { messages.pop(); transcriptList.lastElementChild?.remove(); }
      draft.value = said;
      show(said, who === 'Staff' ? 'en' : language, who, null, false);
      exchange = { said, shown: [], tiles: [], listening: who === 'Staff', who };
      const pending = replies('reply');
      if (patientScreen && window.matchMedia?.('(max-width: 640px)').matches) {
        if (document.activeElement === draft) draft.blur();
        dock.scrollIntoView?.({block:'nearest', behavior:'instant'});
      }
      await pending;
    }
    // A wrong picture can mislead someone who cannot read the label. Prefer the words and picture this
    // location's own boards use, and never show one picture for two different answers.
    function picture(tile, used) {
      const same = value => normalize(value).replace(/ ›$/,'');
      for (const board of pack.pool) for (const known of board.tiles) {
        if (known.emoji && known.spokenText && same(known.spokenText) === same(tile.say)) return { ...tile, emoji: known.emoji, label: known.label.replace(/ ›$/,'') };
        if (known.emoji && same(known.label) === same(tile.label)) return { ...tile, emoji: known.emoji };
      }
      return used.has(tile.emoji) ? { ...tile, emoji: undefined } : tile;
    }
    // The tile shows the words it will say, as the demo does.
    const replyTile = ({ emoji, say, tone }, color = 'blue') => ({ emoji, tone, label: say, spokenText: say, color, reply: true, navigateTo: place.boards.ts_after !== undefined ? 'ts_after' : undefined });
    // Yes and No stay first and stay put while the AI writes the rest.
    function replyGrid() {
      heading.textContent = boardName.textContent = 'Choose a reply';
      drawQuickNeeds();
      helper.replaceChildren();
      if (exchange.mode !== 'continue') helper.append(Object.assign(element('p',(exchange.who === 'Typed' ? '' : 'They said: ') + exchange.said),{className:'ck-prompt'}));
      grid.replaceChildren(tileButton(replyTile({ emoji:'✅', label:'Yes', say:'Yes' },'green')), tileButton(replyTile({ emoji:'❌', label:'No', say:'No' },'red')),
        ...exchange.tiles.map(tile => tileButton(replyTile(tile))));
    }
    function moreChoices() {
      if (!grid.querySelector('[data-action="more_choices"]')) grid.append(tileButton({ emoji:'🔄', label:'More Choices', color:'gray', action:'more_choices', wide:true }));
    }
    function addReply(tile, previous) {
      if (/^(yes|no)$/i.test(normalize(tile.say)) || exchange.shown.some(words => normalize(words) === normalize(tile.say))) return;
      if (previous?.length && exchange.tiles === previous) {
        exchange.tiles = [];
        replyGrid(); thinking(true);
      }
      const shown = picture(tile, new Set(exchange.tiles.map(item => item.emoji)));
      exchange.tiles.push(shown); exchange.shown.push(tile.say);
      const wait = grid.querySelector('.ck-thinking, [data-action="more_choices"]');
      wait ? wait.before(tileButton(replyTile(shown))) : grid.append(tileButton(replyTile(shown)));
      moreChoices();
    }
    function thinking(on) {
      grid.querySelector('.ck-thinking')?.remove();
      if (!on) return;
      const card = element('div'); card.className = 'ck-thinking'; card.setAttribute('role','status');
      card.append(element('span','🧠'), element('strong','Thinking…')); grid.append(card);
    }
    async function replies(mode) {
      cancelReplies();
      const pending = new AbortController(), current = exchange;
      request = pending;
      current.mode = mode;
      const previous = mode === 'more' && current.tiles?.length ? current.tiles : null;
      current.tiles = previous || [];
      replyGrid(); thinking(true); area.scrollTop = 0;
      const board = pack.pool[place.boards[key]], main = pack.pool[place.boards.main];
      const options = [...new Set([...board.tiles,...main.tiles].filter(t => t.spokenText && t.spokenText.length <= 120 && !t.silent && !t.private && !/^(yes|no)\b/i.test(t.label) && t.action !== 'back').map(t => t.spokenText))].slice(0,12);
      let source;
      try {
        const response = await fetch('/api/sales/care-replies', { method:'POST', credentials:'same-origin', signal:pending.signal, headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ client, said: current.said, mode, shown: current.shown.slice(-18).map(s => s.slice(0,60)), log: messages.slice(0,mode === 'reply' ? -1 : undefined).slice(-6).map(m => ({ who: m.who === 'Visitor' ? 'Visitor' : 'Staff', text: (m.english || m.text).slice(0,200) })),
            place: { name: place.name, bedside: Boolean(place.bedside), options } }) });
        if (!response.ok) throw new Error('Replies unavailable.');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        for (let rest = '';;) {
          const { done, value } = await reader.read();
          if (closed || request !== pending || exchange !== current) { await reader.cancel(); return; }
          if (done) break;
          rest += decoder.decode(value, {stream:true});
          const lines = rest.split('\n'); rest = lines.pop();
          for (const line of lines) if (line) {
            const part = JSON.parse(line);
            if (part.tile) addReply(part.tile, previous);
            if (part.done) source = part.source;
          }
        }
      } catch { source = source || null; }
      if (closed || request !== pending || exchange !== current) return;
      request = null;
      thinking(false);
      if (!current.tiles.length || (mode === 'more' && current.tiles === previous)) { const retry = button('Try again', () => replies(mode)); retry.className = 'ck-again'; helper.append(element('p',source ? 'No additional choices are available.' : 'Replies could not load.'), retry); return; }
      if (source === 'fixed') helper.append(Object.assign(element('p','The AI did not respond. These are saved replies.'),{className:'ck-note'}));
      moreChoices();
    }
    // What happens after a reply is spoken, as on demo.tinkytown.com.
    function afterReply() {
      afterReplyScreen = true;
      heading.textContent = boardName.textContent = 'What next?';
      drawQuickNeeds();
      helper.replaceChildren();
      const tones = { repeat:'teal', undo:'red', their_turn:'purple', keep_talking:'blue', new_question:'orange', im_done:'gray', go_home:'yellow' };
      const acts = { repeat:'replay', undo:'wrong_one', their_turn:'caption_teller', keep_talking:'keep_talking', new_question:'new_question', im_done:'done', go_home:'go_home' };
      grid.replaceChildren(...pack.controls.map(tile => tileButton({ emoji:tile.emoji, label:tile.label, color:tones[tile.action], action:acts[tile.action], closing:tile.say })));
      area.scrollTop = 0;
    }
    // The browser handles recognition. Without it, or without permission, the same words can be typed.
    function listenForStaff() {
      const active = Boolean(recognition);
      stopListening();
      if (active) return;
      cancelVoice();
      openExchange();
      const fallback = () => { stopListening(); waiting('Type what they said below.'); };
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) return fallback();
      recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      let latest = '';
      recognition.onresult = event => {
        const heard = [...event.results].map(result => result[0].transcript).join('').trim();
        // Their words fill the type box as they speak, so a misheard word can be fixed and sent again.
        latest = heard.slice(0,350); draft.value = latest;
        if (event.results[event.results.length - 1].isFinal === false) return;
        stopListening();
        if (heard) void heardFrom(heard);
      };
      recognition.onerror = fallback;
      recognition.onend = () => {
        stopListening();
        if (latest) void heardFrom(latest);
        else waiting('No words were heard.');
      };
      [staff,hear].forEach(b => b.setAttribute('data-listening',''));
      status.textContent = 'Listening for staff…';
      try { recognition.start(); } catch { fallback(); }
    }
    function show(text, lang, who, english, speakNow = true) {
      if (!text) return;
      const item = {text,lang,who,english};
      messages.push(item);
      speaker.textContent = who === 'Visitor' ? 'You said:' : who + ':';
      message.textContent = text; message.lang = lang; message.dir = 'auto';
      original.hidden = !english; original.textContent = english ? 'Full message in English · ' + english : '';
      const li = element('li',who + ' · '), line = element('span',text);
      line.lang = lang; line.dir = 'auto'; li.append(line);
      if (english) li.append(element('small',' · ' + english));
      transcriptList.append(li); transcriptTitle.textContent = 'Conversation (' + messages.length + ')';
      replay.disabled = false;
      if (speakNow) utter(text,lang);
      return {item,words:line,li};
    }
    function speak(english, fallback, {who = 'Visitor', aloud = true} = {}) {
      if (!english) return;
      const translation = tr(english), short = fallback && tr(fallback);
      if (translation) return show(translation,language,who,undefined,aloud);
      const tryLocal = aloud && language !== 'en' && Boolean(window.Translator?.availability);
      const placed = short ? show(short,language,who,english,aloud && !tryLocal) : show(english,'en',who,null,aloud && !tryLocal);
      if (!tryLocal) return;
      const target = language;
      localTranslation(english,'en',target).then(translated => {
        if (closed || !placed.li.isConnected || language !== target) return;
        const {item,words,li} = placed;
        if (translated) {
          item.text = translated; item.lang = target; item.english = english;
          words.textContent = translated; words.lang = target;
          if (!li.querySelector('small')) li.append(element('small',' · ' + english));
        }
        if (messages.at(-1) !== item) return;
        if (translated) {
          message.textContent = translated; message.lang = target;
          original.hidden = false; original.textContent = 'Full message in English · ' + english;
        }
        utter(item.text,item.lang);
      });
    }
    function setAddress() {
      const args = new URLSearchParams(location.hash.slice(1));
      if (args.get('venue') !== venue) return;
      args.set('place',place.key); args.set('board',key);
      if (language === 'en') args.delete('language'); else args.set('language',language);
      // Browsers limit how often the address can change. The board must still open.
      try { window.history.replaceState(null,'','#' + args); } catch { /* the address catches up on the next board */ }
    }
    function go(id, push = true) {
      if (!Object.hasOwn(place.boards,id)) return;
      if (exchange) closeExchange();
      if (push && key !== id) history.push(key);
      pendingSign = false; stopListening(); selectors.hidden = true; key = id; setAddress(); draw(); area.scrollTop = 0; heading.focus({preventScroll:true});
    }
    function previous(fallback) {
      if (exchange || afterReplyScreen) {
        stopListening(); closeExchange(); draw(); heading.focus({preventScroll:true}); return;
      }
      if (key === 'main' && !history.length && typeof fallback !== 'string') return root.dispatchEvent(new CustomEvent('care:leave',{bubbles:true}));
      go(history.pop() || (typeof fallback === 'string' && fallback !== key ? fallback : 'main'),false);
    }
    function compose(label, options = {}) {
      const form = element('form'), input = element('input'), field = element('label',label);
      field.append(input);
      input.maxLength = 350; input.required = true;
      if (options.numeric) { input.inputMode = 'decimal'; input.pattern = '[0-9., +\\-]+'; }
      if (options.placeholder) input.placeholder = options.placeholder;
      const submit = element('button', options.submit || 'Show and speak'); submit.type = 'submit';
      form.append(field,submit); helper.replaceChildren(form); area.scrollTop = 0; input.focus();
      form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        if (options.save) options.save(text);
        else {
          const reply = label === 'Staff reply';
          show(text, reply ? 'en' : language, reply ? 'Staff' : 'Visitor', null, !reply);
          helper.replaceChildren();
        }
      });
      return form;
    }
    function resource(tile) {
      let url;
      try { url = new URL(tile.actionUrl); } catch { helper.textContent = 'Resource details are unavailable for this tile.'; return; }
      if (url.protocol === 'https:') {
        const a = element('a', 'Open resource · ' + url.hostname);
        a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        helper.append(a);
      } else if (['tel:','sms:','mailto:'].includes(url.protocol)) {
        const verb = { 'tel:':'Phone', 'sms:':'Text', 'mailto:':'Email' }[url.protocol];
        const value = url.pathname.replace(/^\/\//,'');
        helper.append(element('p',verb + ' · ' + value + (url.searchParams.get('body') ? ' · ' + url.searchParams.get('body') : '')));
        helper.append(element('p','Contact details for this demonstration. Calls and messages stay off.'));
      } else helper.textContent = 'Resource details are unavailable for this tile.';
    }
    function translateSign() {
      if (language === 'en') {
        pendingSign = true;
        helper.replaceChildren(element('p','Choose the other language on the sign, then enter the text.'));
        openPlaces();
        selectors.querySelector('[data-language] select').focus();
        return;
      }
      const lang = language;
      let direction = 'fromEnglish', pass = 0;
      const result = element('p'); result.setAttribute('role','status');
      const f = compose('Sign text', {submit:'Translate sign',save:async text => {
        const version = ++pass, en = direction === 'fromEnglish', from = en ? 'en' : lang, to = en ? lang : 'en';
        let translated = en ? tr(text) : lexicon.reverse.get(normalize(text));
        if (!translated) translated = await localTranslation(text,from,to);
        if (closed || !f.isConnected || pass !== version || language !== lang) return;
        if (!translated) {result.textContent = 'This text has no offline translation here. A staff member can type a reply.';return;}
        result.textContent = translated; result.lang = to; show(translated,to,'Sign translation');
      }});
      const chooseDirection = picker('Translate', [['fromEnglish','English → ' + langs[lang]],['toEnglish',langs[lang] + ' → English']], direction, value => {direction = value;pass++;result.textContent='';});
      f.prepend(chooseDirection); helper.append(result);
    }
    function dietBlocks(tile, proceed) {
      const status = tile.diet && diet?.();
      if (!status) return false;
      const rule = pack.diet.warnings.find(item => item.status === status && item.kind === tile.diet);
      if (status !== 'npo' && !rule) return false;
      helper.replaceChildren(element('blockquote', status === 'npo' ? pack.diet.npo.message : rule.message));
      if (status === 'npo') utter(pack.diet.npo.say, 'en');
      else helper.append(button('Yes, Proceed', proceed), button('Cancel', () => helper.replaceChildren()));
      area.scrollTop = 0;
      return true;
    }
    function choose(tile) {
      const action = tile.action;
      if (dietBlocks(tile, () => tile.quickNeed ? choose({ ...tile, diet:undefined }) : go(tile.navigateTo))) return;
      if (tile.quickNeed && action !== 'back' && recognition) stopListening();
      if (tile.quickNeed && action !== 'back' && exchange?.listening && !exchange.said) {
        closeExchange();
        draw();
      }
      if (action === 'replay') { const m = messages.at(-1); if (m) utter(m.text,m.lang); return; }
      if (action === 'wrong_one') { messages.pop(); transcriptList.lastElementChild?.remove(); transcriptTitle.textContent = 'Conversation (' + messages.length + ')'; utter('Sorry, wrong one','en');
        if (lastExchange) { if (key === 'ts_after') { key = history.pop() || 'main'; setAddress(); draw(); } exchange = lastExchange; replyGrid(); moreChoices(); return; }
        return previous(); }
      if (action === 'done') { utter(tile.closing || "I'm done",'en'); history = []; return go('main',false); }
      if (action === 'more_choices') return replies('more');
      if (action === 'keep_talking') { const last = messages.findLast(m => m.who === 'Visitor'); exchange = { said: last?.english || last?.text || 'Hello', shown: [], tiles: [] }; return replies('continue'); }
      if (action === 'new_question') { utter(tile.closing,'en'); closeExchange(); draw(); return draft.focus(); }
      if (action === 'see') return helper.replaceChildren(element('p','See to Speak uses the camera in the TinkyStroke app.'));
      if (action === 'stroke_tool') return root.dispatchEvent(new CustomEvent('care:stroke-tool',{bubbles:true,detail:tile.tool}));
      if (action === 'back') return previous(tile.navigateTo);
      if (action === 'go_home') { history = []; return go('main',false); }
      if (action === 'language_picker') { openPlaces(); return selectors.querySelector('[data-language] select').focus(); }
      if (action === 'caption_teller') return listenForStaff();
      if (action === 'focus_input') return draft.focus();
      if (['number_pad','weight_pad','number_pad_digits','number_pad_date'].includes(action)) return compose(tile.label,{numeric:true});
      if (action === 'translate_sign') return translateSign();
      if (action === 'scan_boarding_pass') return compose('Sample boarding pass', {placeholder:'Flight or gate',submit:'Show boarding details'});
      helper.replaceChildren();
      if (action === 'show_for_staff') {
        const english = tile.showForStaffText || tile.spokenText || tile.label;
        // A private message is shown on screen only. It is never spoken or kept in the conversation.
        if (!tile.silent) speak(english);
        helper.append(localized(element('blockquote'),english)); return;
      }
      if (!tile.private && !privacy && tile.spokenText !== '') speak(tile.spokenText || tile.label, tile.label, {aloud: !tile.silent});
      if (action === 'open_url') return resource(tile);
      if (action === 'report_set_safety') {
        const target = tile.reportNext === 'report_988_routing' ? 'mental_health_crisis' : tile.reportNext;
        if (target && Object.hasOwn(place.boards,target)) return go(target);
      }
      if (action === 'uni_route_to_police_wizard' || action === 'report_911' || action === 'report_set_safety') {
        const f = compose('Practice handoff for staff', {placeholder:'Enter a fictional detail',submit:'Show practice handoff',
          save:text => show(text,language,'Practice handoff')});
        f.prepend(element('p','Practice a message to show a staff member. This demo keeps the handoff on screen.'));
        return;
      }
      if (tile.reply) {
        lastExchange = exchange;
        if (!tile.navigateTo && pack.controls) { closeExchange(); return afterReply(); }
      }
      if (tile.navigateTo) go(tile.navigateTo);
    }
    function tileButton(tile) {
      const b = button('',() => choose(tile)); b.className = 'care-kiosk-tile';
      b.dataset.color = tile.color || 'blue'; b.dataset.boardTarget = tile.navigateTo || ''; b.dataset.action = tile.action || '';
      const picture = window.CareDemoResponses.illustration(b, tile);
      const label = element('div'); label.className = 'ck-label';
      label.append(localized(element('strong'),tile.label));
      if (tile.subtitle) label.append(localized(element('small'),tile.subtitle));
      b.append(picture,label);
      if (tile.wide) b.dataset.wide = '';
      if (tile.quickNeed) b.dataset.quickNeed = tile.id;
      else if (tile.reply) b.dataset.reply = '';
      return b;
    }
    function drawQuickNeeds() {
      const shortcuts = [];
      if (key !== 'main' || exchange || afterReplyScreen) {
        shortcuts.push(tileButton({ id:'back', label:'Back', color:'gray', action:'back', quickNeed:true }));
      }
      const reply = Boolean(exchange?.said);
      if (!privacy) for (const need of quickNeeds) {
        const useAsReply = reply && !need.navigateTo;
        shortcuts.push(tileButton({ ...need, quickNeed:true, reply:useAsReply,
          navigateTo: need.navigateTo || (useAsReply && Object.hasOwn(place.boards,'ts_after') ? 'ts_after' : undefined) }));
      }
      needs.replaceChildren(...shortcuts);
      needs.hidden = !shortcuts.length;
    }
    function draw() {
      afterReplyScreen = false;
      const board = pack.pool[place.boards[key]];
      privacy = key === 'senior_private' || Boolean(board.private);
      captions.hidden = dock.hidden = Boolean(board.private);
      drawQuickNeeds();
      localized(heading,board.title || place.name);
      boardName.textContent = key === 'main' ? '' : heading.textContent;
      // The kiosk keeps Yes and No on every board.
      const has = word => board.tiles.some(tile => tile.label?.trim().toLowerCase() === word);
      const answers = privacy || board.answers === false ? [] : [['Yes','✅','green'],['No','❌','red']].filter(([label]) => !has(label.toLowerCase()))
        .map(([label,emoji,color]) => ({label,emoji,color,spokenText:label}));
      grid.replaceChildren(...[...answers,...board.tiles].map(tileButton));
      const boards = selectors.querySelector('[data-board] select');
      for (const option of boards.options) localized(option,pack.pool[place.boards[option.value]].title);
      boards.value = key; helper.replaceChildren();
      emergency.replaceChildren(...(board.strip || []).map(tileButton));
      if (board.notice) helper.append(element('blockquote',board.notice));
      if (board.prompt) helper.append(Object.assign(element('p','They may say: ' + board.prompt),{className:'ck-prompt'}));
      back.setAttribute('aria-label', !history.length && key === 'main' ? 'Demo locations' : 'Back');
      nav.firstElementChild.toggleAttribute('data-current', key === 'main');
    }
    async function changeLanguage(value) {
      const seq = ++generation;
      try {
        const dictionary = value === 'en' ? {} : await read('lang-' + value);
        if (seq !== generation || closed) return;
        const [Water, water, bathroom] = needsTranslations[value] || [];
        language = value;
        lexicon = indexed(Water ? { ...dictionary, Water, 'I need water.':water, 'I need to use the bathroom.':bathroom } : dictionary);
        selectors.querySelector('[data-language] select').value = value;
        setAddress(); draw();
        if (pendingSign && value !== 'en') { pendingSign = false; translateSign(); }
      } catch {
        if (closed || seq !== generation) return;
        selectors.querySelector('[data-language] select').value = language;
        helper.textContent = 'Language file unavailable. Choose it again to retry.';
      }
    }
    function setPlace(id, requestedBoard) {
      generation++; pendingSign = false; stopListening(); closeExchange();
      lastExchange = null;
      place = pack.places.find(p => p.key === id) || pack.places[0];
      key = Object.hasOwn(place.boards,requestedBoard) ? requestedBoard : 'main';
      history = []; messages = []; transcriptList.replaceChildren(); transcript.open = false; transcriptTitle.textContent = 'Conversation';
      cancelVoice(); original.hidden = true; original.textContent = ''; speaker.textContent = '';
      message.textContent = 'Captions will appear here. Tap 👂 to listen for staff.'; message.lang = 'en';
      title.textContent = place.name; address.textContent = place.address; address.hidden = !place.address;
      contact.textContent = [place.phone && '☎️ ' + place.phone, place.hours].filter(Boolean).join(' · '); contact.hidden = !contact.textContent;
      const where = picker('Location',pack.places.map(p => [p.key,p.name]),place.key,value => {setPlace(value);setAddress();});
      const boards = picker('Board',Object.entries(place.boards).filter(([id,i]) => id === 'main' || !pack.pool[i].unlisted).map(([id,i]) => [id,pack.pool[i].title]),key,id => go(id)); boards.dataset.board='';
      const lang = picker('Board language',Object.entries(langs),language,changeLanguage); lang.dataset.language='';
      selectors.replaceChildren(where,boards,lang);
      replay.disabled = true;
      for (const part of live) part.inert = false;
      if (published.has(venue)) {
        const official = element('a','Open public kiosk ↗');
        official.href='https://tinkytown.com/'+venue+'/'+place.key.split('/').map(encodeURIComponent).join('/');
        official.target='_blank';official.rel='noopener noreferrer'; selectors.append(official);
      }
      draw();
    }
    async function load() {
      title.textContent='Loading location…';
      try {
        pack=await window.CareKioskPacks.load(venue); if (closed) return;
        setPlace(params.get('place') || params.get('mode'),params.get('board'));
        const requested=params.get('language');
        if(requested && Object.hasOwn(langs,requested)) await changeLanguage(requested);
      } catch {
        if(!closed) {title.textContent='This location could not load.';helper.replaceChildren(button('Try again',load));}
      }
    }
    const pause = () => { stopListening(); cancelVoice(); };
    root.addEventListener('care:pause', pause);
    load();
    return () => {closed=true;generation++;cancelReplies();pause();root.removeEventListener('care:pause', pause);selectors.remove();app.remove();};
  }
  window.CareKiosks = {mount};
})();
