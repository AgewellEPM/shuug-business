// Local presentation of TinkyTown's place-specific kiosk boards.
(() => {
  'use strict';
  const packs = new Map();
  const langs = { en:'English', es:'Español', fr:'Français', ar:'العربية', pt:'Português', zh:'中文', vi:'Tiếng Việt' };
  const normalize = s => String(s || '').normalize('NFKC').toLocaleLowerCase().replace(/[’‘]/g,"'").replace(/[.!?…]+$/g,'').trim();
  async function read(name) {
    if (!packs.has(name)) {
      const loading = fetch('/care-kiosks/' + encodeURIComponent(name) + '.json').then(response => {
        if (!response.ok) throw new Error('Venue boards unavailable.');
        return response.json();
      }).catch(error => { packs.delete(name); throw error; });
      packs.set(name, loading);
    }
    return packs.get(name);
  }
  const element = (tag, value) => Object.assign(document.createElement(tag), {textContent:value ?? ''});
  function button(label, click) {
    const b = element('button', label);
    b.type = 'button'; b.addEventListener('click', click);
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
  function mount(root, family, params) {
    let closed = false, pack, place, key, history = [], messages = [], language = 'en', generation = 0;
    let lexicon = indexed({}), speaking = true, lastUtterance, pendingSign = false;
    const app = element('article'); app.className = 'care-venue-kiosk';
    const title = element('h3'), address = element('p'), selectors = element('div'), controls = element('div');
    const message = element('p'), original = element('p'), heading = element('h4'), grid = element('div'), helper = element('div');
    const transcript = element('details'), transcriptList = element('ol');
    transcript.append(element('summary','Conversation'),transcriptList);
    selectors.className = controls.className = 'care-kiosk-controls';
    message.className = 'care-kiosk-message'; message.setAttribute('role','status');
    original.hidden = true;
    grid.className = 'care-kiosk-tiles'; heading.tabIndex = -1;
    app.append(title,address,selectors,message,original,controls,heading,grid,helper,transcript);
    root.replaceChildren(app);
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
    function show(text, lang, who, english, speakNow = true) {
      if (!text) return;
      const item = {text,lang,who,english};
      messages.push(item);
      message.textContent = text; message.lang = lang; message.dir = 'auto';
      original.hidden = !english; original.textContent = english ? 'Full message in English · ' + english : '';
      const li = element('li',who + ' · '), words = element('span',text);
      words.lang = lang; words.dir = 'auto'; li.append(words);
      if (english) li.append(element('small',' · ' + english));
      transcriptList.append(li);
      controls.querySelector('[data-replay]').disabled = false;
      if (speaking && speakNow) utter(text,lang);
      return {item,words,li};
    }
    function speak(english, fallback, who = 'Visitor') {
      if (!english) return;
      const translation = tr(english), short = fallback && tr(fallback);
      if (translation) return show(translation,language,who);
      const tryLocal = language !== 'en' && Boolean(window.Translator?.availability);
      const placed = short ? show(short,language,who,english,!tryLocal) : show(english,'en',who,null,!tryLocal);
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
        if (speaking) utter(item.text,item.lang);
      });
    }
    function setAddress() {
      const args = new URLSearchParams(location.hash.slice(1));
      if (args.get('venue') !== family) return;
      args.set('place',place.key); args.set('board',key);
      if (language === 'en') args.delete('language'); else args.set('language',language);
      window.history.replaceState(null,'','#' + args);
    }
    function go(id, push = true) {
      if (!Object.hasOwn(place.boards,id)) return;
      if (push && key !== id) history.push(key);
      pendingSign = false; key = id; setAddress(); draw(); heading.focus({preventScroll:true});
    }
    function previous(fallback) {
      go(history.pop() || (typeof fallback === 'string' && fallback !== key ? fallback : 'main'),false);
    }
    function compose(label, options = {}) {
      const form = element('form'), input = element('input'), field = element('label',label);
      field.append(input);
      input.maxLength = 350; input.required = true;
      if (options.numeric) { input.inputMode = 'decimal'; input.pattern = '[0-9., +\\-]+'; }
      if (options.placeholder) input.placeholder = options.placeholder;
      const submit = element('button', options.submit || 'Show and speak'); submit.type = 'submit';
      form.append(field,submit); helper.replaceChildren(form); input.focus();
      form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        if (options.save) options.save(text);
        else show(text, options.lang || language, label);
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
    function choose(tile) {
      const action = tile.action;
      if (action === 'back') return previous(tile.navigateTo);
      if (action === 'go_home') { history = []; return go('main',false); }
      if (action === 'language_picker') return selectors.querySelector('[data-language] select').focus();
      if (['focus_input','caption_teller'].includes(action)) return compose('Staff reply');
      if (['number_pad','weight_pad'].includes(action)) return compose(tile.label,{numeric:true});
      if (action === 'translate_sign') return translateSign();
      if (action === 'scan_boarding_pass') return compose('Sample boarding pass', {placeholder:'Flight or gate',submit:'Show boarding details'});
      helper.replaceChildren();
      if (action === 'show_for_staff') {
        const english = tile.showForStaffText || tile.spokenText || tile.label;
        speak(english);
        helper.append(localized(element('blockquote'),english)); return;
      }
      speak(tile.spokenText || tile.label, tile.label);
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
      if (tile.navigateTo) go(tile.navigateTo);
    }
    function draw() {
      const board = pack.pool[place.boards[key]];
      localized(heading,board.title || place.name);
      grid.replaceChildren(...board.tiles.map(tile => {
        const b = button('',() => choose(tile)); b.className = 'care-kiosk-tile';
        b.dataset.color = tile.color || 'blue'; b.dataset.boardTarget = tile.navigateTo || ''; b.dataset.action = tile.action || '';
        const emoji = element('span',tile.emoji || '💬'); emoji.setAttribute('aria-hidden','true');
        b.append(emoji,localized(element('strong'),tile.label));
        if (tile.subtitle) b.append(localized(element('small'),tile.subtitle));
        return b;
      }));
      const boards = selectors.querySelector('[data-board] select');
      for (const option of boards.options) localized(option,pack.pool[place.boards[option.value]].title);
      boards.value = key; helper.replaceChildren();
      controls.querySelector('[data-back]').disabled = !history.length && key === 'main';
    }
    async function changeLanguage(value) {
      const seq = ++generation;
      try {
        const dictionary = value === 'en' ? {} : await read('lang-' + value);
        if (seq !== generation || closed) return;
        language = value; lexicon = indexed(dictionary);
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
      generation++; pendingSign = false;
      place = pack.places.find(p => p.key === id) || pack.places[0];
      key = Object.hasOwn(place.boards,requestedBoard) ? requestedBoard : 'main';
      history = []; messages = []; transcriptList.replaceChildren(); transcript.open = false;
      cancelVoice(); original.hidden = true; original.textContent = '';
      message.textContent = 'Tap a tile to show and speak your message.'; message.lang = 'en';
      title.textContent = place.name; address.textContent = place.address; address.hidden = !place.address;
      const where = picker('Location',pack.places.map(p => [p.key,p.name]),place.key,value => {setPlace(value);setAddress();});
      const boards = picker('Board',Object.entries(place.boards).map(([id,i]) => [id,pack.pool[i].title]),key,id => go(id)); boards.dataset.board='';
      const lang = picker('Board language',Object.entries(langs),language,changeLanguage); lang.dataset.language='';
      selectors.replaceChildren(where,boards,lang);
      const back = button('← Back',previous); back.dataset.back='';
      const replay = button('Speak again',() => {const m=messages.at(-1);if(m)utter(m.text,m.lang);});
      replay.dataset.replay='';replay.disabled=true;
      const auto = element('label'), toggle = element('input'); toggle.type='checkbox'; toggle.checked=speaking;
      toggle.addEventListener('change',() => {speaking=toggle.checked;if(!speaking)cancelVoice();}); auto.append(toggle,' Speak on tap');
      controls.replaceChildren(back,button('Yes',()=>speak('Yes')),button('No',()=>speak('No')),replay,button('Staff reply',()=>compose('Staff reply')),auto);
      if (!['college','community'].includes(family)) {
        const official = element('a','Open public kiosk ↗');
        official.href='https://tinkytown.com/'+family+'/'+place.key.split('/').map(encodeURIComponent).join('/');
        official.target='_blank';official.rel='noopener noreferrer'; controls.append(official);
      }
      draw();
    }
    async function load() {
      title.textContent='Loading location…';
      try {
        pack=await read(family); if (closed) return;
        setPlace(params.get('place') || params.get('mode'),params.get('board'));
        const requested=params.get('language');
        if(requested && Object.hasOwn(langs,requested)) await changeLanguage(requested);
      } catch {
        if(!closed) {title.textContent='This location could not load.';helper.replaceChildren(button('Try again',load));}
      }
    }
    load();
    return () => {closed=true;generation++;cancelVoice();app.remove();};
  }
  window.CareKiosks = {mount};
})();
