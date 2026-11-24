// Shapes every demo location into the { places, pool } pack the kiosk draws.
(() => {
  'use strict';
  const files = new Map();
  function read(path) {
    if (!files.has(path)) {
      files.set(path, fetch(path).then(response => {
        if (!response.ok) throw new Error('Venue boards unavailable.');
        return response.json();
      }).catch(error => { files.delete(path); throw error; }));
    }
    return files.get(path);
  }
  const swatches = { blue:[37,99,235],green:[22,163,74],red:[220,38,38],orange:[234,88,12],purple:[124,58,237],pink:[219,39,119],yellow:[202,138,4],teal:[13,148,136],gray:[107,114,128],indigo:[67,56,202] };
  function named(hex) {
    const digits = /^#?([0-9a-f]{6})/i.exec(hex || '')?.[1];
    if (!digits) return 'blue';
    const rgb = [0,2,4].map(i => parseInt(digits.slice(i,i+2),16));
    const gap = color => color.reduce((sum,v,i) => sum + (v - rgb[i]) ** 2, 0);
    return Object.keys(swatches).reduce((best,name) => gap(swatches[name]) < gap(swatches[best]) ? name : best);
  }
  // A link to a board that did not ship still speaks. It just stays put.
  function place(boards, key, name, address, main, { keep = [], ...extra } = {}) {
    const named = { main: boards[main] };
    const queue = [main, ...keep], seen = new Set(queue);
    while (queue.length) {
      const id = queue.shift();
      named[id] = boards[id];
      for (const tile of boards[id].tiles) {
        const next = tile.navigateTo;
        if (next && boards[next] && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return { key, name, address, ...extra, named };
  }
  function pack(places) {
    const pool = [], at = new Map();
    const packed = places.map(({ named, ...rest }) => {
      const boards = {};
      for (const [id, board] of Object.entries(named)) {
        if (!at.has(board)) {
          at.set(board, pool.length);
          pool.push(board);
        }
        boards[id] = at.get(board);
      }
      return { ...rest, boards };
    });
    return { places: packed, pool };
  }
  function shape(boards, convert) {
    return Object.fromEntries(Object.entries(boards).filter(([, board]) => board.tiles?.length).map(([id, board]) =>
      [id, { title: board.title || board.name, prompt: board.prompt, tiles: board.tiles.map(convert) }]));
  }
  const locationTile = tile => ({ emoji: tile.emoji, label: tile.label, subtitle: tile.detail, spokenText: tile.say ?? tile.label,
    color: tile.color || (tile.action === 'back' ? 'gray' : 'blue'), navigateTo: tile.next, silent: tile.quiet,
    action: tile.action === 'listen_for_staff' ? 'caption_teller' : tile.action });
  const facilityTile = tile => ({ emoji: tile.icon, label: tile.label, spokenText: tile.say, color: tile.ink ? named(tile.ink) : 'blue', navigateTo: tile.next });
  const libraryTile = tile => ({ emoji: tile.emoji, label: tile.label, spokenText: tile.spokenText, color: named(tile.colorHex), navigateTo: tile.navigateTo,
    action: /^(go )?back$/i.test(tile.label) ? 'back' : undefined });
  async function locations(...extra) {
    const [core, ...more] = await Promise.all(['boards', ...extra].map(name => read('/care-location-' + name + '.json')));
    return shape(Object.assign({}, ...more, core.boards), locationTile);
  }
  function menu(title, entries) {
    return { title, tiles: entries.map(([id, board, emoji]) => ({ emoji: emoji || board.tiles[0].emoji, label: plain(board.title),
      spokenText: '', color: 'blue', navigateTo: id })) };
  }
  const plain = text => String(text || '').replace(/^[^\p{L}\p{N}]+/u, '');

  const libraryNames = { core:['💬','Everyday life'],emotion_reasons:['😊','Feelings'],location:['📍','Places'],school:['🎒','School'],venues:['🍔','Restaurant menus'],story:['📖','Social stories'],number:['🔢','Numbers'],packs:['⭐','Skills & activities'] };
  async function library() {
    const catalog = (await read('/care-library-catalog.json')).boards;
    const groups = [...new Set(catalog.map(item => item.category))];
    const raw = Object.assign({}, ...await Promise.all(groups.map(name => read('/care-library-' + name + '.json'))));
    const key = (id, category) => raw[id] ? id : catalog.find(item => item.id === id && item.category === category)?.key || catalog.find(item => item.id === id)?.key;
    const boards = {};
    for (const [id, board] of Object.entries(shape(raw, libraryTile))) {
      const category = id.split('/')[0];
      boards[id] = { ...board, title: plain(board.title), tiles: board.tiles.map(tile => ({ ...tile, navigateTo: tile.navigateTo && key(tile.navigateTo, category) })) };
    }
    return { boards, groups, catalog };
  }

  // TinkyStroke, carried over from the Android app. care-tinkystroke.json is read from its Kotlin,
  // so every label and phrase here is the app's own.
  async function tinkyStroke() {
    const [app, catalog] = await Promise.all([read('/care-tinkystroke.json'), read('/sales-demo-boards.json')]);
    const boards = {};
    const strip = app.strip.map(tile => ({ emoji: tile.emoji, label: tile.label, spokenText: tile.say, color: 'red' }));
    const add = (id, title, tiles, extra) => { boards[id] = { title, strip, tiles, ...extra }; };
    const say = (tile, color = 'blue') => ({ emoji: tile.emoji, label: tile.label, spokenText: tile.say, color, navigateTo: /^(yes|no)$/i.test(tile.label) ? undefined : 'ts_after' });
    const open = (tile, navigateTo, color = 'blue', extra) => ({ emoji: tile.emoji, label: tile.label + ' ›', spokenText: '', color, navigateTo, ...extra });
    const tools = { talk_together: 'talk', vitals: 'nurse', patient_info: 'profile' };
    const home = tile => {
      if (tile.label === 'Yes') return say(tile, 'green');
      if (tile.label === 'No') return say(tile, 'red');
      if (tile.open) return open(tile, 'ts_' + tile.open, 'blue', { diet: { food: 'food', drinks: 'drink' }[tile.open] });
      if (tools[tile.tool]) return open(tile, undefined, 'blue', { action: 'stroke_tool', tool: tools[tile.tool] });
      if (tile.tool) return open(tile, undefined, 'blue', { action: 'number_pad' });
      if (tile.topic) return /symptom/.test(tile.topic) ? open(tile, 'ts_board_stroke_symptoms') : open(tile, undefined, 'blue', { action: 'stroke_tool', tool: 'profile' });
      return say(tile);
    };
    const pain = { emoji: '🩺', label: 'Pain Scale', spokenText: '', color: 'orange', navigateTo: 'ts_pain', wide: true };
    for (const [id, tiles] of Object.entries(app.tiers)) add('ts_' + id, 'TinkyStroke', [...tiles.map(home), pain]);
    for (const [id, board] of Object.entries(app.boards)) add('ts_' + id, board.title, board.tiles.map(tile => say(tile)));
    boards.ts_nurse.tiles.unshift({ emoji: '🚨', label: plain(app.nurse.urgent), spokenText: app.nurse.alert, color: 'red', navigateTo: 'ts_alert', wide: true },
      { emoji: '👩‍⚕️', label: plain(app.nurse.tools), spokenText: '', color: 'indigo', action: 'stroke_tool', tool: 'nurse', wide: true });
    add('ts_alert', app.nurse.sounded, app.nurse.followUps.map(tile => tile.say === '__NURSE_ALERT__' ? { ...say(tile, 'red'), spokenText: app.nurse.alert, navigateTo: 'ts_alert' }
      : tile.say === '__BACK_TO_TILES__' ? { emoji: tile.emoji, label: tile.label, spokenText: '', color: 'gray', navigateTo: 'ts_hospital' } : say(tile)), { notice: app.nurse.show });
    // How much → what kind → where, one tap each.
    const tones = level => level < 3 ? 'green' : level < 6 ? 'yellow' : level < 8 ? 'orange' : 'red';
    add('ts_pain', 'How much pain?', app.pain.levels.map(p => ({ emoji: p.emoji, label: p.level + ' · ' + p.label, spokenText: '', color: tones(p.level), navigateTo: 'ts_pain_' + p.level })));
    for (const { level } of app.pain.levels) {
      add('ts_pain_' + level, 'Pain ' + level + '/10 — What kind?', [...app.pain.kinds.map((kind, i) => ({ emoji: kind.emoji, label: kind.label, spokenText: '', color: 'blue', navigateTo: 'ts_pain_' + level + '_' + i })),
        { emoji: '✅', label: 'JUST SAY ' + level + '/10', spokenText: level === 0 ? 'I have no pain right now' : 'My pain is a ' + level + ' out of 10', color: 'indigo', navigateTo: 'ts_after', wide: true }], { unlisted: true });
      app.pain.kinds.forEach((kind, i) => add('ts_pain_' + level + '_' + i, level + '/10 ' + kind.descriptor + ' — Where?', app.pain.places.map(where => ({ emoji: where.emoji, label: where.label,
        spokenText: 'I have ' + kind.descriptor + ' pain at level ' + level + ' in ' + where.location + '.', color: 'blue', navigateTo: 'ts_after' })), { unlisted: true }));
    }
    const actions = [['replay','teal'],['wrong_one','red'],['caption_teller','purple'],['keep_talking','blue'],['see','teal'],['done','gray']];
    add('ts_after', 'What next?', app.after.map((words, i) => ({ emoji: words.split(' ')[0], label: plain(words), color: actions[i][1], action: actions[i][0],
      tool: 'talk', navigateTo: actions[i][0] === 'done' ? 'ts_hospital' : undefined })), { unlisted: true, answers: false });
    const library = [...app.saved.map(board => ['ts_board_' + board.id, board.emoji, board.title, board.tiles]),
      ...catalog.stroke.filter(board => !/^quick_|^basic_needs$|^stroke_answers$|^stroke_pain_scale$/.test(board.id)).map(board => ['ts_board_asset_' + board.id, board.tiles[0].emoji, plain(board.title),
        board.tiles.filter(tile => !/^(GO BACK|ADD NEW)$/.test(tile.label)).map(tile => ({ emoji: tile.emoji, label: tile.label, say: tile.spokenText }))])];
    for (const [id, , title, tiles] of library) add(id, title, tiles.map(tile => say(tile)));
    add('ts_boards', 'Boards', library.map(([id, emoji, title]) => ({ emoji, label: title, spokenText: '', color: 'blue', navigateTo: id })));
    return boards;
  }
  async function bedside() {
    const [resident, stroke] = await Promise.all([read('/care-kiosks/nursing-home.json'), tinkyStroke()]);
    const boards = Object.fromEntries(Object.entries(resident.places[0].boards).map(([id, i]) => [id, resident.pool[i]]));
    const my = boards.senior_resident;
    boards.senior_resident = { ...my, tiles: [my.tiles[0], { emoji: '🧠', label: 'I had a stroke', spokenText: 'I had a stroke. I use this board to talk.', color: 'purple', navigateTo: 'ts_hospital' }, ...my.tiles.slice(1)] };
    return Object.assign(boards, stroke);
  }

  const hartfordHospital = { phone: '(860) 545-5000', hours: 'Open 24 hours' };
  const sources = {
    async hospital() {
      const [kiosks, rooms] = await Promise.all([read('/care-facility-kiosks.json'), read('/care-facility-data.json')]);
      const desk = shape({ ...rooms.boards, ...kiosks }, facilityTile);
      const [health, room] = await Promise.all([locations(), bedside()]);
      Object.assign(desk, room);
      desk.loc_hospital_arrive = { ...desk.loc_hospital_arrive, tiles: [
        { emoji: '🛏️', label: 'In my room', spokenText: 'I am in my room.', color: 'green', navigateTo: 'senior_resident' },
        { emoji: '🧠', label: 'I had a stroke', spokenText: 'I had a stroke. I use this board to talk.', color: 'purple', navigateTo: 'ts_hospital' },
        ...desk.loc_hospital_arrive.tiles] };
      const address = '80 Seymour Street, Hartford, CT 06102';
      return pack([
        place(desk, 'desk', 'Hospital — Hartford Hospital Hartford', address, 'loc_hospital_arrive', hartfordHospital),
        place(health, 'healthcare', 'Healthcare — Hartford Hospital Hartford', address, 'loc_visit_healthcare_arrive', hartfordHospital),
      ]);
    },
    async 'nursing-home'() {
      const boards = await bedside(), health = await locations();
      return pack([
        place(boards, 'resident', 'Nursing Home — In My Room', 'Bedside communication', 'senior_resident', { bedside: true, keep: ['ts_boards'] }),
        place(boards, 'stroke', 'Nursing Home — TinkyStroke', 'Bedside communication', 'ts_hospital', { bedside: true, keep: ['ts_boards'] }),
        place(health, 'visitor', 'Nursing Home — Visitor', 'Front desk', 'loc_visit_biz_nursing_home_arrive'),
        place(health, 'assisted', 'Assisted Living — Visitor', 'Front desk', 'loc_visit_biz_assisted_living_facility_arrive'),
      ]);
    },
    async bedside() {
      const boards = await bedside();
      return pack([
        place(boards, 'stroke', 'Bedside — TinkyStroke', 'Stroke communication', 'ts_hospital', { bedside: true, keep: ['ts_boards'] }),
        place(boards, 'resident', 'Bedside — In My Room', 'Bedside communication', 'senior_resident', { bedside: true, keep: ['ts_boards'] }),
      ]);
    },
    async stroke() {
      const boards = await tinkyStroke();
      return pack([
        place(boards, 'ward', 'TinkyStroke — Ward stay', 'Stroke ward', 'ts_hospital', { bedside: true, keep: ['ts_boards'] }),
        place(boards, 'acute', 'TinkyStroke — First hours', 'ER and ICU', 'ts_acute', { bedside: true, keep: ['ts_boards'] }),
        place(boards, 'recovery', 'TinkyStroke — Recovery', 'Rehab and home', 'ts_full', { bedside: true, keep: ['ts_boards'] }),
      ]);
    },
    async 'senior-center'() {
      const community = await read('/care-kiosks/community.json');
      return { ...community, places: community.places.filter(item => item.key === 'senior') };
    },
    async townhall() { return pack([place(await locations(), 'townhall', 'Hartford City Hall', '550 Main St, Hartford, CT', 'civic_main')]); },
    async library() { return pack([place(await locations(), 'library', 'Hartford Public Library', 'Hartford, Connecticut', 'civic_library')]); },
    async police() { return pack([place(await locations(), 'police', 'Hartford Police Front Desk', 'Hartford, Connecticut', 'civic_police')]); },
    async clinic() { return pack([place(await locations(), 'clinic', 'Medical Office — Hartford HealthCare Medical Group', 'Hartford, CT', 'medoffice_ct_hartford')]); },
    async directory() {
      const boards = await locations('visit');
      return pack([place(boards, 'visit', 'TinkyTown — Visiting a Place', '', 'loc_visit_arrive')]);
    },
    async home() { return pack([place((await library()).boards, 'home', 'Home & Family', 'Daily routines', 'core/main_board')]); },
    async school() { return pack([place((await library()).boards, 'school', 'School', 'Classroom, nurse and play', 'school/school_board')]); },
    async restaurants() { return pack([place((await library()).boards, 'restaurants', 'Restaurants', 'Choose a restaurant', 'core/restaurants_board')]); },
    async boards() {
      const { boards, groups, catalog } = await library();
      for (const group of groups) {
        boards['group/' + group] = menu(libraryNames[group]?.[1] || group, catalog.filter(item => item.category === group && boards[item.key]).map(item => [item.key, boards[item.key]]));
      }
      boards.all = { title: 'All picture boards', tiles: groups.map(group => ({ emoji: libraryNames[group]?.[0] || '💬', label: libraryNames[group]?.[1] || group, spokenText: '', color: 'blue', navigateTo: 'group/' + group })) };
      return pack([place(boards, 'boards', 'All Picture Boards', 'TinkyTown board library', 'all')]);
    },
  };
  function quickHelp(boards) {
    const tile = (label, emoji, spokenText, color, extras = {}) => ({label, emoji, spokenText, color, ...extras});
    const from = (board, label, color) => {
      const original = boards[board].tiles.find(item => item.label === label);
      return tile(original.label, original.emoji, original.say, color);
    };
    const privateNote = (label, emoji, text) => tile(label, emoji, text, 'purple', {action:'show_for_staff', silent:true});
    const call911 = from('civic_emergency', 'Call 911', 'red');
    return {
      kiosk_help: { title:'Help & safety', tiles:[
        call911,
        tile('Medical emergency','🚑','I need medical help.','red',{navigateTo:'kiosk_help_medical'}),
        tile('Report abuse or neglect','🛡️','','purple',{navigateTo:'kiosk_help_private'}),
        tile('Get staff','🙋','Please get a staff member to help me.','blue'),
        from('civic_help','Interpreter','blue'),
        from('civic_help','Wheelchair / Mobility','blue'),
        from('civic_emergency','Fire','red'),
        from('civic_emergency','Police','red'),
        from('civic_help',"I'm in Crisis",'purple'),
        tile('Private help','🤫','','purple',{navigateTo:'kiosk_help_private'}),
      ] },
      kiosk_help_medical: { title:'Medical emergency', tiles:[
        call911,
        ...["Can't breathe","Bleeding","Unconscious","Severe pain","Seizure"].map(label => from('civic_emergency_medical',label,'red')),
        ...['Heart attack','Injury','Choking','Stroke'].map(label => from('civic_emergency',label,'red')),
      ] },
      kiosk_help_private: { title:'Private help', private:true, answers:false, tiles:[
        privateNote('Talk privately','🤫','Please take me somewhere private so I can ask for help.'),
        privateNote('Abuse','🛡️','Someone is hurting me. I need to talk to someone I trust in private.'),
        privateNote('Neglect','🤲','I am not getting the care or help I need. Please help me speak to someone in private.'),
        privateNote('Someone else is being hurt','👥','I am worried that someone else is being hurt or neglected. I need to speak to someone in private.'),
        privateNote('In danger now','⚠️','I am in immediate danger and cannot speak freely. Please call 911.'),
      ] },
    };
  }

  async function load(family) {
    const [loaded, app, location] = await Promise.all([Object.hasOwn(sources, family) ? sources[family]() : read('/care-kiosks/' + encodeURIComponent(family) + '.json'),
      read('/care-tinkystroke.json'), read('/care-location-boards.json')]);
    const pool = [...loaded.pool];
    const safety = {};
    for (const [id, board] of Object.entries(quickHelp(location.boards))) {
      safety[id] = pool.push({ ...board, unlisted:true }) - 1;
    }
    const places = loaded.places.map(place => ({ ...place, boards:{ ...place.boards, ...safety } }));
    return { ...loaded, pool, places, diet: app.diet, controls: app.controls };
  }
  window.CareKioskPacks = { load, read };
})();
