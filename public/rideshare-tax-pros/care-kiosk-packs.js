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
  function place(boards, key, name, address, main, extra = {}) {
    const named = { main: boards[main] };
    const queue = [main], seen = new Set(queue);
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

  // What a person in bed needs first. Aphasia can leave someone knowing exactly
  // what they mean, so the board opens with ways to slow the conversation down.
  async function bedside() {
    const resident = await read('/care-kiosks/nursing-home.json');
    const boards = Object.fromEntries(Object.entries(resident.places[0].boards).map(([id, i]) => [id, resident.pool[i]]));
    const stroke = shape(Object.fromEntries((await read('/sales-demo-boards.json')).stroke.map(board => [board.id, board])),
      tile => ({ ...libraryTile(tile), navigateTo: tile.navigateTo === 'main_board' ? 'stroke_home' : tile.navigateTo }));
    for (const board of Object.values(stroke)) board.title = plain(board.title);
    const say = (emoji, label, spokenText, navigateTo, color = 'blue') => ({ emoji, label, spokenText, navigateTo, color });
    Object.assign(boards, stroke, {
      stroke_home: { title: 'I had a stroke', tiles: [
        say('🚨','Nurse NOW','I need a nurse right now.','senior_urgent','red'),
        say('💬','I know what I want to say','I know what I want to say. The words will not come out.',undefined,'purple'),
        say('⏳','Give me time','Please give me time. I am thinking.',undefined,'purple'),
        say('❓','Ask me yes or no','Please ask me questions I can answer with yes or no.',undefined,'purple'),
        say('🐢','Slow down','Please speak slowly, one thing at a time.',undefined,'purple'),
        say('🫨','Something changed','Something feels different right now. Please check me.','quick_symptoms','red'),
        say('🤕','Pain','I have pain.','pain_body_board','orange'),
        say('🚽','Bathroom','I need help with the bathroom.','senior_bathroom'),
        say('💧','Food & drink','I would like something to eat or drink.','senior_food','green'),
        say('🛏️','Comfort','I am not comfortable.','senior_comfort','teal'),
        say('💪','My arm or leg','I want to talk about my arm or my leg.','stroke_mobility_recovery','teal'),
        say('💊','Medicine','I want to talk about my medicine.','senior_meds','purple'),
        say('😰','How I feel','I want to tell you how I feel.','quick_feelings','pink'),
        say('👨‍👩‍👧','My family','I want to talk about my family.','senior_family','green'),
        say('🧑‍⚕️','Talk to someone','I would like to talk to someone.','senior_staff','indigo'),
        say('🌐','More stroke boards','','stroke_boards','gray'),
      ] },
    });
    boards.stroke_boards = menu('Stroke boards', Object.entries(stroke));
    const my = boards.senior_resident;
    boards.senior_resident = { ...my, tiles: [my.tiles[0], say('🧠','I had a stroke','I had a stroke. I use this board to talk.','stroke_home','purple'), ...my.tiles.slice(1)] };
    return boards;
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
        { emoji: '🧠', label: 'I had a stroke', spokenText: 'I had a stroke. I use this board to talk.', color: 'purple', navigateTo: 'stroke_home' },
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
        place(boards, 'resident', 'Nursing Home — In My Room', 'Bedside communication', 'senior_resident'),
        place(boards, 'stroke', 'Nursing Home — After a Stroke', 'Bedside communication', 'stroke_home'),
        place(health, 'visitor', 'Nursing Home — Visitor', 'Front desk', 'loc_visit_biz_nursing_home_arrive'),
        place(health, 'assisted', 'Assisted Living — Visitor', 'Front desk', 'loc_visit_biz_assisted_living_facility_arrive'),
      ]);
    },
    async bedside() {
      const boards = await bedside();
      return pack([
        place(boards, 'stroke', 'Bedside — After a Stroke', 'Scanned in the room', 'stroke_home'),
        place(boards, 'resident', 'Bedside — In My Room', 'Scanned in the room', 'senior_resident'),
      ]);
    },
    async stroke() {
      return pack([place(await bedside(), 'bedside', 'TinkyStroke', 'Stroke ward and bedside communication', 'stroke_home')]);
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
  async function load(family) {
    return Object.hasOwn(sources, family) ? sources[family]() : read('/care-kiosks/' + encodeURIComponent(family) + '.json');
  }
  window.CareKioskPacks = { load, read };
})();
