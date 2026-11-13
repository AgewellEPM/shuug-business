/* Private GigTax console. Reuses the TinkySDR Home/Kanban/Regions card
 * patterns from TinkySpeak-Web; data and authority remain in GigTax's API.
 * This presentation module never sends outreach or changes office stages. */
(() => {
  'use strict';
  const STATE_NAMES = new Map([
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
  ]);
  // A labelled tile map, not coordinates: all states + DC, with separate insets.
  const MAP_ROWS = [
    ' .  .  .  .  .  .  .  .  .  .  . ME',
    'WA ID MT ND MN WI  . MI  . VT NH  .',
    'OR NV WY SD IA IL IN OH PA NY MA  .',
    'CA UT CO NE MO KY WV VA MD NJ CT RI',
    ' . AZ NM KS AR TN NC SC DE  .  .  .',
    ' .  .  . OK LA MS AL GA  .  .  .  .',
    ' .  .  . TX  .  .  . FL  .  .  .  .',
    'AK HI  .  .  .  .  .  .  . DC  .  .',
  ].map(row => row.trim().split(/\s+/));
  const STAGES = ['new','researching','contacted','replied','waiting','meeting','interested','invited','contract_sent','contract_signed','active','not_interested','do_not_contact'];
  const LABELS = { new:'New candidates',researching:'Researching',contacted:'Contacted',replied:'Replied',waiting:'Waiting',contract_sent:'Contract sent / queued',contract_signed:'Agreement signed',meeting:'Meetings',interested:'Interested',invited:'Contract prepared',active:'Active offices',not_interested:'Not interested',do_not_contact:'Do not contact' };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const metadata = office => { try { return JSON.parse(office.notes || '{}') || {}; } catch { return {}; } };
  const label = value => LABELS[value] || String(value || '').replaceAll('_',' ');
  const plural = count => `${count} office${count === 1 ? '' : 's'}`;
  const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = String(text); return element; };
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  const closed = office => ['active','not_interested','do_not_contact'].includes(office.status);
  const due = (office, today) => Boolean(dateOnly(office.meeting_date) && office.meeting_date <= today && !closed(office));
  const paidActive = office => office.status === 'active' && office.membership?.eligible === true;
  const verifiedOwnership = office => { const info = metadata(office); return info.independence === 'independent' && info.independenceVerification?.reviewed === true && info.independenceVerification.finding === 'independent'; };
  let previousMount;

  function mount({ status = () => {}, onSelect = () => {}, onNavigate = () => {}, onSearch = () => {}, onTerritory } = {}) {
    previousMount?.();
    let data = { offices: [], agents: [], user: {}, stages: STAGES }, selectedState = '', currentView = 'dashboard', pipelineView = 'board';
    const cleanups = [], boundPaths = new WeakSet();
    const listen = (element, event, handler) => { if (!element) return; element.addEventListener(event, handler); cleanups.push(() => element.removeEventListener(event, handler)); };
    const act = work => { try { Promise.resolve(work()).catch(error => status(error.message || 'The view could not be opened.', true)); } catch (error) { status(error.message || 'The view could not be opened.', true); } };
    const button = (text, className, action) => { const element = node('button', className, text); element.type = 'button'; element.addEventListener('click', () => act(action)); return element; };
    const userStates = () => data.user.role === 'owner' ? [...STATE_NAMES.keys()] : data.user.territory?.version===1 ? data.user.territory.areas.map(area=>area.state) : !data.user.states?.length ? [...STATE_NAMES.keys()] : data.user.states.filter(state => STATE_NAMES.has(state));
    const permitted = state => userStates().includes(state);
    const offices = () => (data.offices || []).filter(office => permitted(office.state) && (data.user.role !== 'agent' || String(office.assigned_to) === String(data.user.id)));
    const navigate = name => {
      currentView = name;
      $$('[data-console-nav]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.consoleNav === name)));
      return name;
    };
    const openView = name => { navigate(name); return onNavigate(name); };
    const selectOffice = id => { openView('pipeline'); return onSelect(String(id)); };
    function stat(title, count, description, action) {
      const card = button('', 'sdr-card sdr-stat', action);
      card.append(node('span','sdr-stat-label',title),node('strong','sdr-stat-value',count),node('span','sdr-stat-description',description));
      return card;
    }
    function cardHead(title, detail) {
      const head = node('div','sdr-card-head'); head.append(node('h3','',title)); if (detail) head.append(node('span','sdr-card-meta',detail)); return head;
    }
    function renderRevenue() {
      const host = $('#sales-revenue'); if (!host) return;
      const revenue = data.revenue, commission = revenue?.commission;
      host.hidden = !commission; if (!commission) { host.replaceChildren(); return; }
      const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
      const opened = host.querySelector('details')?.open || false, details = node('details','sdr-earnings'); details.open = opened;
      const summary = node('summary','sdr-earnings-summary');
      const heading = node('span','sdr-earnings-label',revenue.scope === 'team' ? 'Team earnings' : 'Your earnings');
      const amount = node('strong','sdr-earnings-total',money(commission.earnedCents)); amount.setAttribute('aria-live','polite');
      const recurring = node('span','sdr-earnings-recurring',`${money(commission.monthlyResidualCents)}/mo active residual`);
      summary.append(heading,amount,node('span','sdr-earnings-caption','Estimated earned'),recurring,node('span','sdr-earnings-chevron','⌄'));
      const panel = node('section','sdr-earnings-panel'); panel.setAttribute('aria-label','Commission and revenue breakdown');
      panel.append(node('h2','',revenue.scope === 'team' ? 'The team’s progress' : 'Your work is adding up'));
      const breakdown = node('dl','sdr-earnings-breakdown');
      for (const [label,value] of [['Signup commissions',commission.signupEarnedCents],['Verified monthly commissions',commission.residualEarnedCents],['Milestone bonuses',commission.bonusEarnedCents],['Signed · awaiting payment',commission.pendingSignupCents]]) {
        const row = node('div',''); row.append(node('dt','',label),node('dd','',money(value))); breakdown.append(row);
      }
      panel.append(breakdown);
      const milestone = node('div','sdr-earnings-milestone');
      milestone.append(node('strong','',`${money(commission.bonusCents)} first-10 bonus`),node('span','',`${commission.milestoneOffices}/${commission.bonusOffices} paid offices${revenue.scope === 'team' ? ' · closest agent' : ''}`));
      const progress = node('progress',''); progress.max = commission.bonusOffices; progress.value = commission.milestoneOffices; progress.setAttribute('aria-label','Paid offices toward the first milestone bonus'); milestone.append(progress);
      panel.append(milestone,node('p','sdr-earnings-plan',`${money(commission.signupCents)} per paid signup + ${money(commission.residualCents)} per collected month from month ${commission.residualStartsMonth}.`));
      if (commission.historyNeedsReview) panel.append(node('p','sdr-earnings-note','Some older monthly receipts need billing review before commissions can be counted.'));
      panel.append(node('p','sdr-earnings-note','Based on verified live payments. Pending signatures and unpaid agreements do not earn commission. Estimates are separate from payout records.'));
      const sales = node('div','sdr-earnings-sales'); sales.append(node('span','',`${money(revenue.signedRevenueCents)} signed contract value`),node('small','',`${money(commission.potentialMonthlyCents)}/mo potential residual if memberships pay and continue`)); panel.append(sales);
      panel.append(button('Find your next office →','sdr-earnings-action',() => { details.open = false; return openView('discover'); }));
      details.append(summary,panel); host.replaceChildren(details);
    }
    function workFor(office, today) {
      if (['do_not_contact','not_interested'].includes(office.status)) return null;
      if (office.membership && !office.membership.eligible) return { office, priority: 0, title: 'Review membership status', detail: office.membership.reason || label(office.membership.status) };
      if (due(office,today)) return { office, priority: 1, title: 'Follow-up due', detail: `Scheduled ${office.meeting_date}` };
      if (!closed(office) && !verifiedOwnership(office)) return { office, priority: 2, title: 'Verify this office', detail: 'Review published contacts and independent ownership.' };
      if (office.status === 'interested' && data.terms) return { office, priority: 3, title: 'Prepare an owner invitation', detail: 'Review the verified office and its written terms.' };
      if (office.status === 'invited') return { office, priority: 4, title: 'Review invitation progress', detail: 'Open the office to review enrollment and payment status.' };
      if (!closed(office)) return { office, priority: 5, title: 'Plan the next conversation', detail: office.meeting_date ? `Next follow-up ${office.meeting_date}` : 'Review this office and record a next step.' };
      return null;
    }
    function renderDashboard() {
      const host = $('#sales-dashboard'); if (!host) return;
      const rows = offices(), today = localToday(), overdue = rows.filter(office => due(office,today));
      const heading = node('div','sdr-welcome');
      const hour = new Date().getHours(), greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      heading.append(node('p','sdr-eyebrow','YOUR OFFICE NETWORK'),node('h2','',`${greeting}${data.user.name ? `, ${data.user.name}` : ''}.`),node('p','',rows.length ? 'Your pipeline, your next conversations, and the offices ready for a closer look.' : 'Start with one local office. Research the facts, meet the people, and build from there.'));
      const actions = node('div','sdr-quick-actions');
      for (const [text, view] of [['Find offices','discover'],['Open pipeline','pipeline'],['Contracts','contracts'],['Signup locations','locations'],['Senders','mail'],['Explore territories','territories']]) { const control = button(text,'sdr-action',() => openView(view)); control.dataset.consoleNav = view; actions.append(control); }
      heading.append(actions);
      const stats = node('div','sdr-dashboard-grid sdr-stats-grid');
      stats.append(stat('Saved offices',rows.length,'In your visible pipeline',() => { setStage(''); return openView('pipeline'); }),stat('Follow-ups due',overdue.length,'Scheduled for today or earlier',() => openView('pipeline')),stat('Interested',rows.filter(o => o.status === 'interested').length,'Offices marked interested',() => { setStage('interested'); return openView('pipeline'); }),stat('Active memberships',rows.filter(paidActive).length,'Active office + verified paid period',() => { setStage('active'); return openView('pipeline'); }));
      const next = node('section','sdr-card sdr-next-work'); next.append(cardHead('Your next moves','Based on saved office records'));
      const tasks = rows.map(office => workFor(office,today)).filter(Boolean).sort((a,b) => a.priority-b.priority || String(a.office.meeting_date || '').localeCompare(String(b.office.meeting_date || ''))).slice(0,6);
      const list = node('div','sdr-work-list');
      if (!tasks.length) {
        const empty = node('div','sdr-empty'); empty.append(node('strong','',rows.length ? 'Your next step is yours to choose.' : 'Your first office starts here.'),node('p','',rows.length ? 'Browse your pipeline or research another local office.' : 'Choose a city or ZIP code to find real public directory candidates.'),button('Find an office','sdr-action',() => openView('discover'))); list.append(empty);
      }
      for (const item of tasks) {
        const control = button('','sdr-work-item',() => selectOffice(item.office.id));
        const copy = node('span','sdr-work-copy'); copy.append(node('strong','',item.title),node('span','',item.office.town || 'Office record'),node('small','',item.detail));
        control.append(node('span','sdr-office-avatar',(item.office.town || 'O').slice(0,1).toUpperCase()),copy,node('span','sdr-work-arrow','↗')); list.append(control);
      }
      next.append(list);
      const territory = node('section','sdr-card sdr-territory-summary'), scope = data.user.role==='owner' ? 'Nationwide research access' : data.user.territory?.version===1 ? data.user.territory.areas.length ? 'Assigned towns and states' : 'No territory assigned' : !data.user.states?.length ? 'Nationwide research access' : `${data.user.states.length} assigned state${data.user.states.length === 1 ? '' : 's'}`;
      territory.append(cardHead('Your territory',scope),node('p','',`${new Set(rows.map(o => o.state)).size} states and ${new Set(rows.filter(o => o.locality?.trim()).map(o => `${o.state}|${o.locality.trim().toLowerCase()}`)).size} cities represented in your saved pipeline.`),button('Open territory map','sdr-action',() => openView('territories')));
      const lower = node('div','sdr-dashboard-grid'); lower.append(next,territory);
      const progress = node('div','sdr-contact-summary sdr-progress-summary');
      for (const [name,count,view] of [['Replies needing our team',rows.filter(o => o.pipeline?.lastReply && o.pipeline.waitingOn === 'us').length,'pipeline'],['Waiting for office reply',rows.filter(o => o.pipeline?.waitingOn === 'office').length,'pipeline'],['Signed agreements',rows.filter(o => o.pipeline?.converted).length,'locations']]) progress.append(button(`${name}: ${count}`, 'button secondary', () => { setStage(''); const filter = $('#sales-attention-filter'); if (filter && view === 'pipeline') { filter.value = name.startsWith('Replies') ? 'us' : 'office'; filter.dispatchEvent(new Event('change',{bubbles:true})); } return openView(view); }));
      host.replaceChildren(heading,stats,progress,lower);
    }
    const stageOf = office => office.pipeline?.stage || office.status;
    function queryRows() {
      const query = ($('#sales-filter')?.value || '').trim().toLowerCase();
      const attention = $('#sales-attention-filter')?.value || '';
      return offices().filter(office => (!attention || office.pipeline?.waitingOn === attention) && (!query || [office.town,office.locality,office.state,office.contact_name,office.contact_email,metadata(office).address,office.pipeline?.nextAction].join(' ').toLowerCase().includes(query)));
    }
    function setStage(stage) {
      const select = $('#sales-stage-filter');
      if (select) { select.value = stage; select.dispatchEvent(new Event('change',{bubbles:true})); }
      renderPipeline();
    }
    function setPipelineView(name) {
      pipelineView = name === 'list' ? 'list' : 'board';
      const board = $('#sales-board'), list = $('#sales-pipeline-list');
      if (board) board.hidden = pipelineView !== 'board'; if (list) list.hidden = pipelineView !== 'list';
      $$('[data-pipeline-view]').forEach(control => control.setAttribute('aria-pressed',String(control.dataset.pipelineView === pipelineView)));
    }
    function officeCard(office) {
      const control = button('','sdr-office-card',() => selectOffice(office.id)); control.dataset.consoleOffice = String(office.id);
      const name = office.town || 'Office record';
      const top = node('span','sdr-office-card-top'); top.append(node('span','sdr-office-avatar',name.slice(0,1).toUpperCase()),node('strong','',name));
      control.append(top,node('span','sdr-office-location',[office.locality,office.state].filter(Boolean).join(', ')),node('span','sdr-office-contact',office.contact_name || 'Public contact needs research'));
      if (dateOnly(office.meeting_date)) control.append(node('span',due(office,localToday()) ? 'sdr-office-due is-due' : 'sdr-office-due',`Follow-up ${office.meeting_date}`));
      control.append(node('span','sdr-office-verification',verifiedOwnership(office) ? 'Ownership evidence reviewed' : 'Ownership needs review'));
      if (office.membership) control.append(node('span','sdr-office-membership',office.membership.eligible && office.status === 'active' ? 'Membership current' : `Membership: ${label(office.membership.status)}`));
      if (office.pipeline) { const progress = node('div','sdr-card-progress'); progress.innerHTML = window.GigTaxProgress?.facts(office.pipeline) || ''; control.append(progress); }
      return control;
    }
    function renderPipeline() {
      const rows = queryRows(), stage = $('#sales-stage-filter')?.value || '';
      const stages = [...new Set([...(data.stages?.length ? data.stages : STAGES),...rows.map(stageOf).filter(Boolean)])];
      const strip = $('#sales-stage-strip');
      if (strip) {
        strip.classList.add('sdr-stage-strip');
        const chips = [['','All offices'],...stages.map(name => [name,label(name)])].map(([name,title]) => {
          const count = name ? rows.filter(o => stageOf(o) === name).length : rows.length;
          const control = button('','sdr-stage-chip',() => setStage(name)); control.dataset.consoleStage = name; control.setAttribute('aria-pressed',String(stage === name)); control.append(node('span','',title),node('span','sdr-stage-count',count)); return control;
        }); strip.replaceChildren(...chips);
      }
      const host = $('#sales-board'); if (!host) return; host.classList.add('sdr-board');
      const columns = stages.filter(name => !stage || name === stage).map(name => {
        const group = rows.filter(o => stageOf(o) === name), lane = node('section','sdr-lane'); lane.dataset.stage = name;
        const head = node('div','sdr-lane-head'); head.append(node('h3','',label(name)),node('span','sdr-lane-count',group.length)); lane.append(head);
        const list = node('div','sdr-lane-cards'); list.append(...group.map(officeCard)); if (!group.length) list.append(node('p','sdr-empty','No offices in this stage.')); lane.append(list); return lane;
      });
      host.replaceChildren(...columns); setPipelineView(pipelineView);
    }
    function chooseState(state) {
      if (!permitted(state)) return;
      selectedState = state; renderTerritories();
      const form = $('#sales-discover'), select = form?.elements.namedItem('state'); if (select) select.value = state;
      if(onTerritory){openView('territories');return onTerritory(state);}
      return openView('discover');
    }
    function searchCity(state, city) {
      if (!permitted(state)) return;
      const form = $('#sales-discover'); if (form) { if (form.elements.namedItem('state')) form.elements.namedItem('state').value = state; if (form.elements.namedItem('city')) form.elements.namedItem('city').value = city; }
      openView('discover'); return onSearch({ state, city });
    }
    function renderTerritories() {
      const rows = offices(), counts = new Map([...STATE_NAMES.keys()].map(state => [state,rows.filter(o => o.state === state).length]));
      const host = $('#sales-territory-map');
      if (host) host.classList.add('sdr-map');
      const geographic = host?.querySelector('svg[data-sales-state-map]');
      if (geographic) {
        geographic.setAttribute('role','group'); geographic.setAttribute('aria-label','United States state territories, with Alaska and Hawaii insets');
        for (const path of geographic.querySelectorAll('path[data-state]')) {
          const state = path.dataset.state; if (!STATE_NAMES.has(state)) continue;
          const allowed = permitted(state), description = `${STATE_NAMES.get(state)}: ${plural(counts.get(state))}${allowed ? '' : ', outside your assigned territory'}`;
          path.dataset.count = String(counts.get(state)); path.dataset.level = String(Math.min(4, Math.ceil(Math.log2(counts.get(state) + 1))));
          path.classList.add('sdr-map-state'); path.classList.toggle('is-assigned',allowed); path.classList.toggle('is-unassigned',!allowed); path.classList.toggle('is-selected',selectedState === state);
          path.setAttribute('role','button'); path.setAttribute('tabindex',allowed ? '0' : '-1'); path.setAttribute('aria-disabled',String(!allowed)); path.setAttribute('aria-pressed',String(selectedState === state)); path.setAttribute('aria-label',description);
          const title = path.querySelector('title'); if (title) title.textContent = description;
          if (!boundPaths.has(path)) {
            boundPaths.add(path);
            listen(path,'click',() => act(() => chooseState(state)));
            listen(path,'keydown',event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); act(() => chooseState(state)); } });
          }
        }
      } else if (host) {
        const grid = node('div','sdr-map-grid'); grid.setAttribute('role','group'); grid.setAttribute('aria-label','United States state tile map');
        for (const state of MAP_ROWS.flat()) {
          if (state === '.') { const spacer = node('span','sdr-map-spacer'); spacer.setAttribute('aria-hidden','true'); grid.append(spacer); continue; }
          const allowed = permitted(state), control = button('','sdr-map-tile',() => chooseState(state)); control.dataset.state = state; control.disabled = !allowed;
          control.classList.add(allowed ? 'is-assigned' : 'is-unassigned'); if (selectedState === state) control.classList.add('is-selected');
          control.setAttribute('aria-label',`${STATE_NAMES.get(state)}: ${plural(counts.get(state))}${allowed ? '' : ', outside your assigned territory'}`); control.setAttribute('aria-pressed',String(selectedState === state));
          control.append(node('strong','',state),node('span','sdr-map-tile-count',counts.get(state))); grid.append(control);
        }
        const caption = node('p','sdr-map-caption','State tile map. Relative positions only; Alaska, Hawaii and DC are shown as insets. Counts are saved pipeline offices, not public locations or service coverage.');
        host.replaceChildren(grid,caption);
      }
      const cards = $('#sales-territory-cards');
      if (cards) {
        cards.classList.add('sdr-state-grid');
        const states = [...STATE_NAMES.keys()].sort((a,b) => Number(permitted(b))-Number(permitted(a)) || (counts.get(b)-counts.get(a)) || STATE_NAMES.get(a).localeCompare(STATE_NAMES.get(b)));
        cards.replaceChildren(...states.map(state => {
          const control = button('','sdr-state-card',() => chooseState(state)); control.dataset.territoryState = state;
          control.setAttribute('aria-pressed', String(selectedState === state)); control.classList.toggle('is-selected', selectedState === state);
          control.disabled = !permitted(state); control.setAttribute('aria-label',`${STATE_NAMES.get(state)}: ${plural(counts.get(state))}${control.disabled ? ', outside your assigned territory' : ''}`);
          control.append(node('span','sdr-state-abbreviation',state),node('strong','',STATE_NAMES.get(state)),node('span','sdr-state-count',plural(counts.get(state))));
          const cities = new Set(rows.filter(o => o.state === state && o.locality).map(o => o.locality.toLowerCase())); control.append(node('small','',`${cities.size} saved ${cities.size === 1 ? 'city' : 'cities'}`)); return control;
        }));
      }
      const citiesHost = onTerritory ? null : $('#sales-territory-cities');
      if (citiesHost) {
        citiesHost.classList.add('sdr-city-list');
        const groups = new Map();
        for (const office of rows) {
          if (!office.locality || selectedState && office.state !== selectedState) continue;
          const key = `${office.state}|${office.locality.trim().toLowerCase()}`;
          if (!groups.has(key)) groups.set(key,{ state:office.state, city:office.locality.trim(), count:0 }); groups.get(key).count++;
        }
        const list = [...groups.values()].sort((a,b) => b.count-a.count || a.city.localeCompare(b.city));
        if (!list.length) citiesHost.replaceChildren(node('p','sdr-empty',selectedState ? `No saved cities in ${STATE_NAMES.get(selectedState)} yet. Search a city or ZIP code to discover office candidates.` : 'Cities appear here when office candidates are saved to your pipeline.'));
        else citiesHost.replaceChildren(...list.map(group => { const control = button('','sdr-city-button',() => searchCity(group.state,group.city)); control.append(node('strong','',`${group.city}, ${group.state}`),node('span','',plural(group.count)),node('span','sdr-city-arrow','Research this city ↗')); return control; }));
      }
    }
    listen($('#sales-filter'),'input',renderPipeline); listen($('#sales-stage-filter'),'change',renderPipeline); listen($('#sales-attention-filter'),'change',renderPipeline);
    $$('[data-pipeline-view]').forEach(control => listen(control,'click',() => setPipelineView(control.dataset.pipelineView)));
    previousMount = () => cleanups.forEach(remove => remove());
    return {
      render(next) { data = { offices:[], agents:[], stages:STAGES, user:{}, ...next }; if (!permitted(selectedState)) selectedState = ''; renderRevenue(); renderDashboard(); renderPipeline(); renderTerritories(); navigate(currentView); },
      navigate,
    };
  }
  window.GigTaxConsole = { mount };
})();
