/* In-session TinkyTown pilot plans. Export and print are explicit presenter actions. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript?.src || new URL('/care-pilot.js', location.href));
  const official = 'https://tinkytown.com';
  const places = {
    hospital: ['Hospital', 'Reception & admissions|Stroke ward|Patient room|Discharge planning', 'A patient chooses how to describe discomfort and asks for the discharge instructions in writing.'],
    'nursing-home': ['Nursing home', 'Resident room|Nurses’ station|Dining room|Memory care', 'A resident chooses a meal, asks for a change, and confirms the choice with a staff member.'],
    'senior-center': ['Senior center', 'Welcome & membership|Transportation|Meals & nutrition|Programs & activities', 'A member chooses a ride, explains the destination, and asks staff to confirm pickup.'],
    stroke: ['TinkyStroke', 'Stroke ward|Patient room|Rehabilitation|Discharge planning', 'A person points to a need, asks for more time, and confirms the message with a communication partner.'],
    townhall: ['Town hall', 'Welcome desk|Town clerk|Tax office|Probate counter', 'A visitor chooses a department, asks which document to bring, and confirms the next counter.'],
    directory: ['Venue directory', 'Entrance|Information desk|Service counter', 'A visitor finds the right counter and explains what they came to do.'],
    college: ['College or university', 'Student services|Financial aid|Registrar|Campus dining', 'A student asks about a form, requests help completing it, and checks where to return it.'],
    airport: ['Airport', 'Airline check-in|Security assistance|Gate desk|Baggage claim', 'A passenger asks for gate directions and confirms where to meet assistance.'],
    home: ['Home & family', 'Kitchen|Family room|Bedside', 'A person chooses a meal or activity and a family member confirms the choice.'],
    school: ['School', 'Front office|Classroom|School nurse|Cafeteria', 'A student uses a board to request help and shows a staff member which support they prefer.'],
    restaurants: ['Restaurant', 'Host stand|Ordering counter|Dining table|Pickup counter', 'A guest chooses an item, requests a change, and confirms the order before checkout.'],
    boards: ['Picture boards', 'Welcome area|Activity space|Shared device', 'A participant selects a familiar board, chooses a message, and confirms it with a partner.'],
    community: ['Community & transit', 'Information desk|Transit stop|Ticket counter', 'A traveler asks about a route and checks where to get off.'],
    bank: ['Bank', 'Welcome desk|Teller window|Member services', 'A customer chooses a service and asks which documents are needed.'],
    grocery: ['Grocery store', 'Service desk|Deli counter|Checkout', 'A shopper asks where to find an item and checks that the cashier understood.'],
    hotel: ['Hotel', 'Reception|Concierge|Breakfast room|Guest services', 'A guest checks in, asks about an accessible room, and confirms the directions.'],
    pharmacy: ['Pharmacy', 'Drop-off counter|Prescription pickup|Consultation window', 'A visitor asks to speak with the pharmacist and chooses how to communicate at the counter.'],
    dmv: ['Motor vehicles', 'Information desk|License counter|Vehicle registration', 'A visitor chooses a transaction and asks which form to complete.'],
    usps: ['Post office', 'Service counter|Parcel pickup|Mailing supplies', 'A customer explains the mailing service they need and confirms the mailing option.'],
    clinic: ['Medical office', 'Reception|Waiting room|Exam room', 'A visitor checks in and asks the receptionist what happens next.'],
    library: ['Library', 'Welcome desk|Circulation counter|Program room', 'A patron asks for a library card and chooses a program.'],
    police: ['Police front desk', 'Public entrance|Non-emergency desk|Records counter', 'A visitor selects a non-emergency service and confirms the next step with staff.'],
    guide: ['Guided walkthrough', 'Welcome desk|Service counter|Shared device', 'A visitor requests a service and confirms their preference with a partner.']
  };
  const qrTargets = {
    hospital: ['hospital','/biz/healthcare/hartford-hospital-hartford','Hartford Hospital kiosk'],
    'nursing-home': ['healthcare','/biz/healthcare','Healthcare directory'],
    'senior-center': ['healthcare','/biz/healthcare','Healthcare directory'],
    stroke: ['hospital','/biz/healthcare/hartford-hospital-hartford','Hartford Hospital kiosk'],
    clinic: ['clinic','/ct/hartford/doctor/hhc','Hartford medical office'],
    townhall: ['townhall','/ct/hartford/townhall','Hartford Town Hall'],
    library: ['library','/ct/hartford/library','Hartford public library'],
    police: ['police','/ct/hartford/police','Hartford police counter']
  };
  const genericQr = ['directory','/biz','Public venue directory'];
  const drafts = new Map();
  const active = new Map();
  let roomRequest;
  let printing;
  const element = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function button(text, fn, cls = 'cp-button') {
    const n = element('button',cls,text);
    n.type = 'button';
    n.addEventListener('click',fn);
    return n;
  }
  function link(text, path) {
    const a = element('a','cp-link',text);
    a.href = official + path;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  function field(title, value, update, options = {}) {
    const label = element('label','cp-field',title);
    const input = element(options.multi ? 'textarea' : 'input');
    if (!options.multi) input.type = options.type || 'text';
    if (options.placeholder) input.placeholder = options.placeholder;
    if (input.type !== 'date') input.maxLength = options.multi ? 550 : 180;
    input.value = value;
    input.autocomplete = 'off';
    input.addEventListener('input', () => update(input.value));
    label.append(input);
    return label;
  }
  function check(text, selected, update) {
    const label = element('label','cp-check');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = selected;
    input.addEventListener('change', () => update(input.checked));
    label.append(input,element('span',null,text));
    return label;
  }
  function section(title) {
    const block = element('section','cp-card');
    block.append(element('h4',null,title));
    return block;
  }
  function trimmed(value) { return String(value || '').trim(); }
  function catalog() {
    if (!roomRequest) {
      roomRequest = fetch(new URL('care-facility-data.json',base)).then(r => {
        if (!r.ok) throw Error('Facility inventory unavailable');
        return r.json();
      }).catch(() => {roomRequest = null;return null;});
    }
    return roomRequest;
  }
  function newDraft(venue, context, profile) {
    const bedside = ['hospital','nursing-home','stroke'].includes(venue);
    const practices = [
      'Scan from the sign using a visitor phone and open the intended board.',
      profile[2],
      'Let the person choose a tile, hear the full message, and confirm or correct the staff reply.'
    ];
    if (bedside) practices.push('Set up a bedside tablet and room board, then practice resetting and returning it at discharge or resident change.');
    return {
      title: trimmed(context.facilityName), lead:'', setup:'', coach:'', launch:'', review:'',
      practices, selected:[...practices], notes:'', goal:'', placements: new Map(),
      measures:['Independent selections','Confirmed conversations','Staff feedback'],
      action:'Choose one change to test with the team at the pilot review.',
      readiness:[false,false,false]
    };
  }
  function printableDate(date) {
    if (!date) return 'To schedule';
    const parsed = new Date(date + 'T12:00:00');
    return Number.isNaN(parsed.valueOf()) ? date : new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(parsed);
  }
  function safeLink(value) {
    try {
      const u = new URL(trimmed(value));
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch {return '';}
  }
  function publicSignUrl(url, qr) {
    if (!url) return false;
    const input = new URL(url);
    return input.origin === official && [qr[1],genericQr[1]].includes(input.pathname.replace(/\/$/,''));
  }
  const readiness = ['Review the board with the people who will use it.','Scan each facility-issued QR at its planned placement.','Assign the sign or device to a staff member for the first shift.'];
  const measures = {
    'Independent selections':'Count practice turns where the person chose a message themselves.',
    'Confirmed conversations':'Count exchanges where the person confirmed or corrected the reply.',
    'Staff feedback':'Ask staff which wording, sign position, or step needs to change.',
    'Visitor feedback':'Invite a participant to share one thing that helped and one thing to improve.',
    'Access barriers':'Tally where reaching, scanning, reading, hearing, or using a tile required help.'
  };
  function toggleValue(list, value, enabled) {
    if (enabled && !list.includes(value)) list.push(value);
    if (!enabled && list.includes(value)) list.splice(list.indexOf(value),1);
  }
  function renderPrint(content) {
    if (printing) printing();
    const page = element('article','cp-print-sheet');
    page.append(content);
    document.body.append(page);
    document.body.setAttribute('data-care-pilot-print','');
    const cleanup = () => {
      page.remove(); document.body.removeAttribute('data-care-pilot-print');
      window.removeEventListener('afterprint',cleanup); printing = null;
    };
    printing = cleanup;
    window.addEventListener('afterprint',cleanup);
    try { window.print(); } catch { cleanup(); throw Error('Print unavailable'); }
  }
  function plan(draft, profile, qr) {
    const rows = [];
    const add = (heading, entries) => rows.push([heading,entries]);
    add('Pilot details', [
      'Setting · ' + profile[0], 'Pilot lead · ' + (trimmed(draft.lead) || 'To assign'),
      'Board and signage lead · ' + (trimmed(draft.setup) || 'To assign'),
      'Practice lead · ' + (trimmed(draft.coach) || 'To assign'),
      'Target start · ' + printableDate(draft.launch), 'Review date · ' + printableDate(draft.review)
    ]);
    const placementList = [];
    for (const [room,p] of draft.placements) {
      const url = safeLink(p.url);
      placementList.push(room + ' · ' + (p.access || 'Printed QR sign') + ' · ' + (trimmed(p.spot) || 'Confirm an accessible sign position') + ' · ' +
        (publicSignUrl(url,qr) ? 'Public demo URL entered. Confirm the facility-issued board before posting.'
          : url ? 'On-site test link · ' + url : 'Request the facility board link and QR from the setup lead.'));
    }
    add('Where to start',placementList.length ? placementList : ['Select a starting placement.']);
    add('QR signs', ['Meeting demonstration · ' + qr[2] + ' · ' + official + qr[1],
      'For daily use, obtain the facility-issued board and QR, scan it at the selected placement, and confirm the correct room and visitor workflow.']);
    add('Staff practice',draft.selected.length ? draft.selected : ['Choose a staff practice exercise.']);
    add('Before the first shift',readiness.map((item,i) => (draft.readiness[i] ? '[Done] ' : '[Open] ') + item));
    add('Pilot review',[...draft.measures.map(m=>measures[m]), ...(trimmed(draft.goal) ? ['Target · ' + trimmed(draft.goal)] : []),
      ...(trimmed(draft.action) ? ['Next step · ' + trimmed(draft.action)] : [])]);
    if (trimmed(draft.notes)) add('Team notes',[trimmed(draft.notes)]);
    return rows;
  }
  function printPlan(title, rows) {
    const body = element('div');
    body.append(element('small',null,'TinkyTown · Pilot plan'),element('h1',null,title));
    for (const [heading,entries] of rows) {
      const block = element('section');
      block.append(element('h2',null,heading));
      const list = element('ul');
      for(const line of entries) list.append(element('li',null,line));
      block.append(list);body.append(block);
    }
    return body;
  }
  function mount(host, venue = 'hospital', context = {}) {
    if (!host) return () => {};
    active.get(host)?.();
    const supplied = context && typeof context === 'object' ? context : {};
    const profile = places[venue] || [trimmed(supplied.venueLabel) || 'Community location','Welcome desk|Service counter|Activity area',places.directory[2]];
    const qr = qrTargets[venue] || genericQr;
    const qrImage = new URL('care-location-qr-'+qr[0]+'.png',base).href;
    let draft = drafts.get(venue);
    const isNew = !draft;
    if (!draft) {
      draft = newDraft(venue,supplied,profile);
      drafts.set(venue,draft);
    }
    let roomNames = profile[1].split('|');
    if (isNew) draft.placements.set(roomNames[0],{spot:'',url:''});
    const root = element('section','care-pilot');
    root.setAttribute('aria-label', profile[0]+' pilot planner');
    let alive = true;
    let customRow;
    const cleanup = () => {
      alive = false;
      if (active.get(host) === cleanup) active.delete(host);
      if (root.parentNode === host) root.remove();
    };
    active.set(host,cleanup);
    host.replaceChildren(root);
    const hero = element('header','cp-hero');
    hero.append(element('span','cp-brand','TinkyTown'),element('h3',null,'Plan a pilot'),element('p',null,'Choose a starting point for '+profile[0].toLocaleLowerCase()+' and leave with a plan your team can use.'));
    root.append(hero);
    const grid = element('div','cp-layout');
    const main = element('div','cp-main');
    const side = element('aside','cp-side');
    root.append(grid);grid.append(main,side);
    const team = section('People and dates');
    const fields = element('div','cp-fields');
    fields.append(field('Facility or location',draft.title,v=>draft.title=v,{placeholder:'Optional facility name'}),
      field('Pilot lead',draft.lead,v=>draft.lead=v,{placeholder:'Role or team'}),
      field('Board and signage lead',draft.setup,v=>draft.setup=v,{placeholder:'Who will prepare and test the setup?'}),
      field('Staff practice lead',draft.coach,v=>draft.coach=v,{placeholder:'Who will lead the first practice?'}),
      field('Target start',draft.launch,v=>draft.launch=v,{type:'date'}),
      field('Pilot review',draft.review,v=>draft.review=v,{type:'date'}));
    team.append(fields,element('p','cp-hint','Use roles and team details. Keep patient and resident information out of the plan.'));
    main.append(team);
    const rooms = section('Choose where to start');
    const select = element('select');
    select.setAttribute('aria-label','Placement to add');
    const placeControls = element('div','cp-inline');
    const added = element('div','cp-placements');
    function updateOptions() {
      const choices = roomNames.filter(name => !draft.placements.has(name));
      select.replaceChildren(...choices.map(name=>new Option(name,name)),new Option('Other placement…','__custom'));
    }
    function renderPlacements() {
      updateOptions();
      added.replaceChildren();
      for(const [name,details] of draft.placements) {
        const card = element('article','cp-placement');
        const heading = element('div','cp-row');
        const remove = button('Remove',() => {draft.placements.delete(name);renderPlacements();select.focus();});
        remove.setAttribute('aria-label','Remove '+name);
        heading.append(element('strong',null,name),remove);card.append(heading);
        const group = element('div','cp-fields');
        const accessLabel = element('label','cp-field','Access at this placement');
        const access = element('select');
        const device = ['hospital','nursing-home','stroke'].includes(venue) ? 'Preconfigured bedside tablet' : 'Shared device';
        for (const option of ['Printed QR sign',device,'QR sign and device']) access.append(new Option(option,option));
        access.value = details.access || 'Printed QR sign';
        access.addEventListener('change',()=>{details.access = access.value;});
        accessLabel.append(access);
        const urlField = field('Facility-issued board link',details.url,v=>{
          details.url = v;
          const ok = !trimmed(v) || Boolean(safeLink(v));
          urlField.querySelector('input').setCustomValidity(ok ? '' : 'Enter a complete HTTPS board link.');
          urlNote.textContent = ok ? publicSignUrl(safeLink(v),qr) ? 'This is the public demo address. Confirm the facility-issued link before posting.' : '' : 'Use a complete HTTPS board link.';
        },{type:'url',placeholder:'Add when the facility receives its link'});
        const urlNote = element('small','cp-hint');
        urlNote.setAttribute('role','status');
        if (publicSignUrl(safeLink(details.url),qr)) urlNote.textContent = 'This is the public demo address. Confirm the facility-issued link before posting.';
        group.append(accessLabel,field('Sign or device position',details.spot,v=>details.spot=v,{placeholder:'Where will people see and reach it?'}),urlField);
        card.append(group,urlNote);added.append(card);
      }
    }
    function addPlacement(name) {
      if(!trimmed(name)) return;
      const existing = [...draft.placements.keys()].find(place => place.toLocaleLowerCase() === trimmed(name).toLocaleLowerCase());
      if (!existing) draft.placements.set(trimmed(name),{spot:'',url:''});
      if (customRow) {customRow.remove();customRow = null;}
      renderPlacements();
    }
    placeControls.append(select,button('Add placement',()=>{
      if(select.value !== '__custom'){addPlacement(select.value);return;}
      if(customRow){customRow.querySelector('input').focus();return;}
      customRow = element('form','cp-inline');
      const input = element('input');input.placeholder = 'Placement name';input.setAttribute('aria-label','Placement name');input.maxLength=70;input.required=true;
      const save = element('button','cp-button','Add');save.type='submit';
      customRow.append(input,save);
      customRow.addEventListener('submit',e=>{e.preventDefault();addPlacement(input.value);});
      placeControls.after(customRow);input.focus();
    }));
    rooms.append(placeControls,added);main.append(rooms);renderPlacements();

    const practice = section('Rehearse with staff');
    practice.append(element('p','cp-hint','Choose the tasks to rehearse with a colleague before the first shift.'));
    for(const task of draft.practices) practice.append(check(task,draft.selected.includes(task),v=>toggleValue(draft.selected,task,v)));
    const rehearsal = field('Additional practice or team notes',draft.notes,v=>draft.notes=v,{multi:true,placeholder:'Add a staff prompt or a step to practice.'});
    practice.append(rehearsal);main.append(practice);
    const evaluation = section('Decide what to review');
    for(const [name,description] of Object.entries(measures)) {
      const row=check(name,draft.measures.includes(name),v=>toggleValue(draft.measures,name,v));
      row.lastElementChild.append(element('small',null,description));evaluation.append(row);
    }
    evaluation.append(field('Pilot target',draft.goal,v=>draft.goal=v,{placeholder:'What would your team like to see by the review?'}),
      field('Next step at review',draft.action,v=>draft.action=v,{multi:true}));
    main.append(evaluation);

    const actions = section('Take the plan with you');
    const status = element('p','cp-hint');
    status.setAttribute('role','status');
    function title() { return trimmed(draft.title) || profile[0]+' pilot'; }
    function validated(fn) {
      return () => {
        const invalid = [...root.querySelectorAll('input[type="url"]')].find(n => trimmed(n.value) && !safeLink(n.value));
        if (invalid) {invalid.setCustomValidity('Enter a complete HTTPS board link.');invalid.reportValidity();invalid.focus();return;}
        try {fn();} catch {status.textContent = 'This browser could not complete the export. The plan is still here.';}
      };
    }
    const save = button('Download editable plan',validated(()=>{
      const rows = plan(draft,profile,qr);
      const text = ['TinkyTown pilot plan',title(),'',...rows.flatMap(([h,lines])=>[h,...lines.map(s=>'• '+s),''])].join('\n');
      const file = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
      const a = element('a');a.download = 'TinkyTown-'+(title().replace(/[^\p{L}\p{N}-]+/gu,'-').slice(0,80) || 'facility')+'-pilot.txt';
      a.href = file;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(file),1000);
      status.textContent = 'Editable text plan downloaded.';
    }),'cp-button cp-primary');
    const print = button('Print plan',validated(()=>renderPrint(printPlan(title(),plan(draft,profile,qr)))));
    actions.append(element('p','cp-hint','Edits stay in this workspace session. Download a copy to keep or edit later.'),save,print,status);
    side.append(actions);
    const launch = section('Before the first shift');
    readiness.forEach((item,i)=>launch.append(check(item,draft.readiness[i],v=>draft.readiness[i]=v)));
    side.append(launch);
    const sign = section('QR sign for a demonstration');
    const poster = () => {
      const block=element('div','cp-poster');
      block.append(element('small',null,'TinkyTown · Public demo'),element('h4',null,'Scan to try the board'));
      const image=element('img'); image.src=qrImage;image.alt='QR code for '+qr[2];image.width=140;image.height=140;
      block.append(image,element('strong',null,qr[2]),element('span',null,official+qr[1]));
      return block;
    };
    sign.append(poster(),button('Print public demo sign',()=>renderPrint(poster())),link('Open public demo ↗',qr[1]),
      element('p','cp-hint','Use this sign during the presentation. For daily use, request and test a facility-issued QR for each selected placement.'));
    side.append(sign);
    const next = section('Arrange the pilot');
    next.append(link('Request a TinkyTown pilot ↗','/start.html?intent=pilot'),link('Request a site walkthrough ↗','/start.html?intent=eval'));
    if (['hospital','nursing-home','stroke','clinic'].includes(venue)) next.append(link('Bedside setup and equipment ↗','/medical.html#facilities'));
    side.append(next);
    const careKey = venue === 'stroke' ? 'hospital' : venue;
    if (['hospital','nursing-home','senior-center'].includes(careKey)) {
      catalog().then(data=>{
        if (!alive || !data?.facilities?.[careKey]) return;
        const inventory = data.facilities[careKey].rooms;
        roomNames = [...new Set([...roomNames,...inventory.map(room=>room.name)])];
        const requested = inventory.find(room=>room.id===supplied.room || room.name===supplied.room);
        if (isNew && requested && draft.placements.size===1) {
          const first = draft.placements.get(profile[1].split('|')[0]);
          if (first && !first.url && !first.spot && !first.access && !draft.placements.has(requested.name)) {
            draft.placements.delete(profile[1].split('|')[0]);
            draft.placements.set(requested.name,{spot:'',url:''});
            renderPlacements();
            return;
          }
        }
        updateOptions();
      });
    }
    return cleanup;
  }
  function reset() {
    for (const cleanup of [...active.values()]) cleanup();
    drafts.clear();
    if (printing) printing();
  }
  window.CarePilot = Object.freeze({mount,reset});
})();
