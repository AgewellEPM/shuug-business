/* Visitor surface for the TinkyTown location boards. Data comes from the same
   Hartford and medical-office generators and visit/phone chunks as the kiosks. */
(function () {
  'use strict';

  const base = new URL('.', document.currentScript?.src || new URL('/care-locations.js', location.href));
  const stations = {
    hospital: { name: 'Hospital front desk', detail: 'Hartford Hospital · 80 Seymour Street, Hartford, CT', board: 'loc_visit_biz_hospital_arrive', role: 'Patient', qr: 'hospital', path: '/biz/healthcare/hartford-hospital-hartford' },
    nursing: { name: 'Nursing home reception', detail: 'Resident and family communication', board: 'loc_visit_biz_nursing_home_arrive', role: 'Resident', qr: 'healthcare', path: '/biz/healthcare' },
    assisted: { name: 'Assisted living', detail: 'Resident and family visits', board: 'loc_visit_biz_assisted_living_facility_arrive', role: 'Resident', qr: 'healthcare', path: '/biz/healthcare' },
    clinic: { name: 'Medical office check-in', detail: 'Hartford HealthCare Medical Group · Hartford, CT', board: 'medoffice_ct_hartford', role: 'Patient', qr: 'clinic', path: '/ct/hartford/doctor/hhc' },
    townhall: { name: 'Hartford City Hall', detail: '550 Main St, Hartford, CT', board: 'civic_main', role: 'Visitor', qr: 'townhall', path: '/ct/hartford/townhall' },
    healthcare: { name: 'Healthcare locations', detail: 'Hospital, clinic and community care counters', board: 'loc_visit_healthcare_arrive', role: 'Visitor', qr: 'healthcare', path: '/biz/healthcare' },
    directory: { name: 'TinkyTown locations', detail: 'In-person and phone conversations', board: 'loc_visit_arrive', role: 'Visitor', qr: 'directory', path: '/biz' }
  };
  const civicEntrances = {
    civic_library:['library','Hartford public library'], civic_police:['police','Hartford police counter'],
    civic_town_clerk:['clerk','Hartford clerk'], civic_tax_office:['tax','Hartford tax office'],
    civic_probate_court:['probate','Hartford probate counter']
  };
  for(const [board,[id,name]] of Object.entries(civicEntrances)) {
    stations[id]={name,detail:'Hartford, Connecticut',board,role:'Visitor',qr:id,path:'/ct/hartford/'+id};
  }
  function stationBoard(station,id) {
    if(typeof id!=='string' || !/^[a-z0-9_]+$/.test(id)) return false;
    if(station.board.startsWith('civic_')) return id.startsWith('civic_');
    if(station===stations.clinic) return id.startsWith('medoffice_ct_hartford');
    if(station===stations.directory) return id.startsWith('loc_');
    if(station===stations.healthcare) return id === station.board || id.startsWith('loc_visit_biz_');
    return id.startsWith(station.board.replace(/arrive$/,''));
  }
  const ongoing = new WeakMap();
  const packs = new Map();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const asset = name => new URL('care-location-' + name, base).href;
  const colors = new Set(['blue','green','red','orange','purple','pink','yellow','teal','gray','indigo']);

  function loadPack(name) {
    if (!packs.has(name)) {
      packs.set(name, fetch(asset(name + '.json')).then(response => {
        if (!response.ok) throw new Error('Location boards unavailable');
        return response.json();
      }).catch(error => { packs.delete(name); throw error; }));
    }
    return packs.get(name);
  }

  function mount(root, initial = 'hospital', initialBoard) {
    ongoing.get(root)?.();
    const signal = new AbortController();
    let recognition = null;
    let disposed = false;
    let epoch = 0;
    let data;
    let boards = {};
    const requested = typeof initial === 'string' ? initial : initial?.location;
    let station = Object.hasOwn(stations,requested) ? stations[requested] : stations.hospital;
    if(station === stations.townhall && Object.hasOwn(civicEntrances,initialBoard)) station=stations[civicEntrances[initialBoard][0]];
    let mode = station === stations.directory && typeof initialBoard === 'string' && initialBoard.startsWith('loc_') && !initialBoard.startsWith('loc_visit_') ? 'gmb' : 'visit';
    let key = stationBoard(station,initialBoard) ? initialBoard : station.board;
    let history = [];
    let turns = [];
    let dialog = '';
    let search = '';
    let audible = true;
    let privateMessage = '';
    let lastRequest = null;
    let returnFocus = null;
    const className = 'care-location-app';
    root.innerHTML = '<section class="' + className + '" aria-label="TinkyTown location kiosk"><p class="cl-message" role="status">Opening location…</p></section>';
    const app = root.firstElementChild;
    const find = selector => app.querySelector(selector);
    const stationKey = () => Object.keys(stations).find(id => stations[id] === station);
    const screen = () => boards[key];
    const site = () => 'https://tinkytown.com' + station.path;

    function stopListening() {
      if (!recognition) return;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try { recognition.abort(); } catch (_) {}
      recognition = null;
    }

    function cleanup() {
      disposed = true;
      ++epoch;
      stopListening();
      if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
      signal.abort();
      ongoing.delete(root);
    }
    ongoing.set(root, cleanup);
    root.addEventListener('care:pause', () => {
      stopListening();
      if (dialog) closeDialog();
    }, {signal: signal.signal});

    function say(message) {
      if (!audible || !message || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) window.speechSynthesis.cancel();
      const words = new SpeechSynthesisUtterance(message);
      words.lang = 'en-US';
      window.speechSynthesis.speak(words);
    }

    function remember(role, message) {
      if (!message) return;
      turns.push({role, message});
      if (turns.length > 100) turns.shift();
    }

    function recordPrompt() {
      const prompt = screen()?.prompt;
      if (prompt) remember('Staff', prompt);
    }

    function button(action, label, extra = '') {
      return '<button type="button" class="cl-button" data-action="' + action + '" ' + extra + '>' + label + '</button>';
    }

    function reset(id, channel = 'visit') {
      station = stations[id] || stations.hospital;
      mode = channel;
      history = [];
      turns = [];
      dialog = '';
      search = '';
      privateMessage = '';
      stopListening();
      if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
      let entry = station.board;
      if (mode === 'gmb') entry = {directory:'loc_gmb_arrive',healthcare:'loc_clinic_arrive'}[id] || entry.replace('loc_visit_biz_', 'loc_biz_');
      return go(entry, {reset:true});
    }

    async function go(id, {reset = false, back = false, focus = false, initialEntry = false} = {}) {
      const token = ++epoch;
      lastRequest = () => go(id, {reset,back,focus,initialEntry});
      try {
        if (!data) {
          const core = await loadPack('boards');
          if (disposed || token !== epoch) return;
          data = core;
          boards = {...core.boards};
        }
        if (initialEntry && !boards[id] && station !== stations.directory) id = station.board;
        if (initialEntry && station === stations.healthcare && id !== station.board && !data.directory.visit.find(group=>group.board === station.board)?.venues.some(v=>id.startsWith(v.board.replace(/arrive$/,'')))) id=station.board;
        if (!boards[id]) {
          const extra = await loadPack(id.startsWith('loc_visit_') ? 'visit' : 'gmb');
          if (disposed || token !== epoch) return;
          Object.assign(boards, extra);
        }
        if (!boards[id] && initialEntry && id !== station.board) return go(station.board,{reset:true});
        if (!boards[id]) throw new Error('Unknown location board');
        if (!reset && !back && id !== key) history.push(key);
        key = id;
        dialog = '';
        privateMessage = '';
        if (!back) recordPrompt();
        render();
        if (focus) find('.cl-board-title')?.focus({preventScroll:true});
      } catch (_) {
        if (disposed || token !== epoch) return;
        app.innerHTML = '<div class="cl-message" role="alert">This location could not load. ' + button('retry','Try again') + ' <a href="' + escape(site()) + '" target="_blank" rel="noopener noreferrer">Open public kiosk ↗</a></div>';
      }
    }

    function previous() {
      if (dialog) return closeDialog();
      if (history.length) return go(history.pop(),{back:true,focus:true});
      if (key !== station.board && mode !== 'gmb') return reset(stationKey());
    }

    function tileMarkup(tile, i) {
      const color = colors.has(tile.color) ? tile.color : tile.action === 'back' ? 'gray' : /emergency|urgent/i.test(tile.label) ? 'red' : 'blue';
      return '<button type="button" class="cl-tile cl-' + color + '" data-tile="' + i + '"><span class="cl-emoji" aria-hidden="true">' +
        escape(tile.emoji || '💬') + '</span><span class="cl-tile-text">' + escape(tile.label) +
        (tile.detail ? '<small>' + escape(tile.detail) + '</small>' : '') + '</span></button>';
    }

    function drawOptions() {
      return Object.entries(stations).map(([id,s])=>'<option value="' + id + '"' + (station===s?' selected':'') + '>' + escape(s.name) + '</option>').join('');
    }

    function messageBox() {
      const latest = turns.at(-1);
      const prompt = latest?.role === 'Staff' ? latest.message : screen().prompt;
      const spoken = turns.filter(turn=>turn.role !== 'Staff').at(-1);
      if (!spoken && !prompt) return '';
      return '<div class="cl-exchange" aria-live="polite">' +
        (spoken ? '<div><strong>' + escape(spoken.role) + '</strong> ' + escape(spoken.message) + '</div>' : '') +
        (prompt ? '<div><strong>Staff</strong> ' + escape(prompt) + '</div>' : '') + '</div>';
    }

    function navMarkup() {
      return '<div class="cl-tools">' + button('text','Type a message') + button('staff','Staff reply') +
        button('history','Conversation' + (turns.length ? ' (' + turns.length + ')' : '')) + button('numbers','Numbers') + '</div>';
    }

    function render() {
      if (!screen() || disposed) return;
      const s = stationKey();
      const channelSwitch = !station.board.startsWith('civic_') && s !== 'clinic';
      const qrLabel = station.qr === 'healthcare' ? 'Healthcare kiosk' : station.qr === 'hospital' ? 'Hartford Hospital kiosk' : station.name;
      app.innerHTML = '<div class="cl-stations"><label>Location <select data-location>' + drawOptions() + '</select></label>' +
        (channelSwitch ? '<label>Conversation <select data-mode><option value="visit"' + (mode === 'visit'?' selected':'') + '>In person</option><option value="gmb"' + (mode==='gmb'?' selected':'') + '>By phone</option></select></label>' : '') +
        '<div class="cl-present">' + button('qr','Phone QR') + '<a class="cl-button" href="' + escape(site()) + '" target="_blank" rel="noopener noreferrer" aria-label="Open ' + escape(qrLabel) + ' on TinkyTown.com">Open kiosk ↗</a></div></div>' +
        '<div class="cl-surface"><header class="cl-header"><div><h3>' + escape(station.name) + '</h3><p>' + escape(station.detail) + '</p></div>' +
        button('sound',audible?'Sound on':'Sound off','aria-pressed="' + audible + '"') + '</header><div class="cl-content"><div class="cl-crumbs">' +
        (history.length ? button('back','← Back') : '') + (history.length ? button('home','Home') : '') +
        '<h4 class="cl-board-title" tabindex="-1">' + escape(screen().title) + '</h4></div>' +
        messageBox() +
        (s==='directory' ? '<label class="cl-search-label">Find a location<input type="search" data-search autocomplete="off" placeholder="Search by venue or category" value="' + escape(search) + '"></label>' : '') +
        '<div class="cl-grid" aria-label="Communication tiles"></div>' + navMarkup() + '</div></div><div class="cl-sheet"></div>';
      drawTiles();
      if (dialog) drawDialog();
    }

    function drawTiles() {
      const grid = find('.cl-grid');
      if (!grid) return;
      if (!search.trim() || station !== stations.directory) {
        grid.innerHTML = screen().tiles.map(tileMarkup).join('');
        return;
      }
      const text = search.trim().toLowerCase();
      const matches = [];
      for (const group of data.directory[mode]) {
        if (group.name.toLowerCase().includes(text)) matches.push({name:group.name,board:group.board,emoji:group.emoji});
        for(const venue of group.venues) if (venue.name.toLowerCase().includes(text)) matches.push({...venue,category:group.name});
      }
      grid.innerHTML = matches.length ? matches.map(v=>'<button type="button" class="cl-tile cl-blue" data-target="' + escape(v.board) + '"><span class="cl-emoji" aria-hidden="true">' + escape(v.emoji) + '</span><span class="cl-tile-text">' + escape(v.name) +
        (v.category?'<small>' + escape(v.category) + '</small>':'')+'</span></button>').join('') : '<p class="cl-message" role="status">No matching locations.</p>';
    }

    function openDialog(kind, focusSelector) {
      returnFocus = document.activeElement;
      dialog = kind;
      drawDialog();
      const field = find(focusSelector || '.cl-panel h4');
      field?.focus({preventScroll:true});
      find('.cl-panel')?.scrollIntoView?.({block:'nearest'});
    }

    function closeDialog() {
      stopListening();
      privateMessage = '';
      dialog = '';
      find('.cl-sheet')?.replaceChildren();
      if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }

    function drawDialog() {
      const sheet = find('.cl-sheet');
      let title, body;
      if (dialog === 'qr') {
        title = 'Open on a phone';
        const note = station.qr === 'healthcare' ? 'Scan to open the healthcare kiosk on TinkyTown.com and choose the care setting.' :
          'Scan to open this public TinkyTown kiosk on your own device.';
        body = '<div class="cl-qr"><img width="176" height="176" src="' + asset('qr-'+station.qr+'.png') + '" alt="QR code for the public location"><div><p>' + note + '</p><a href="' + escape(site()) + '" target="_blank" rel="noopener noreferrer">' + escape(site().replace('https://','')) + ' ↗</a></div></div>';
      } else if (dialog === 'history') {
        title = 'Conversation';
        body = (turns.length ? '<ol class="cl-turns">' + turns.map(t=>'<li><strong>' + escape(t.role) + '</strong><span>' + escape(t.message) + '</span></li>').join('') + '</ol>' : '<p>No messages yet.</p>') + button('new','Start a new visit');
      } else if (dialog === 'language') {
        title = 'My language';
        body = '<p>Choose your language to ask the counter staff for an interpreter.</p><form data-form="language"><label>Language<select name="language">' +
          data.languages.map(l=>'<option value="' + escape(l.code) + '">' + escape(l.native + ' · ' + l.name) + '</option>').join('') + '</select></label><button class="cl-button cl-primary">Show my request</button></form>';
      } else if (dialog === 'show') {
        title = 'Show staff';
        body = '<p class="cl-large-message">' + escape(privateMessage) + '</p>';
      } else if (dialog === 'external') {
        title = 'Public kiosk';
        body = '<p>' + escape(privateMessage) + '</p><a class="cl-button" href="' + escape(site()) + '" target="_blank" rel="noopener noreferrer">Open full kiosk ↗</a>';
      } else {
        const staff = dialog === 'staff';
        const numeric = dialog === 'numbers' || dialog === 'date';
        title = staff ? 'Staff reply' : numeric ? dialog === 'date' ? 'Enter a date' : 'Enter a number' : 'Your message';
        body = '<form data-form="message"><label>' + (staff?'What did staff say?':numeric?'Show the counter staff':'What would you like to say?') +
          '<input name="words" type="' + (dialog==='date'?'date':'text') + '"' + (dialog==='numbers'?' inputmode="numeric"':'') +
          ' maxlength="500" autocomplete="off" required></label><button class="cl-button cl-primary">Add to conversation</button></form>' +
          (staff && screen().prompt ? button('staff-prompt','Use the counter prompt') : '') +
          (!numeric && (window.SpeechRecognition || window.webkitSpeechRecognition) ? button('listen',staff?'Listen for staff':'Speak a message') : '') +
          '<p class="cl-status" role="status"></p>';
      }
      sheet.innerHTML = '<section class="cl-panel" role="region" aria-label="' + escape(title) + '"><div class="cl-panel-head"><h4 tabindex="-1">' + escape(title) + '</h4>' + button('close','Close') + '</div>' + body + '</section>';
    }

    function addText(message, staff) {
      const trimmed = message.trim().slice(0,500);
      if (!trimmed) return;
      remember(staff?'Staff':station.role,trimmed);
      say(trimmed);
      stopListening();
      dialog='history';
      render();
      find('.cl-panel h4')?.focus({preventScroll:true});
    }

    function listen() {
      if (recognition) return;
      const Engine = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Engine) return;
      const status = find('.cl-status');
      const field = find('input[name="words"]');
      const recorder = new Engine();
      recognition = recorder;
      recorder.lang = 'en-US';
      recorder.interimResults = false;
      recorder.onresult = event => {
        if (disposed || !field?.isConnected) return;
        field.value = event.results[0][0].transcript.slice(0,500);
        status.textContent = 'Review the words, then add them to the conversation.';
        field.focus();
      };
      recorder.onerror = () => { if(status.isConnected) status.textContent='Microphone unavailable. Type your message.'; };
      recorder.onend = () => { recognition=null; };
      try { recorder.start(); status.textContent='Listening…'; }
      catch (_) { recognition=null; status.textContent='Type the message to continue.'; }
    }

    function follow(target) {
      if (station.board.startsWith('civic_') && station !== stations.townhall && target === 'civic_main') return reset('townhall');
      if (station !== stations.directory && (target === 'loc_visit_arrive' || target === 'loc_gmb_arrive')) return reset('directory',mode);
      if (![stations.directory,stations.healthcare].includes(station) && (target === 'loc_visit_healthcare_arrive' || target === 'loc_clinic_arrive')) return reset('healthcare',mode);
      return go(target,{focus:true});
    }

    function choose(tile) {
      if (!tile) return;
      switch(tile.action) {
        case 'back': if(history.length) return previous(); if (tile.next) return follow(tile.next); return reset(stationKey(),mode);
        case 'go_home': return reset(stationKey(),mode);
        case 'language_picker': return openDialog('language','.cl-panel select');
        case 'focus_input': return openDialog('text','.cl-panel input');
        case 'listen_for_staff': return openDialog('staff','.cl-panel input');
        case 'number_pad_digits': return openDialog('numbers','.cl-panel input');
        case 'number_pad_date': return openDialog('date','.cl-panel input');
        case 'show_for_staff': privateMessage=tile.say || tile.label; return openDialog('show');
        case 'open_url':
        case 'report_911': privateMessage=tile.label + ' is shown for this demonstration. No call or message is sent.'; return openDialog('show');
        case 'library_search':
        case 'translate_sign': privateMessage=tile.label + ' is available in the full public kiosk.'; return openDialog('external');
      }
      const message=tile.say || tile.label;
      if (!tile.quiet) { remember(station.role,message); say(message); }
      if (tile.next) follow(tile.next);
      else {
        render();
        find('.cl-exchange')?.scrollIntoView?.({block:'nearest'});
      }
    }

    app.addEventListener('change',e=>{
      if(e.target.matches('[data-location]')) reset(e.target.value);
      if(e.target.matches('[data-mode]')) reset(stationKey(),e.target.value);
    },{signal:signal.signal});
    app.addEventListener('input',e=>{ if(e.target.matches('[data-search]')) {search=e.target.value; drawTiles();} },{signal:signal.signal});
    app.addEventListener('keydown',e=>{ if(e.key==='Escape' && dialog){e.preventDefault();closeDialog();} },{signal:signal.signal});
    app.addEventListener('submit',e=>{
      const form=e.target.closest('[data-form]');
      if(!form) return;
      e.preventDefault();
      if (form.dataset.form==='language') {
        const lang=data.languages.find(l=>l.code===form.elements.language.value);
        if(lang) addText('I speak '+lang.name+'. I would like an interpreter, please.',false);
      } else addText(form.elements.words.value,dialog==='staff');
    },{signal:signal.signal});
    app.addEventListener('click',e=>{
      const control=e.target.closest('button');
      if(!control) return;
      if(control.hasAttribute('data-tile')) return choose(screen()?.tiles[Number(control.dataset.tile)]);
      if(control.dataset.target){search=''; return go(control.dataset.target,{focus:true});}
      const action=control.dataset.action;
      if(action==='retry') return lastRequest?.();
      if(action==='back') return previous();
      if(action==='home' || action==='new') return reset(stationKey(),mode);
      if(action==='close') return closeDialog();
      if(action==='sound'){
        audible=!audible;
        if(!audible && window.speechSynthesis) window.speechSynthesis.cancel();
        control.textContent=audible?'Sound on':'Sound off';
        control.setAttribute('aria-pressed',String(audible));
        return;
      }
      if(action==='listen') return listen();
      if(action==='staff-prompt') return addText(screen().prompt,true);
      if(['qr','history','numbers','text','staff'].includes(action)) openDialog(action,
        ['text','staff','numbers'].includes(action)?'.cl-panel input':undefined);
    },{signal:signal.signal});
    go(key,{reset:true,initialEntry:true});
    return cleanup;
  }
  window.CareLocations={mount,unmount:root=>ongoing.get(root)?.()};
})();
