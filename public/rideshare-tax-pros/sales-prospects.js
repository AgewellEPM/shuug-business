(() => {
  'use strict';
  const pageSize = 8;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const searchKey = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const statuses = {
    new: 'New', researching: 'Researching', contacted: 'Contacted', replied: 'Replied', waiting: 'Waiting',
    meeting: 'Meeting scheduled', interested: 'Interested', invited: 'Invited', contract_sent: 'Contract sent',
    contract_signed: 'Contract signed', active: 'Active', not_interested: 'Not interested', do_not_contact: 'Do not contact',
  };
  const types = Object.freeze({
    'nursing-home': 'Nursing home', 'senior-center': 'Senior community center', 'assisted-living': 'Assisted living',
    'independent-living': 'Independent living', 'long-term-care': 'Rehab / long-term care', other: 'Other business',
  });
  const ongoing = new Set(['researching', 'contacted', 'replied', 'waiting', 'meeting', 'interested', 'invited', 'contract_sent']);
  const contractStage = new Set(['invited', 'contract_sent', 'contract_signed', 'active']);
  const closed = new Set(['active', 'contract_signed', 'not_interested', 'do_not_contact']);
  const symbols = {
    business: '<path d="M4 21V7h6V3h10v18M2 21h20M8 11h1m-1 4h1m5-8h2m-2 4h2m-2 4h2m-3 6v-3h3v3"/>',
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2"/>',
    date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18m-12 5 2 2 4-4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  };
  const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
  const dateStyle = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const fullDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });
  const label = stage => statuses[stage] || 'New';
  const regionLabel = state => regionNames[state] || state;
  const isBedCount = value => Number.isSafeInteger(value) && value >= 0;
  const isCmsRating = value => Number.isInteger(value) && value >= 1 && value <= 5;
  const bedText = value => isBedCount(value) ? value.toLocaleString() : 'Unavailable';
  const cmsRatingText = value => isCmsRating(value) ? value + ' / 5' : 'Unavailable';
  const regionNames = {
    AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut', DC:'District of Columbia',
    DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas',
    KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi',
    MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
    NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island',
    SC:'South Carolina', SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
    WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  };
  function business(office) {
    let metadata;
    try { metadata = JSON.parse(office.notes || '{}') || {}; } catch { metadata = {}; }
    const stage = office.pipeline?.stage || office.status;
    const type = Object.hasOwn(types, metadata.facilityType) ? metadata.facilityType : 'other';
    return {
      id: String(office.id), name: office.town, location: [office.locality, office.state].filter(Boolean).join(', '),
      state: office.state, type, stage: Object.hasOwn(statuses, stage) ? stage : 'new', due: office.meeting_date || '',
      next: office.pipeline?.nextAction || '', certifiedBeds: metadata.facilityCertifiedBeds,
      cmsRating: metadata.facilityCmsRating, office, metadata,
    };
  }
  function dateText(value, format = dateStyle) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(value + 'T12:00:00');
    return Number.isNaN(date.getTime()) ? '' : format.format(date);
  }
  function stageBadge(record) {
    return `<span class="prospects-stage" data-stage="${record.stage}">${label(record.stage)}</span>`;
  }

  function paintPortrait(frame, role, alt = '') {
    const initials = document.createElement('span');
    const names = role.name.trim().split(/\s+/);
    initials.textContent = names.length > 1 ? names[0][0] + names.at(-1)[0] : names[0][0];
    initials.setAttribute('aria-hidden', 'true');
    frame.append(initials);
    const source = role.photoURL && window.SdrTerritoryFacilities?.sourceLink(role.photoURL, '');
    if (!source) return;
    const photo = document.createElement('img');
    photo.alt = alt;
    photo.loading = 'lazy';
    photo.referrerPolicy = 'no-referrer';
    const fallback = role.fallbackPhotoURL && window.SdrTerritoryFacilities?.sourceLink(role.fallbackPhotoURL, '');
    photo.addEventListener('error', () => {
      if (fallback && photo.src !== fallback.href) photo.src = fallback.href;
      else photo.remove();
    });
    photo.src = source.href;
    if (role.photoFrame) frame.dataset.photoFrame = role.photoFrame;
    frame.append(photo);
  }

  function administratorProfile(facility, role, { open, showTitle = false, showResearch = false } = {}) {
    const profile = document.createElement('div');
    profile.className = 'prospects-administrator';
    const details = document.createElement('div');
    const links = window.SdrTerritoryFacilities?.sourceLink;
    if (role?.name) {
      const portrait = document.createElement(open ? 'button' : 'span');
      if (open) {
        portrait.type = 'button';
        portrait.setAttribute('aria-label', 'View facility profile for ' + role.name);
        portrait.onclick = open;
      }
      portrait.className = 'prospects-administrator-photo';
      paintPortrait(portrait, role, `Headshot of ${role.name}`);
      profile.append(portrait);
    }
    const name = document.createElement(role?.name ? (open ? 'button' : 'strong') : 'span');
    name.textContent = role?.name || 'Administrator not sourced';
    if (role?.name && open) {
      name.type = 'button';
      name.className = 'facility-profile-open';
      name.onclick = open;
    }
    details.append(name);
    if (role?.title && (showTitle || role.title !== 'Administrator')) {
      const title = document.createElement('small');
      title.textContent = role.title;
      details.append(title);
    }
    const rawPhone = role?.phone || facility.phone || '';
    const phone = rawPhone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (phone.length === 10) {
      const office = document.createElement('a');
      office.href = 'tel:+1' + phone;
      office.textContent = `${role?.directPhone ? 'Business' : 'Office'} (${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
      details.append(office);
    } else if (rawPhone) {
      const office = document.createElement('small');
      office.textContent = 'Facility phone ' + rawPhone;
      details.append(office);
    }
    const email = role?.email || facility.email;
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const contact = document.createElement('a');
      contact.href = 'mailto:' + encodeURIComponent(email);
      contact.textContent = role?.email ? email : 'Facility email';
      details.append(contact);
    }
    const pages = document.createElement('div');
    pages.className = 'prospects-administrator-sources';
    if (role?.sourceURL) {
      const source = links?.(role.sourceURL, showResearch && role.photoSourceURL === role.sourceURL ? 'Role and photo source' : role.sourceName || 'Role source');
      if (source) {
        if (role.checkedOn) source.title = 'Role source dated ' + role.checkedOn;
        pages.append(source);
      }
    }
    if (showResearch && role?.photoSourceURL && role.photoSourceURL !== role.sourceURL) {
      const photoSource = links?.(role.photoSourceURL, 'Photo source');
      if (photoSource) pages.append(photoSource);
    }
    if (showResearch || !role?.name) {
      const query = [role?.name, facility.name, facility.city, facility.state, role?.title || 'administrator'].filter(Boolean).join(' ');
      const google = new URL('https://www.google.com/search');
      google.searchParams.set('q', query);
      const linkedin = new URL('https://www.linkedin.com/search/results/people/');
      linkedin.searchParams.set('keywords', query);
      for (const [url, text] of [[google.href, 'Google'],
        [role?.linkedinURL || linkedin.href, role?.linkedinURL ? 'LinkedIn profile' : 'LinkedIn search']]) {
        const link = links?.(url, text);
        if (link) pages.append(link);
      }
    }
    details.append(pages);
    profile.append(details);
    return profile;
  }

  function facilityProfile(dialog, api, onCompose) {
    const find = name => dialog.querySelector(`[data-facility-profile-${name}]`);
    const team = find('team'), contact = find('contact');
    const outreach = dialog.querySelector('[data-facility-outreach]');
    const draftPanel = dialog.querySelector('[data-facility-outreach-drafts]');
    const draftList = dialog.querySelector('[data-facility-outreach-list]');
    const draftStatus = dialog.querySelector('[data-facility-outreach-status]');
    const link = (href, text) => window.SdrTerritoryFacilities?.sourceLink(href, text);
    const textNode = (tag, text) => { const element = document.createElement(tag); element.textContent = text; return element; };
    let request = 0, prepareOutreach, researchTarget;
    const reviews = window.SdrFacilityReviews.mount(dialog, api, focus => void prepareOutreach?.(focus));

    function draftCard(draft, index) {
      const card = document.createElement('details');
      card.open = index === 0;
      const summary = textNode('summary', draft.name + ' · ' + draft.title);
      const content = document.createElement('div');
      content.className = 'facility-outreach-compose';
      content.innerHTML = '<label>Subject<input maxlength="180"></label><label>Message<textarea rows="9" maxlength="4000"></textarea></label>';
      const subject = content.querySelector('input'), body = content.querySelector('textarea');
      subject.value = draft.subject;
      body.value = draft.body;
      const sendTo = textNode('p', draft.to + (draft.ai ? ' · AI draft' : ' · Template draft'));
      const email = textNode('a', 'Open individual draft in email app');
      email.className = 'button secondary';
      function updateEmail() {
        const fields = 'subject=' + encodeURIComponent(subject.value.replace(/[\r\n]/g, ' ')) + '&body=' + encodeURIComponent(body.value);
        email.href = 'mailto:' + encodeURIComponent(draft.to).replace('%40', '@') + '?' + fields;
      }
      content.addEventListener('input', updateEmail);
      updateEmail();
      content.prepend(sendTo);
      if (onCompose) {
        const compose = textNode('button', 'Open in Email');
        compose.type = 'button';
        compose.className = 'button primary';
        compose.dataset.openWorkspaceEmail = '';
        compose.onclick = () => onCompose({ to: draft.to, subject: subject.value, body: body.value }, () => dialog.close());
        content.append(compose);
      }
      content.append(email);
      card.append(summary, content);
      return card;
    }

    function setupOutreach(facility, category, people) {
      draftPanel.hidden = true;
      draftList.replaceChildren();
      const canDraft = Boolean(facility.sourceURL && people.some(person => person?.email));
      outreach.hidden = !canDraft;
      outreach.disabled = false;
      reviews.allowDraft(canDraft);
      let draftFocus;
      prepareOutreach = async focus => {
        if (!canDraft || outreach.disabled) return;
        draftPanel.hidden = false;
        draftPanel.querySelector('h3').focus();
        if (draftFocus === focus && draftList.childElementCount) return;
        const active = request;
        outreach.disabled = true;
        reviews.allowDraft(canDraft, true);
        draftStatus.textContent = 'Preparing a separate draft for each eligible contact…';
        try {
          const { drafts, skipped, focus: draftTopic } = await api('facility-outreach-drafts', {
            state: facility.state, category, sourceURL: facility.sourceURL, communicationFocus: focus,
          });
          if (active !== request) return;
          draftFocus = focus;
          draftList.replaceChildren(...drafts.map(draftCard));
          draftStatus.textContent = drafts.length
            ? `${drafts.length} individual ${drafts.length === 1 ? 'draft' : 'drafts'} ready. No email sent.`
              + (draftTopic ? ` Focus · ${draftTopic}.` : '')
              + (skipped ? ` ${skipped} ${skipped === 1 ? 'contact excluded' : 'contacts excluded'}.` : '')
            : 'No contacts with eligible business email addresses.';
        } catch (error) {
          if (active === request) draftStatus.textContent = error.message || 'Could not prepare drafts. Try again.';
        } finally {
          if (active === request) {
            outreach.disabled = false;
            reviews.allowDraft(canDraft);
          }
        }
      };
      outreach.onclick = () => void prepareOutreach(draftFocus ?? reviews.focus());
    }

    function appendFact(parent, label, value, url, sourceName = 'Source') {
      const fact = document.createElement('div');
      fact.className = 'facility-fact';
      fact.append(textNode('dt', label));
      const field = textNode('dd', value || 'Unavailable');
      const source = url && link(url, sourceName);
      if (source) field.append(source);
      fact.append(field);
      parent.append(fact);
    }

    function personButton(parent, person, selectPerson) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'facility-person';
      button.dataset.facilityPerson = person.name;
      button.setAttribute('aria-pressed', 'false');
      const icon = document.createElement('span');
      icon.className = 'facility-person-avatar';
      paintPortrait(icon, person);
      const info = document.createElement('span');
      info.append(textNode('strong', person.name), textNode('small', person.title));
      button.append(icon, info);
      button.onclick = () => selectPerson(person);
      parent.append(button);
    }

    function render(facility, category, personName, { loading = false, officeId } = {}) {
      const { profile = {}, cms, administrator } = facility;
      researchTarget = facility.sourceURL ? { state: facility.state, category, sourceURL: facility.sourceURL } : undefined;
      find('location').textContent = [[facility.city, facility.state].filter(Boolean).join(', '), types[category]].filter(Boolean).join(' · ');
      find('title').textContent = facility.name;
      find('description').textContent = profile.description || (cms ? 'Medicare or Medicaid-certified nursing facility.'
        : facility.sourceURL && category === 'senior-center' ? 'Community facility listed in OpenStreetMap.' : 'Saved prospect.');
      const facts = find('facts');
      facts.replaceChildren();
      if (cms) {
        appendFact(facts, 'Certified beds', bedText(facility.certifiedBeds ?? cms.beds), facility.sourceURL, 'CMS');
        appendFact(facts, 'CMS overall rating', cmsRatingText(facility.cmsRating ?? cms.overallRating), facility.sourceURL, 'CMS');
        if (cms.processingDate) appendFact(facts, 'CMS processing date', cms.processingDate, facility.sourceURL, 'CMS');
        if (cms.program) appendFact(facts, 'Certification', cms.program, facility.sourceURL, 'CMS');
        if (cms.ownership) appendFact(facts, 'Ownership', cms.ownership, facility.sourceURL, 'CMS');
      }
      if (facility.hours) appendFact(facts, 'Opening hours', facility.hours, facility.sourceURL, 'OpenStreetMap');
      const publicFacts = profile.facts || [];
      for (const fact of publicFacts) appendFact(facts, fact.label, fact.value, fact.sourceURL);
      if (!facility.hours && !publicFacts.some(fact => fact.label === 'Visiting hours')) {
        appendFact(facts, category === 'nursing-home' ? 'Visiting hours' : 'Opening hours', '');
      }
      if (!publicFacts.some(fact => fact.label === 'Building area')) appendFact(facts, 'Building area', '');
      const address = [facility.address, [facility.city, facility.state, facility.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      if (address) appendFact(facts, 'Address', address, facility.sourceURL, facility.sourceName || 'Directory');
      const sourceLinks = find('links');
      sourceLinks.replaceChildren(...[link(profile.website || facility.website, 'Facility website'), link(facility.sourceURL, facility.sourceName || 'Directory record')].filter(Boolean));
      reviews.target(facility, officeId ? { officeId } : { state: facility.state, category, sourceURL: facility.sourceURL });
      const people = profile.people || [];
      setupOutreach(facility, category, loading ? [] : [administrator, ...people]);
      if (loading) {
        find('team-status').textContent = 'Loading directory profile…';
        team.replaceChildren();
        contact.replaceChildren();
        return;
      }
      find('team-status').textContent = administrator || people.length
        ? 'Published roles grouped by department. Reporting lines are unavailable.'
        : 'Public leadership profiles are unavailable for this facility.';
      team.replaceChildren();
      function selectPerson(person) {
        team.querySelectorAll('[data-facility-person]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.facilityPerson === person?.name)));
        contact.replaceChildren(administratorProfile(facility, person, { showTitle: true, showResearch: true }));
      }
      if (administrator) {
        const lead = document.createElement('section');
        lead.className = 'facility-team-lead';
        lead.append(textNode('h4', 'Facility leadership'));
        personButton(lead, administrator, selectPerson);
        team.append(lead);
      }
      if (people.length) {
        const departments = document.createElement('div');
        departments.className = 'facility-departments';
        const groups = new Map();
        for (const person of people) {
          if (!groups.has(person.group)) groups.set(person.group, []);
          groups.get(person.group).push(person);
        }
        for (const [group, members] of groups) {
          const department = document.createElement('section');
          department.append(textNode('h4', group));
          members.forEach(person => personButton(department, person, selectPerson));
          departments.append(department);
        }
        team.append(departments);
      }
      selectPerson([administrator, ...people].find(person => person?.name && person.name === personName) || administrator || people[0]);
    }
    function show() {
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.facility-profile-body').scrollTop = 0;
    }
    function showReviews() {
      reviews.show();
      dialog.querySelector('[data-facility-reviews] > summary')?.scrollIntoView?.({ block: 'nearest' });
    }
    find('close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      if (!dialog.open) { request++; reviews.reset(); }
    });
    return {
      researchTarget() { return dialog.open ? researchTarget : undefined; },
      open(row, category, personName, shouldShowReviews = false) {
        request++;
        render(row, category, personName);
        show();
        if (shouldShowReviews) showReviews();
      },
      async openSaved(record) {
        const { office, metadata } = record;
        const row = { name: record.name, state: record.state, city: office.locality, address: metadata.address, zip: metadata.postalCode,
          phone: office.contact_phone, email: office.contact_email, website: metadata.website, administrator: metadata.facilityAdministrator,
          sourceURL: metadata.facilitySource || metadata.facilityBedSource, certifiedBeds: record.certifiedBeds, cmsRating: record.cmsRating,
          cms: metadata.facilityBedSource || metadata.facilityCmsRatingSource ? { processingDate: metadata.facilityBedDate } : undefined };
        const options = { officeId: record.id, loading: Boolean(row.sourceURL) };
        const active = ++request;
        render(row, record.type, row.administrator?.name, options);
        show();
        if (!row.sourceURL) { reviews.show(); return; }
        try {
          const page = await api('territory-facilities', { state: row.state, category: record.type, sourceURL: row.sourceURL });
          if (active !== request) return;
          render(page.results[0] || row, record.type, row.administrator?.name, { officeId: record.id });
        } catch {
          if (active !== request) return;
          render(row, record.type, row.administrator?.name, { officeId: record.id });
          find('team-status').textContent = 'Public profile unavailable. Showing the saved facility record.';
        }
      },
    };
  }

  function mountDirectory(panel, { api, refresh, onOpenOffice, openProfile, onResearch }) {
    const facilities = window.SdrTerritoryFacilities;
    if (!panel || !facilities?.saveForm) return null;
    const find = name => panel.querySelector(`[data-prospect-directory-${name}]`);
    const status = find('status'), heading = panel.querySelector('h4'), sources = find('sources');
    const table = find('table'), results = find('results'), navigation = find('pages');
    const previous = find('prev'), next = find('next'), retry = find('retry');
    let criteria, key = '', sequence = 0, timer, offset = 0, report;

    function rowFor(facility, page) {
      const row = document.createElement('tr');
      row.innerHTML = `<th scope="row"><button type="button" class="facility-profile-open" data-open-facility-profile><strong>${escape(facility.name)}</strong></button>
        <small>${escape([facility.address, [facility.city, facility.state, facility.zip].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</small></th>
        <td>${escape(types[page.category])}</td><td class="prospects-cms-value" data-prospect-directory-beds>${bedText(facility.certifiedBeds ?? facility.cms?.beds)}</td>
        <td class="prospects-cms-value" data-prospect-directory-cms-rating>${cmsRatingText(facility.cmsRating ?? facility.cms?.overallRating)}</td><td data-regular-contact></td><td></td>`;
      row.querySelector('[data-open-facility-profile]').onclick = () => openProfile(facility, page.category);
      row.querySelector('[data-regular-contact]').append(administratorProfile(facility, facility.administrator, {
        open: () => openProfile(facility, page.category, facility.administrator?.name),
      }));
      const source = facilities.sourceLink(facility.sourceURL, facility.sourceName || 'Source record');
      if (source) row.querySelector('th').append(source);
      const actions = document.createElement('div');
      actions.className = 'prospects-directory-actions';
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'button secondary';
      view.textContent = 'View profile';
      view.onclick = () => openProfile(facility, page.category);
      const google = document.createElement('button');
      google.type = 'button';
      google.className = 'button secondary';
      google.textContent = 'Google reviews';
      google.setAttribute('aria-label', 'Google reviews for ' + facility.name);
      google.onclick = () => openProfile(facility, page.category, undefined, true);
      actions.append(view, google, facilities.saveForm(facility,
        fields => api('territory-facility-save', { ...fields, state: page.state, category: page.category, sourceURL: facility.sourceURL }),
        onOpenOffice, refresh, 'Open prospect'));
      row.lastElementChild.append(actions);
      return row;
    }

    function paint(page) {
      results.replaceChildren(...(page?.results || []).map(facility => rowFor(facility, page)));
      sources.replaceChildren(...(page?.sources || []).map(source => facilities.sourceLink(source.url, source.name)).filter(Boolean));
      table.hidden = !page?.results.length;
      navigation.hidden = !page?.offset && !page?.hasMore;
      previous.disabled = !page?.offset;
      next.disabled = !page?.hasMore;
      if (page) table.scrollTop = 0;
    }

    async function load(pageOffset, request) {
      offset = pageOffset;
      report = undefined;
      retry.hidden = true;
      paint();
      table.setAttribute('aria-busy', 'true');
      try {
        const page = await api('territory-facilities', { ...criteria, offset });
        if (request !== sequence) return;
        report = page;
        paint(page);
        heading.textContent = `Directory matches (${page.total.toLocaleString()})`;
        status.textContent = page.results.length
          ? `Showing ${page.offset + 1}–${page.offset + page.results.length} of ${page.total.toLocaleString()} for ${regionLabel(page.state)}.`
          : 'No directory matches for these filters.';
        if (page.total && page.category === 'nursing-home' && Number.isInteger(page.namedAdministrators)) {
          status.textContent += ` ${page.namedAdministrators.toLocaleString()} of ${page.total.toLocaleString()} have a published administrator.`;
        }
        if (page.bedCoverage?.unknown && (criteria.minBeds !== undefined || criteria.maxBeds !== undefined)) {
          status.textContent += ` ${page.bedCoverage.unknown.toLocaleString()} without a published bed count excluded.`;
        }
        if (page.cmsRatingCoverage?.unknown && criteria.maxCmsRating !== undefined) {
          status.textContent += ` ${page.cmsRatingCoverage.unknown.toLocaleString()} without a CMS overall rating excluded.`;
        }
        if (page.issues?.length) status.textContent += ' Some source results may be unavailable.';
        onResearch(page.savedFacilityResearch || []);
      } catch (error) {
        if (request !== sequence) return;
        status.textContent = error.message || 'The directory could not be loaded.';
        status.dataset.error = 'true';
        retry.hidden = false;
      } finally {
        if (request === sequence) table.removeAttribute('aria-busy');
      }
    }

    function start(pageOffset) {
      status.dataset.error = 'false';
      status.textContent = `Loading ${regionLabel(criteria.state)} directory…`;
      void load(pageOffset, ++sequence);
    }
    previous.onclick = () => { if (report?.offset) start(Math.max(0, report.offset - report.limit)); };
    next.onclick = () => { if (report?.hasMore) start(report.offset + report.limit); };
    retry.onclick = () => start(offset);
    return {
      update(input, searchDelay = 0) {
        const wanted = input ? JSON.stringify(input) : '';
        if (wanted === key) return;
        clearTimeout(timer);
        key = wanted;
        const request = ++sequence;
        criteria = input;
        panel.hidden = !input;
        if (!input) return;
        heading.textContent = 'Directory matches';
        status.dataset.error = 'false';
        status.textContent = `Loading ${regionLabel(input.state)} directory…`;
        retry.hidden = true;
        paint();
        if (searchDelay) timer = setTimeout(() => void load(0, request), searchDelay);
        else void load(0, request);
      },
    };
  }

  function mount({ api, refresh, onOpenOffice, onCompose }) {
    const root = document.querySelector('.sdr-prospects');
    if (!root) return null;
    const $ = selector => root.querySelector(selector);
    const $$ = selector => [...root.querySelectorAll(selector)];
    const filter = $('#sales-business-prospect-filter');
    const editor = $('[data-prospect-editor]');
    const addForm = $('#sales-business-prospect-form');
    const detail = $('[data-prospect-detail]');
    const emptyDetail = detail.innerHTML;
    const editorStatus = $('[data-prospect-editor-status]');
    const bedStatus = $('#prospect-bed-filter-status');
    const linkedIn = $('#sales-linkedin-prospects');
    let workspace, records = [], visible = [], selected = '', view = 'list', index = 0, descending = false;
    let storageKey, detailRequest = 0, detailStale = true, saving = false;
    let stages = new Set(), lastLink, searchDelay = 0;
    const facilityResearch = new Map();
    const profileDialog = facilityProfile($('[data-facility-profile]'), api, onCompose);
    const directory = mountDirectory($('[data-prospect-directory]'), { api, refresh, onOpenOffice, openProfile: profileDialog.open, onResearch: applyResearch });

    function readBusiness(office) {
      const row = business(office), source = facilityResearch.get(row.id);
      if (!source) return row;
      row.certifiedBeds = source.certifiedBeds;
      row.cmsRating = source.cmsRating;
      if (row.type === 'other') row.type = 'nursing-home';
      row.metadata.facilityBedSource = source.sourceURL;
      row.metadata.facilityCmsRatingSource = source.sourceURL;
      row.metadata.facilityBedDate = source.processingDate;
      return row;
    }
    function applyResearch(research) {
      let changed = false;
      for (const result of research) {
        const id = String(result.officeId), prior = facilityResearch.get(id);
        if (prior?.certifiedBeds === result.certifiedBeds && prior?.cmsRating === result.cmsRating &&
            prior?.processingDate === result.processingDate && prior?.sourceURL === result.sourceURL) continue;
        facilityResearch.set(id, result);
        changed = true;
      }
      if (!changed) return;
      records = workspace.offices.map(readBusiness);
      updateList({ detailChanged: true });
    }

    function writeStatus(target, message, error = false) {
      target.textContent = message;
      target.dataset.error = String(error);
    }
    function option(value, text) {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = text;
      return item;
    }
    function criteria() {
      const fields = filter.elements;
      return { query: fields.query.value, type: fields.type.value, state: fields.state.value,
        minBeds: fields.minBeds.value, maxBeds: fields.maxBeds.value, maxCmsRating: fields.maxCmsRating.value, stages: [...stages] };
    }
    function researchFilters() {
      const { minBeds, maxBeds, maxCmsRating } = filter.elements;
      const min = minBeds.value ? minBeds.valueAsNumber : undefined;
      const max = maxBeds.value ? maxBeds.valueAsNumber : undefined;
      const rating = maxCmsRating.value ? Number(maxCmsRating.value) : undefined;
      let error = '';
      if (!minBeds.validity.valid || !maxBeds.validity.valid) error = 'Enter a whole bed count between 0 and 9,999.';
      else if (min !== undefined && max !== undefined && min > max) error = 'Maximum certified beds must be at least the minimum.';
      return { values: { minBeds: min, maxBeds: max, maxCmsRating: rating }, error };
    }
    function setResearchFields(values = {}) {
      for (const name of ['minBeds', 'maxBeds', 'maxCmsRating']) {
        const value = values[name];
        filter.elements[name].value = (typeof value === 'string' && /^\d+$/.test(value)) || Number.isSafeInteger(value) ? String(value) : '';
      }
    }
    function replaceOptions(select, first, entries, prior = select.value) {
      select.replaceChildren(option('', first), ...entries.map(([value, text]) => option(value, text)));
      if (entries.some(([value]) => value === prior)) select.value = prior;
    }
    function choosePane(name) {
      view = name;
      $$('[data-prospect-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.prospectView === name)));
      $$('[data-prospect-pane]').forEach(pane => { pane.hidden = pane.dataset.prospectPane !== name; });
      paintList();
    }
    function renderFilters(saved) {
      const typeCounts = new Map();
      const stageCounts = new Map();
      for (const row of records) {
        typeCounts.set(row.type, (typeCounts.get(row.type) || 0) + 1);
        stageCounts.set(row.stage, (stageCounts.get(row.stage) || 0) + 1);
      }
      replaceOptions(filter.elements.type, 'All types', Object.entries(types).map(([value, name]) =>
        [value, typeCounts.has(value) ? `${name} (${typeCounts.get(value)})` : name]), saved.type);
      const user = workspace.user;
      const areas = user.territory?.version === 1 ? user.territory.areas.map(area => area.state) :
        user.states?.length ? user.states : workspace.states;
      replaceOptions(filter.elements.state, 'All territories', [...areas].sort((a,b) => collator.compare(regionLabel(a), regionLabel(b)))
        .map(state => [state, regionLabel(state)]), saved.state);
      $('[data-prospect-stages]').innerHTML = [...new Set([...Object.keys(statuses).slice(0, 6), 'interested', ...stageCounts.keys(), ...stages])]
        .map(stage => `<label class="prospects-status-button" data-stage="${stage}">
          <input type="checkbox" name="stage" value="${stage}" ${stages.has(stage) ? 'checked' : ''}>
          <span class="prospects-status-mark" aria-hidden="true"></span>
          <span>${label(stage)}</span><span class="prospects-status-count">${stageCounts.get(stage) || 0}</span>
        </label>`).join('');
    }
    function stats() {
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const values = { total: records.length, active: 0, due: 0, progress: 0, ready: 0 };
      for (const row of records) {
        if (row.stage === 'active') values.active++;
        if (row.due && row.due <= today && !closed.has(row.stage)) values.due++;
        if (ongoing.has(row.stage)) values.progress++;
        const info = row.metadata, check = info.independenceVerification;
        if (row.stage === 'interested' && workspace.terms && !info.primaryContactDoNotContact &&
            info.independence === 'independent' && check?.reviewed === true && check.finding === 'independent' &&
            check.sourceURL && check.note && check.checkedAt) values.ready++;
      }
      Object.entries(values).forEach(([key, value]) => { $(`[data-prospect-metric="${key}"]`).textContent = value.toLocaleString(); });
    }
    function updateList({ reset = false, detailChanged = false } = {}) {
      if (reset) index = 0;
      const { query, type, state } = criteria();
      const { values: { minBeds, maxBeds, maxCmsRating }, error } = researchFilters();
      writeStatus(bedStatus, error, Boolean(error));
      const terms = searchKey(query).split(/\s+/).filter(Boolean);
      visible = records.filter(row => {
        if (error || (state && row.state !== state) || (type && row.type !== type) || (stages.size && !stages.has(row.stage))) return false;
        if ((minBeds !== undefined || maxBeds !== undefined) &&
            (!isBedCount(row.certifiedBeds) || row.certifiedBeds < (minBeds ?? 0) || row.certifiedBeds > (maxBeds ?? Infinity))) return false;
        if (maxCmsRating !== undefined && (!isCmsRating(row.cmsRating) || row.cmsRating > maxCmsRating)) return false;
        const { contact_name, contact_email, contact_phone } = row.office;
        const words = searchKey([row.name, row.location, types[row.type], contact_name, contact_email, contact_phone,
          row.metadata.address, row.office.pipeline?.lastContact?.note, row.next].join(' '));
        return terms.every(term => words.includes(term));
      }).sort((a, b) => (descending ? -1 : 1) * collator.compare(a.name, b.name) || collator.compare(a.location, b.location));
      if (!visible.some(row => row.id === selected)) {
        selected = visible[index * pageSize]?.id || visible[0]?.id || '';
        detailChanged = true;
      }
      if (detailChanged) {
        detailStale = true;
        if (!root.hidden) showDetails();
      }
      paintList();
    }
    function rowMarkup(row) {
      const date = dateText(row.due);
      const nextLabel = closed.has(row.stage) ? '—' : row.stage === 'new' ? 'Contact' : row.stage === 'replied' ? 'Review reply' : 'Follow up';
      return `<tr class="${row.id === selected ? 'is-selected' : ''}">
        <th scope="row"><button type="button" data-prospect-select="${escape(row.id)}" aria-pressed="${row.id === selected}"><strong>${escape(row.name)}</strong><small>${escape(row.location)}</small></button></th>
        <td><span class="prospects-type" title="${types[row.type]}">${icon('business')}<span class="prospects-type-label">${types[row.type]}</span></span></td>
        <td class="prospects-cms-value" data-prospect-saved-beds>${bedText(row.certifiedBeds)}</td>
        <td class="prospects-cms-value" data-prospect-saved-cms-rating>${cmsRatingText(row.cmsRating)}</td>
        <td>${stageBadge(row)}</td>
        <td><span class="prospects-next" title="${escape(row.next)}">${date ? icon('date') + escape(date) : escape(nextLabel)}</span></td>
      </tr>`;
    }
    function paintList() {
      const { type, state, query } = criteria();
      const { values, error } = researchFilters();
      const showDirectory = directory && !error && !root.hidden && view === 'list' && state && !stages.size &&
        ['nursing-home', 'senior-center'].includes(type);
      directory?.update(showDirectory ? { state, category: type, query: query.trim().slice(0, 100), ...values } : null, searchDelay);
      $('[data-prospect-saved-table]').hidden = Boolean(showDirectory && !visible.length);
      $('[data-prospect-count]').textContent = showDirectory ? `(${visible.length.toLocaleString()} saved)` : `(${visible.length.toLocaleString()})`;
      const pages = Math.ceil(visible.length / pageSize);
      index = Math.max(0, Math.min(index, pages - 1));
      const start = index * pageSize;
      const empty = $('[data-prospect-empty]');
      empty.hidden = visible.length > 0 || Boolean(showDirectory);
      empty.textContent = error ? 'Correct the certified bed range to show results.' :
        records.length || stages.size ? 'No saved prospects match these filters.' :
        'Choose Nursing home or Senior community center and a territory to find directory matches, or add a prospect.';
      if (view === 'list') $('[data-prospect-rows]').innerHTML = visible.slice(start, start + pageSize).map(rowMarkup).join('');
      if (view === 'map') paintMap();
      if (view === 'pipeline') paintBoard();
      $('[data-prospect-pages]').hidden = view !== 'list' || !visible.length;
      $('[data-prospect-prev]').disabled = index === 0;
      $('[data-prospect-next]').disabled = index + 1 >= pages;
      $('[data-prospect-range]').textContent = visible.length ?
        `Showing ${start + 1}–${Math.min(start + pageSize, visible.length)} of ${visible.length}` : '';
      const first = Math.max(0, Math.min(index - 1, pages - 3));
      $('[data-prospect-page-buttons]').innerHTML = Array.from({ length: Math.min(3, pages) }, (_, i) => {
        const number = first + i;
        return `<button type="button" data-prospect-page="${number}" aria-label="Page ${number + 1}" ${number === index ? 'aria-current="page"' : ''}>${number + 1}</button>`;
      }).join('');
    }
    function paintMap() {
      const counts = new Map();
      for (const row of visible) counts.set(row.state, (counts.get(row.state) || 0) + 1);
      $$('[data-prospect-pane="map"] path[data-state]').forEach(path => {
        const state = path.dataset.state, count = counts.get(state) || 0;
        path.classList.toggle('has-prospects', count > 0);
        path.setAttribute('tabindex', count ? '0' : '-1');
        path.setAttribute('aria-disabled', String(!count));
        path.setAttribute('aria-pressed', String(filter.elements.state.value === state));
        const name = `${regionLabel(state)} · ${count} ${count === 1 ? 'prospect' : 'prospects'}`;
        path.setAttribute('aria-label', name);
        path.querySelector('title').textContent = name;
      });
      $('[data-prospect-map-summary]').innerHTML = [...counts].sort(([a], [b]) => collator.compare(regionLabel(a), regionLabel(b)))
        .map(([state, count]) => `<button type="button" class="button secondary" data-prospect-region="${escape(state)}">${escape(regionLabel(state))} · ${count}</button>`).join('') ||
        '<p class="prospects-empty">No prospects match these territories.</p>';
    }
    function paintBoard() {
      const columns = [
        ['New', row => ['new', 'researching'].includes(row.stage)],
        ['In conversation', row => ['contacted', 'replied', 'waiting', 'meeting', 'interested'].includes(row.stage)],
        ['Contract', row => contractStage.has(row.stage)],
        ['Closed', row => ['not_interested', 'do_not_contact'].includes(row.stage)],
      ];
      $('[data-prospect-pane="pipeline"]').innerHTML = columns.map(([title, includes]) => {
        const rows = visible.filter(includes);
        return `<section><h4>${title} <small>${rows.length}</small></h4>${rows.map(row =>
          `<button type="button" data-prospect-select="${escape(row.id)}" aria-pressed="${row.id === selected}"><strong>${escape(row.name)}</strong><small>${label(row.stage)}</small></button>`).join('') ||
          '<p>No prospects</p>'}</section>`;
      }).join('');
    }
    function renderDetails(row) {
      const office = row.office, locked = contractStage.has(row.stage), paused = closed.has(row.stage);
      detail.innerHTML = `<header class="prospects-detail-head"><span>${icon('business')}</span>
        <div><h3>${escape(row.name)}</h3><p>${escape(row.location)}</p></div><button type="button" class="prospects-more" data-prospect-details-open aria-label="Open complete office record">···</button>
      </header>
      <div class="prospects-detail-body">
        <section><label>Status<select data-prospect-status ${locked ? 'disabled' : ''}>
          ${Object.entries(statuses).filter(([value]) => !contractStage.has(value) || value === row.stage)
            .map(([value, name]) => `<option value="${value}" ${value === row.stage ? 'selected' : ''}>${name}</option>`).join('')}
        </select></label></section>
        <section><h4>Office type</h4><p class="prospects-inline">${icon('business')}${types[row.type]}</p></section>
        ${row.type === 'nursing-home' || isBedCount(row.certifiedBeds) ? `<section><h4>Certified beds</h4><p>${bedText(row.certifiedBeds)} · CMS</p></section>
          <section><h4>CMS overall rating</h4><p>${cmsRatingText(row.cmsRating)}</p></section>` : ''}
        <section><h4>Contact</h4><p class="prospects-inline">${icon('person')}<strong>${escape(office.contact_name || 'No contact saved')}</strong></p>
          ${office.contact_phone ? `<p>${escape(office.contact_phone)}</p>` : ''}${office.contact_email ? `<p class="prospects-inline">${icon('mail')}${escape(office.contact_email)}</p>` : ''}</section>
        <section><h4>Next action</h4><p class="prospects-inline">${icon('date')}<strong>${escape(row.due && !paused ? 'Follow up' : row.next || 'Review prospect')}</strong></p>
          ${dateText(row.due, fullDate) ? `<p>${escape(dateText(row.due, fullDate))}</p>` : ''}</section>
        ${row.metadata.facilityAdministrator ? '<section data-prospect-admin><h4>Facility Administrator</h4></section>' : ''}
        <section class="prospects-detail-notes"><div class="prospects-card-head"><h4>Notes</h4><button type="button" class="prospects-text" data-prospect-action="note">Add note</button></div><p class="prospects-note" data-prospect-note>Loading latest note…</p></section>
        <div class="prospects-detail-actions">
          <button type="button" class="button primary" data-prospect-action="followup" ${paused ? 'disabled' : ''}>${icon('date')} Schedule follow-up</button>
          <button type="button" class="button secondary" data-prospect-action="email" ${paused || !office.contact_email ? 'disabled' : ''}>${icon('mail')} Draft email</button>
          <button type="button" class="button secondary" data-prospect-action="call">Log call</button>
          ${row.metadata.facilitySource || (office.locality && row.state)
            ? `<button type="button" class="button secondary" data-prospect-action="facility-profile">${row.metadata.facilitySource ? 'Facility profile' : 'Google reviews'}</button>` : ''}
        </div>
        <p class="prospects-muted" data-prospect-action-status role="status"></p>
        <div data-prospect-action-form></div>
      </div>`;
      const role = row.metadata.facilityAdministrator;
      if (role) $('[data-prospect-admin]').append(administratorProfile({ name: row.name, city: office.locality, state: row.state }, role, {
        open: row.metadata.facilitySource ? () => void profileDialog.openSaved(row) : undefined,
      }));
    }
    function showDetails() {
      detailStale = false;
      const request = ++detailRequest;
      const row = records.find(record => record.id === selected);
      if (!row) { detail.innerHTML = emptyDetail; return; }
      renderDetails(row);
      void api('office', { id: row.id }).then(result => {
        if (request !== detailRequest) return;
        const note = result.events.slice().reverse().map(event => {
          try { return JSON.parse(event.notes); } catch { return null; }
        }).find(event => ['note', 'call', 'meeting'].includes(event?.action) && typeof event.detail === 'string');
        $('[data-prospect-note]').textContent = note?.detail || row.office.pipeline?.lastContact?.note || 'No notes recorded.';
      }).catch(() => {
        if (request === detailRequest) $('[data-prospect-note]').textContent = 'Notes could not be loaded.';
      });
    }
    async function saveDetail(action, input, message) {
      if (saving) return;
      const id = selected, target = $('[data-prospect-action-status]');
      saving = true;
      try {
        await api(action, { id, ...input });
        await refresh();
        if (selected === id) writeStatus($('[data-prospect-action-status]'), message);
      } catch (error) {
        if (target?.isConnected) {
          writeStatus(target, error.message, true);
          if (input.stage) $('[data-prospect-status]').value = records.find(row => row.id === id)?.stage || '';
        }
      } finally { saving = false; }
    }
    function actionForm(kind) {
      const row = records.find(item => item.id === selected);
      if (!row) return;
      const wrap = $('[data-prospect-action-form]');
      const field = kind === 'followup'
        ? `<label>Follow-up date<input type="date" name="nextFollowup" value="${escape(row.due)}" required></label>`
        : `<label>${kind === 'call' ? 'Call notes' : 'Note'}<textarea name="note" rows="3" maxlength="3000" required></textarea></label>`;
      wrap.innerHTML = `<form class="sales-form">${field}<div class="prospects-editor-actions">
        <button type="submit" class="button primary">${kind === 'followup' ? 'Save follow-up' : kind === 'call' ? 'Save call' : 'Save note'}</button>
        <button type="button" class="button secondary">Cancel</button></div></form>`;
      const form = wrap.querySelector('form');
      form.querySelector('input,textarea').focus();
      form.querySelector('button[type=button]').onclick = () => { wrap.replaceChildren(); };
      form.onsubmit = event => {
        event.preventDefault();
        const input = Object.fromEntries(new FormData(form));
        if (kind === 'followup') void saveDetail('update-office', input, 'Follow-up scheduled.');
        else void saveDetail('activity', { ...input, kind }, kind === 'call' ? 'Call logged.' : 'Note saved.');
      };
    }
    function openOffice(email = false) {
      const id = selected;
      void onOpenOffice(id).then(() => {
        if (email) document.querySelector('#sales-detail .sales-compose-form input[name="subject"]')?.focus();
      }).catch(error => {
        const target = $('[data-prospect-action-status]');
        if (target) writeStatus(target, error.message, true);
      });
    }
    detail.addEventListener('change', event => {
      if (event.target.matches('[data-prospect-status]')) void saveDetail('update-office', { stage: event.target.value }, 'Status updated.');
    });
    detail.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.hasAttribute('data-prospect-details-open') || button.dataset.prospectAction === 'email') openOffice(button.dataset.prospectAction === 'email');
      else if (button.dataset.prospectAction === 'facility-profile') {
        const record = records.find(row => row.id === selected);
        if (record) void profileDialog.openSaved(record);
      } else if (button.dataset.prospectAction) actionForm(button.dataset.prospectAction);
    });
    function setRegion(region) {
      const path = $(`[data-prospect-pane="map"] path[data-state="${region}"]`);
      if (!path || path.getAttribute('aria-disabled') === 'true') return;
      filter.elements.state.value = region;
      updateList({ reset: true });
      choosePane('list');
    }
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.dataset.prospectSelect) {
        selected = button.dataset.prospectSelect;
        showDetails();
        paintList();
        const target = $$('[data-prospect-select]').find(item => item.dataset.prospectSelect === selected && !item.closest('[hidden]'));
        target?.focus();
        if (event.detail > 0) detail.scrollIntoView?.({ block: 'nearest' });
      }
      if (button?.dataset.prospectView) choosePane(button.dataset.prospectView);
      if (button?.dataset.prospectPage !== undefined) { index = Number(button.dataset.prospectPage); paintList(); }
      const region = button?.dataset.prospectRegion || event.target.closest('[data-prospect-pane="map"] path')?.dataset.state;
      if (region) setRegion(region);
    });
    $('[data-prospect-pane="map"]').addEventListener('keydown', event => {
      if (event.target.dataset.state && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setRegion(event.target.dataset.state); }
    });
    filter.addEventListener('submit', event => { event.preventDefault(); updateList({ reset: true }); });
    filter.addEventListener('change', event => {
      if (event.target.matches('select')) updateList({ reset: true });
    });
    filter.addEventListener('input', event => {
      if (event.target.matches('select')) return;
      if (event.target.name === 'stage') stages = new Set([...filter.querySelectorAll('[name="stage"]:checked')].map(input => input.value));
      searchDelay = ['query', 'minBeds', 'maxBeds'].includes(event.target.name) ? 250 : 0;
      updateList({ reset: true });
      searchDelay = 0;
    });
    const globalSearch = document.querySelector('#sdr-header-search');
    globalSearch?.addEventListener('submit', event => {
      if (root.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      filter.elements.query.value = globalSearch.querySelector('input').value;
      updateList({ reset: true });
      choosePane('list');
    }, true);
    $('[data-prospect-clear]').onclick = () => {
      filter.reset();
      filter.elements.type.value = filter.elements.state.value = '';
      stages.clear();
      try { localStorage.removeItem(storageKey); } catch {}
      renderFilters(criteria());
      updateList({ reset: true });
      writeStatus($('[data-prospect-filter-status]'), 'Filters cleared.');
    };
    $('[data-prospect-save-filter]').onclick = () => {
      if (researchFilters().error) return writeStatus($('[data-prospect-filter-status]'), 'Correct the certified bed range before saving.', true);
      try {
        localStorage.setItem(storageKey, JSON.stringify(criteria()));
        writeStatus($('[data-prospect-filter-status]'), 'Filter saved on this device.');
      } catch { writeStatus($('[data-prospect-filter-status]'), 'This browser could not save the filter.', true); }
    };
    $('[data-prospect-sort]').onclick = event => {
      descending = !descending;
      event.currentTarget.closest('th').setAttribute('aria-sort', descending ? 'descending' : 'ascending');
      updateList({ reset: true });
    };
    $('[data-prospect-prev]').onclick = () => { index--; paintList(); };
    $('[data-prospect-next]').onclick = () => { index++; paintList(); };
    function closeEditor() {
      editor.hidden = true;
      $('[data-prospect-add]').focus();
    }
    $('[data-prospect-add]').onclick = () => {
      writeStatus(editorStatus, '');
      editor.hidden = false;
      editor.scrollIntoView?.({ block: 'nearest' });
      addForm.elements.namedItem('name').focus();
    };
    $('[data-prospect-cancel]').onclick = closeEditor;
    $('[data-prospect-linkedin]').onclick = () => {
      editor.hidden = true;
      linkedIn.open = true;
      $('#sales-add-prospect').click();
    };
    addForm.onsubmit = async event => {
      event.preventDefault();
      const button = addForm.querySelector('button[type=submit]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const { office, duplicate } = await api('create-office', Object.fromEntries(new FormData(addForm)));
        filter.elements.query.value = filter.elements.type.value = filter.elements.state.value = '';
        setResearchFields();
        stages.clear();
        selected = String(office.id);
        index = 0;
        await refresh();
        addForm.reset();
        closeEditor();
        const position = visible.findIndex(item => item.id === selected);
        if (position >= 0) index = Math.floor(position / pageSize);
        choosePane('list');
        if (selected === String(office.id)) writeStatus($('[data-prospect-action-status]'), duplicate ? 'This prospect is already saved.' : 'Prospect saved.');
      } catch (error) { writeStatus(editorStatus, error.message, true); }
      finally { button.disabled = false; }
    };
    return {
      enter() {
        const link = location.hash;
        if (lastLink !== link) {
          lastLink = link;
          const params = new URLSearchParams(link.slice(1));
          if (params.get('view') === 'prospects') {
            if (params.has('query')) filter.elements.query.value = params.get('query').slice(0, 180);
            for (const field of ['type', 'state']) {
              const select = filter.elements[field], value = params.get(field);
              if (value && [...select.options].some(option => option.value === value)) select.value = value;
            }
            const researchKeys = ['minBeds', 'maxBeds', 'maxCmsRating'];
            if (researchKeys.some(key => params.has(key))) {
              const current = criteria();
              setResearchFields(Object.fromEntries(researchKeys.map(key => [key, params.get(key) ?? current[key]])));
            }
          }
        }
        updateList({ detailChanged: detailStale });
      },
      render(data) {
        workspace = data;
        const key = `sdr-prospect-filter:${location.pathname}:${data.user.id}`;
        let saved = criteria();
        if (storageKey !== key) {
          storageKey = key;
          facilityResearch.clear();
          try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch { saved = {}; }
          filter.elements.query.value = typeof saved.query === 'string' ? saved.query.slice(0, 180) : '';
          setResearchFields(saved);
          stages = new Set(Array.isArray(saved.stages) ? saved.stages.filter(stage => Object.hasOwn(statuses, stage)) : []);
        }
        records = data.offices.map(readBusiness);
        renderFilters(saved);
        stats();
        updateList({ detailChanged: true });
      },
      researchContext() {
        const { query, type, state } = criteria();
        const { values, error } = researchFilters();
        return { state, category: type, query: query.trim().slice(0, 100), ...(error ? {} : values), selected: profileDialog.researchTarget() };
      },
      research({ state, category, query, ...values } = {}) {
        if (state !== undefined && [...filter.elements.state.options].some(option => option.value === state)) filter.elements.state.value = state;
        if (category !== undefined && Object.hasOwn(types, category)) filter.elements.type.value = category;
        if (typeof query === 'string') filter.elements.query.value = query.slice(0, 180);
        setResearchFields(values);
        stages.clear();
        renderFilters(criteria());
        choosePane('list');
        updateList({ reset: true });
      },
    };
  }
  window.SdrProspects = { mount };
})();
