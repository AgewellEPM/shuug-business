(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const meta = row => { try { return JSON.parse(row.notes || '{}'); } catch { return {}; } };
  const title = value => String(value).replaceAll('_', ' ');
  const status = (message, error = false, signup = false) => {
    const targets = [$(signup ? '#signup-message' : '#sales-message')];
    if (!signup && $('#sales-gate') && !$('#sales-gate').hidden) targets.push($('#sales-login-status'));
    if (!signup && $('#sales-detail-drawer') && !$('#sales-detail-drawer').hidden) targets.push($('#sales-detail-status'));
    targets.filter(Boolean).forEach(el => { el.textContent = message; el.dataset.error = error; });
  };
  async function api(action, body = {}) {
    const r = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type':'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...body, action }) });
    const result = await r.json();
    if (!r.ok) { const error = new Error(result.error || 'The request did not finish.'); error.status = r.status; throw error; }
    return result;
  }
  function download(name, content, type = 'text/plain') { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([content], { type })); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function run(work, form) {
    return async event => {
      event?.preventDefault(); const buttons = form ? $$('button', form).map(button => ({ button, disabled: button.disabled })) : []; buttons.forEach(({ button }) => button.disabled = true);
      try { await work(event); } catch (err) { status(err.message, true, Boolean($('[data-signup-app]'))); }
      finally { buttons.forEach(({ button, disabled }) => { if (button.isConnected) button.disabled = disabled; }); }
    };
  }
  function link(url, text) { try { const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol)) return ''; return `<a href="${e(u.href)}" target="_blank" rel="noopener noreferrer">${e(text)}</a>`; } catch { return ''; } }
  if ($('[data-sales-app]')) {
    let data, selected, consoleUI, contactsUI, detailFocus, officeRequest = 0, discoveryRequest = 0, discoveryState = { query: null, offset: 0, limit: 50, total: 0, hasMore: false };
    const tab = name => {
      if (name === 'team' && data?.user.role !== 'owner') name = 'home';
      $$('[data-tab-panel]').forEach(p => p.hidden = p.dataset.tabPanel !== name || (p.hasAttribute('data-owner-only') && data.user.role !== 'owner'));
      $$('[data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === name));
      if ($('#sales-view-title')) $('#sales-view-title').textContent = ({ home: 'Overview', pipeline: 'Pipeline', contacts: 'Owners & Rolodex', territories: 'Territories', discover: 'Find offices', team: 'Sales team' })[name] || 'Workspace';
      $('#sales-stats').hidden = name === 'home';
      consoleUI?.navigate(name);
    };
    function closeDetail() {
      const drawer = $('#sales-detail-drawer'); if (!drawer) return;
      drawer.hidden = true; $('#sales-detail-backdrop').hidden = true;
      document.body.dataset.detailOpen = 'false';
      $$('.sdr-sidebar,.sdr-main').forEach(element => element.inert = false);
      const priorOffice = selected;
      selected = undefined; officeRequest++; if (data) renderList();
      const replacement = $$('[data-office]').find(button => button.dataset.office === priorOffice && !button.closest('[hidden]'));
      const priorFocusable = detailFocus?.isConnected && detailFocus.matches('button,a[href],input,select,textarea,[tabindex]') && !detailFocus.closest('#sales-detail-drawer,[hidden]');
      const focusTarget = priorFocusable ? detailFocus : replacement || $('[data-tab][aria-pressed="true"]');
      focusTarget?.focus();
    }
    $('#sales-detail-close')?.addEventListener('click', closeDetail);
    $('#sales-detail-backdrop')?.addEventListener('click', closeDetail);
    document.addEventListener('keydown', event => {
      const drawer = $('#sales-detail-drawer'); if (!drawer || drawer.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDetail(); return; }
      if (event.key === 'Tab') {
        const controls = $$('button:not([disabled]),a[href],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]', drawer).filter(element => {
          if (element.closest('[hidden]')) return false;
          const closed = element.closest('details:not([open])');
          return !closed || closed.querySelector(':scope > summary') === element;
        });
        const first = controls[0], last = controls.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      }
    });
    function renderList() {
      const filter = $('#sales-filter').value.toLowerCase(), stage = $('#sales-stage-filter').value;
      if ($('#sales-nav-count')) $('#sales-nav-count').textContent = data.offices.length;
      const offices = data.offices.filter(o => (!stage || o.status === stage) && [o.town,o.locality,o.state,o.contact_name,o.contact_email].join(' ').toLowerCase().includes(filter));
      $('#sales-offices').innerHTML = offices.length ? offices.map(o => `<button class="sales-office" data-office="${e(o.id)}" aria-pressed="${String(o.id) === selected}"><strong>${e(o.town)}</strong><small>${e(o.locality)}, ${e(o.state)} · ${e(title(o.status))}</small><small>${e(o.contact_name || 'Public contact needed')}${o.meeting_date ? ` · Follow up ${e(o.meeting_date)}` : ''}</small></button>`).join('') : '<p class="sales-empty">No offices in this view. Find an office to start your pipeline.</p>';
      $$('[data-office]').forEach(b => b.onclick = run(() => showOffice(b.dataset.office)));
      if (data) { consoleUI?.render(data); contactsUI?.render(data); }
    }
    async function refresh() {
      data = await api('bootstrap');
      $('#sales-login').hidden = true; $('#sales-workspace').hidden = false; $('#sales-identity').hidden = false; $('#sales-name').textContent = data.user.name;
      if ($('#sales-gate')) $('#sales-gate').hidden = true;
      $$('[data-owner-only]').forEach(el => { el.hidden = data.user.role !== 'owner'; });
      $$('[data-states]').forEach(s => { const previous = s.value; const states = data.user.states.length ? data.user.states : data.states; s.innerHTML = states.map(v => `<option>${e(v)}</option>`).join(''); if (states.includes(previous)) s.value = previous; });
      $$('[data-agents]').forEach(s => { s.innerHTML = '<option value="owner">Workspace owner</option>' + data.agents.map(a => `<option value="${e(a.id)}">${e(a.name)}</option>`).join(''); });
      const priorStage = $('#sales-stage-filter').value; $('#sales-stage-filter').innerHTML = '<option value="">All stages</option>' + data.stages.map(s => `<option value="${s}">${e(title(s))}</option>`).join(''); $('#sales-stage-filter').value = priorStage;
      const clock = new Date(), today = `${clock.getFullYear()}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`, stats = [ ['Offices', data.offices.length], ['Follow-ups due', data.offices.filter(o => o.meeting_date && o.meeting_date <= today && !['active','not_interested','do_not_contact'].includes(o.status)).length], ['Invited',data.offices.filter(o => o.status === 'invited').length], ['Active',data.offices.filter(o => o.status === 'active' && o.membership?.eligible === true).length] ];
      $('#sales-stats').innerHTML = stats.map(([label,count]) => `<div class="sales-stat"><strong>${count}</strong><span>${label}</span></div>`).join('');
      $('#sales-team').innerHTML = data.agents.length ? data.agents.map(a => `<div class="sales-result"><strong>${e(a.name)}</strong><p>${e(a.states.length ? a.states.join(', ') : 'Nationwide')}</p><button class="button secondary" data-revoke="${e(a.id)}">Revoke access</button></div>`).join('') : '<p>No agents yet.</p>';
      $$('[data-revoke]').forEach(b => b.onclick = run(async () => { if (!window.confirm('Revoke this agent’s sales access? Existing sessions will stop working.')) return; await api('revoke-agent',{id:b.dataset.revoke}); await refresh(); status('Agent access revoked. Their office assignments are retained for reassignment.'); }));
      $('#sales-payment-status').textContent = data.paymentsConfigured ? 'Stripe credentials are saved. Live checkout and billing still need verification.' : 'Stripe payment account and signed webhook connection are required before paid activation.';
      $('#sales-terms-status').textContent = data.terms ? `${data.terms.title} · ${data.terms.version}` : 'Agreement prepared for owner approval. Invitations will become available when the final terms are published.';
      renderList();
      window.GigTaxWorkflows?.queue({ offices: data.offices, onSelect: id => { tab('pipeline'); return showOffice(id).catch(error => status(error.message, true)); } });
      tab($('[data-tab][aria-pressed="true"]')?.dataset.tab || 'pipeline');
      if (selected) await showOffice(selected);
      if (data.user.role === 'owner') await window.GigTaxDirectory?.support({ api, status });
    }
    function showInvitation(result) {
      if (!result?.link) throw new Error('The backend did not return a private invitation link. Refresh this office before trying again.');
      $('#sales-invitation').innerHTML = '<p>Share privately with this owner. Link expires in 14 days.</p><a class="sales-secret" target="_blank" rel="noopener noreferrer"></a><button class="button secondary" id="sales-copy-invite">Copy signup link</button>';
      const anchor = $('#sales-invitation a'); anchor.href = result.link; anchor.textContent = result.link;
      $('#sales-copy-invite').onclick = run(async () => { await navigator.clipboard.writeText(result.link); status('Signup link copied.'); });
    }
    async function showOffice(id) {
      const requestId = ++officeRequest, target = $('#sales-detail');
      const drawer = $('#sales-detail-drawer');
      if (drawer) {
        if (drawer.hidden) detailFocus = document.activeElement;
        drawer.hidden = false; $('#sales-detail-backdrop').hidden = false;
        document.body.dataset.detailOpen = 'true';
        $$('.sdr-sidebar,.sdr-main').forEach(element => element.inert = true);
        $('#sales-detail-status').textContent = ''; $('#sales-detail-close').focus();
      }
      selected = String(id); renderList();
      target.setAttribute('aria-busy', 'true'); target.innerHTML = '<h2>Loading office record…</h2>';
      let record;
      try { record = await api('office', { id }); }
      catch (error) {
        if (requestId !== officeRequest) return;
        target.removeAttribute('aria-busy'); target.innerHTML = '<h2>Office record unavailable</h2><p>Refresh or select this office again to retry.</p>'; throw error;
      }
      if (requestId !== officeRequest) return;
      target.removeAttribute('aria-busy');
      const o = record.office, m = meta(o), panel = $('#sales-detail');
      const savedOwners = (record.contacts?.contacts || []).filter(c => !c.archived && !c.suppressed && ['owner','partner'].includes(c.role));
      if ($('#sales-detail-title')) $('#sales-detail-title').textContent = o.town;
      panel.innerHTML = `<p class="eyebrow">${e(o.state)} · ${e(title(o.status))}</p><h2>${e(o.town)}</h2><p>${e(m.address)}<br>${e(o.locality)}, ${e(o.state)}</p><div class="sales-actions">${link(m.website,'Office website ↗')}${link(m.source,'Research source ↗')}</div>
      <form id="sales-update-office" class="sales-form"><label>Public contact / decision maker (verify role)<input name="contact" value="${e(o.contact_name)}" maxlength="140"></label><label>Business email<input name="email" type="email" value="${e(o.contact_email)}"></label><label>Phone<input name="phone" type="tel" value="${e(o.contact_phone)}" maxlength="60"></label><label>Stage<select name="stage" ${o.status === 'active' ? 'disabled' : ''}>${data.stages.filter(s => !['active','invited'].includes(s) || s === o.status).map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${e(title(s))}</option>`).join('')}</select></label><label>Next follow-up<input type="date" name="nextFollowup" value="${e((o.meeting_date || '').slice(0,10))}"></label><label>Office website<input name="website" type="url" value="${e(m.website || '')}" maxlength="1200"></label><label>ZIP code<input name="postalCode" value="${e(m.postalCode || '')}" maxlength="10"></label><p>Ownership: <strong>${e(m.independence || 'unverified')}</strong>. Use the ownership verification tool below to record evidence.</p>${data.user.role === 'owner' ? `<label>Assigned agent<select name="assignedTo"><option value="owner">Workspace owner</option>${data.agents.map(a => `<option value="${e(a.id)}" ${String(o.assigned_to) === a.id ? 'selected' : ''}>${e(a.name)}</option>`).join('')}</select></label>` : ''}<button class="button primary">Save changes</button></form>
      <h3>Conversation tools</h3><p>Editable starting points. Review the office facts and current offer before using them.</p>${Object.entries(record.drafts).map(([name,text]) => `<details><summary>${e(title(name.replace('callScript','call script')))}</summary><pre class="sales-draft">${e(text)}</pre></details>`).join('')}
      <h3>Record a follow-up</h3><form id="sales-activity" class="sales-form"><label>Activity<select name="kind"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option></select></label><label>What happened?<textarea name="note" maxlength="3000" required></textarea></label><button class="button primary">Save activity</button></form>
      <h3>Invite the office owner</h3><p>The owner reviews the exact terms and signs for this office. Copy the link to share through your normal conversation.</p><form id="sales-invite" class="sales-form">${savedOwners.length ? `<label>Use a saved owner<select name="savedOwner"><option value="">Enter owner details below</option>${savedOwners.map(c => `<option value="${e(c.id)}">${e(c.name)} · ${c.verification ? 'source checked' : 'role needs checking'}</option>`).join('')}</select></label>` : ''}<label>Owner name<input name="ownerName" value="${e(o.contact_name)}" required maxlength="140"></label><label>Owner business email<input name="email" type="email" value="${e(o.contact_email)}" required></label><button class="button primary" ${!data.terms || m.primaryContactDoNotContact || (m.independence !== 'independent' || m.independenceVerification?.reviewed !== true) || ['active','do_not_contact','not_interested'].includes(o.status) ? 'disabled' : ''}>Create owner signup link</button></form><div id="sales-invitation"></div>
      <h3>Enrollments</h3>${record.enrollments.map(r => `<p>${e(r.contact_name)} · ${e(title(r.status))}${r.acceptedAt ? ` · ${e(new Date(r.acceptedAt).toLocaleString())}` : ''}</p>${data.user.role === 'owner' && r.hasLivePayment ? `<button class="button secondary" data-refresh-billing="${e(r.id)}">Refresh billing status</button>` : ''}`).join('') || '<p>No owner invitation yet.</p>'}${data.user.role === 'owner' && !m.primaryContactDoNotContact && !['do_not_contact','not_interested'].includes(o.status) && record.enrollments.some(r => r.expired) && !record.enrollments.some(r => r.hasLivePayment) ? '<form id="sales-renew-invitation" class="sales-form"><h4>Review an expired invitation</h4><label>Reason for a new invitation<textarea name="reason" maxlength="900" required></textarea></label><label class="sales-check"><input type="checkbox" name="reviewed" required>I reviewed the old invitation and want to prepare a fresh private link. This does not renew a paid membership.</label><button class="button secondary">Prepare fresh invitation</button></form>' : ''}<h3>Office history</h3>${record.events.slice().reverse().map(r => { const event = meta(r); return `<div class="sales-event"><small>${e(r.contact_name)} · ${e(title(event.action))} · ${e(new Date(event.at).toLocaleString())}</small><p>${e(typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail))}</p></div>`; }).join('')}`;
      const update = $('#sales-update-office'); update.onsubmit = run(async () => { const values = Object.fromEntries(new FormData(update)); if (values.stage === o.status && ['invited','active'].includes(o.status)) delete values.stage; await api('update-office',{id,...values}); await refresh(); status('Office changes saved.'); }, update);
      window.GigTaxContacts?.office({ office: o, book: record.contacts, api, status, refresh });
      if (data.user.role === 'owner') window.GigTaxDirectory?.office({ office: o, info: m, api, status, refresh: () => showOffice(id) });
      window.GigTaxResearch?.mount({ office: o, api, status, refresh });
      window.GigTaxWorkflows?.mount({ office: o, api, status, refresh, drafts: record.drafts, events: record.events });
      $$('[data-refresh-billing]', panel).forEach(button => button.onclick = run(async () => { await api('refresh-billing', { enrollmentId: button.dataset.refreshBilling }); await refresh(); status('Current billing state checked. No charge, cancellation or refund was requested.'); }));
      const renew = $('#sales-renew-invitation');
      if (renew) renew.onsubmit = run(async () => { const values = Object.fromEntries(new FormData(renew)); const result = await api('renew-invitation', { id, reason: values.reason, reviewed: values.reviewed === 'on' }); await refresh(); showInvitation(result); status('Fresh private invitation ready to copy. No message was sent.'); }, renew);

      const activity = $('#sales-activity'); activity.onsubmit = run(async () => { await api('activity',{id,...Object.fromEntries(new FormData(activity))}); await showOffice(id); status('Activity saved.'); }, activity);
      const invite = $('#sales-invite');
      if (invite.elements.savedOwner) invite.elements.savedOwner.onchange = () => { const person = savedOwners.find(c => c.id === invite.elements.savedOwner.value); if (person) { invite.elements.ownerName.value = person.name; invite.elements.email.value = person.email || ''; } };
      invite.onsubmit = run(async () => { const result = await api('invite',{id,...Object.fromEntries(new FormData(invite))}); showInvitation(result); status('Owner invitation saved. Copy the link to share.'); }, invite);
    }
    const agreementForm = $('#sales-agreement');
    $('#sales-preview-terms').onclick = run(async () => { const result = await api('preview-terms',Object.fromEntries(new FormData(agreementForm))); $('#sales-agreement-preview').hidden = false; $('#sales-agreement-preview').textContent = result.terms.text; },agreementForm);
    agreementForm.onsubmit = run(async () => { const input = Object.fromEntries(new FormData(agreementForm)); input.approved = input.approved === 'on'; const result = await api('publish-terms',input); $('#sales-agreement-preview').hidden = false; $('#sales-agreement-preview').textContent = result.terms.text; await refresh(); tab('team'); status('Approved terms published. Existing invitations retain their original version.'); },agreementForm);
    const login = $('#sales-login-form'); login.onsubmit = run(async () => { await api('login',Object.fromEntries(new FormData(login))); login.reset(); await refresh(); tab('home'); status('Signed in.'); },login);
    $('#sales-logout').onclick = run(async () => { await api('logout'); location.reload(); });
    $$('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
    $('#sales-filter').oninput = renderList; $('#sales-stage-filter').onchange = renderList;
    $('#sales-refresh').onclick = run(async () => { await refresh(); status('Pipeline refreshed.'); });
    $('#sales-export').onclick = () => { const cell = v => `"${String(v ?? '').replace(/^[=+@\-]/,'\t$&').replaceAll('"','""')}"`; download('gig-tax-pros-offices.csv',[['Office','Address','City','State','Contact','Email','Phone','Stage','Followup'],...data.offices.map(o => [o.town,meta(o).address,o.locality,o.state,o.contact_name,o.contact_email,o.contact_phone,o.status,o.meeting_date])].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv'); };
    const discovery = $('#sales-discover');
    async function findOffices(input, offset = 0) {
      const requestId = ++discoveryRequest;
      ['#sales-results-prev', '#sales-results-next'].forEach(selector => { const button = $(selector); if (button) button.disabled = true; });
      const query = `tax preparation offices ${input.city} ${input.state}`;
      $('#sales-search-links').innerHTML = `${link(`https://www.google.com/search?q=${encodeURIComponent(query)}`,'Web search ↗')}${link('https://www.irs.gov/e-file-providers/authorized-irs-e-file-provider-locator-service-for-tax-professionals','IRS directory ↗')}`;
      status('Searching public office sources…');
      let r;
      try { r = await api('search', { ...input, offset }); }
      catch (error) {
        if (requestId !== discoveryRequest) return;
        $('#sales-results-prev').disabled = !discoveryState.query || discoveryState.offset === 0;
        $('#sales-results-next').disabled = !discoveryState.query || !discoveryState.hasMore;
        throw error;
      }
      if (requestId !== discoveryRequest) return;
      discoveryState = { query: input, offset: r.offset ?? offset, limit: r.limit || 50, total: r.total || 0, hasMore: Boolean(r.hasMore) };
      $('#sales-results').innerHTML = r.results.map((item,i) => `<article class="sales-result">${link(item.url,item.title)}<p>${e(item.snippet)}</p><button class="button secondary" data-use-result="${i}">Prepare office record</button></article>`).join('');
      $$('[data-use-result]').forEach(b => b.onclick = () => {
        const result = r.results[Number(b.dataset.useResult)], form = $('#sales-create-office');
        for (const [name, value] of Object.entries({ name: result.name || result.title, source: result.url, city: result.city || input.city, state: input.state, address: result.address || '', postalCode: result.zip || '', phone: result.phone || '', contact: result.contact || '', independence: 'unverified', email: '', website: '' })) if (form.elements[name]) form.elements[name].value = value;
        form.elements.name.focus(); status('Source added. Save the candidate, then check its official website and ownership evidence.');
      });
      const pagination = $('#sales-pagination');
      if (pagination) {
        pagination.hidden = !r.total;
        $('#sales-results-prev').disabled = discoveryState.offset === 0;
        $('#sales-results-next').disabled = !r.hasMore;
        $('#sales-results-range').textContent = `${r.results.length ? discoveryState.offset+1 : 0}–${r.results.length ? discoveryState.offset+r.results.length : 0} of ${r.total || 0}`;
      }
      status(r.message || 'Public office search finished.');
    }
    discovery.onsubmit = run(() => findOffices(Object.fromEntries(new FormData(discovery)), 0), discovery);
    $('#sales-results-prev')?.addEventListener('click', run(() => discoveryState.query && findOffices(discoveryState.query, Math.max(0, discoveryState.offset - discoveryState.limit))));
    $('#sales-results-next')?.addEventListener('click', run(() => discoveryState.query && findOffices(discoveryState.query, discoveryState.offset + discoveryState.limit)));
    const create = $('#sales-create-office'); create.onsubmit = run(async () => { const result = await api('create-office',Object.fromEntries(new FormData(create))); create.reset(); selected = String(result.office.id); await refresh(); tab('pipeline'); status(result.duplicate ? 'Opened the office already in your pipeline.' : 'Office saved to your pipeline.'); },create);
    const agentForm = $('#sales-create-agent'); agentForm.onsubmit = run(async () => { const input = Object.fromEntries(new FormData(agentForm)); input.states = input.states.split(/[\s,]+/).filter(Boolean).map(s=>s.toUpperCase()); const result = await api('create-agent',input); await refresh(); tab('team'); const panel = $('#sales-agent-code'); panel.hidden = false; panel.innerHTML = '<p>Share this access code privately with the agent. It is shown once.</p><code class="sales-secret"></code><button class="button secondary">Copy access code</button>'; $('code',panel).textContent = result.code; $('button',panel).onclick = run(async () => { await navigator.clipboard.writeText(result.code); status('Agent access code copied.'); }); agentForm.reset(); status('Agent created. Save the access code before leaving this page.'); },agentForm);
    contactsUI = window.GigTaxContacts?.mount({ api, status, onSelect: showOffice, onNavigate: tab });
    consoleUI = window.GigTaxConsole?.mount({ api, status, onSelect: showOffice, onNavigate: tab, onSearch: async input => {
      for (const [name, value] of Object.entries(input)) if (discovery.elements[name]) discovery.elements[name].value = value;
      tab('discover');
      return findOffices(Object.fromEntries(new FormData(discovery)), 0);
    } });
    (async () => {
      try { const params = new URLSearchParams(location.hash.slice(1)); if (params.has('owner-code')) { const code = params.get('owner-code'); history.replaceState(null,'',location.pathname); await api('login',{code}); } await refresh(); tab('home'); }
      catch (err) { if (err.status !== 401) status(err.message,true); }
    })();
  }
  if ($('[data-signup-app]')) {
    const params = new URLSearchParams(location.hash.slice(1)), invitation = { id: params.get('id'), token:params.get('token') };
    let view, receipt;
    history.replaceState(null,'',location.pathname);
    function showReceipt(result) { receipt = result; $('#signup-form').hidden = true; $('#signup-pending').hidden = true; $('#signup-receipt').hidden = false; $('#signup-receipt-text').textContent = `${result.office} · Receipt ${result.receipt} · Accepted ${new Date(result.acceptedAt).toLocaleString()}`; status('Your enrollment was recorded. Keep a copy of the receipt and terms.',false,true); }
    $('#signup-check-payment').onclick = run(async () => showReceipt(await api('signup-confirm',invitation)));
    $('#signup-download').onclick = () => download(`gig-tax-pros-enrollment-${receipt.receipt}.txt`,JSON.stringify({ ...receipt, signer:$('#signup-form').elements.signature.value || view.ownerName, businessEmail:view.email, terms:view.terms },null,2));
    const form = $('#signup-form'); form.onsubmit = run(async () => { const input = Object.fromEntries(new FormData(form)); const result = await api('signup-accept',{...invitation,...input,accepted:input.accepted === 'on',authorized:input.authorized === 'on',independent:input.independent === 'on',termsHash:view.terms.hash}); if (result.active) showReceipt(result); else if (result.checkoutUrl) { const u = new URL(result.checkoutUrl); if (u.origin !== 'https://checkout.stripe.com') throw new Error('Unexpected payment address.'); location.assign(u.href); } else throw new Error('Checkout could not be opened. Check this enrollment before retrying.'); },form);
    (async () => { try { if (!invitation.id || !invitation.token) throw new Error('Open the private invitation link from your sales agent.'); view = await api('signup-view',invitation); $('#signup-record').hidden = false; $('#signup-office').textContent = view.office; $('#signup-address').textContent = view.address; $('#signup-contact').textContent = `Invited owner: ${view.ownerName} · ${view.email}`; $('#signup-terms-title').textContent = view.terms.title; $('#signup-terms').textContent = view.terms.text; $('#signup-version').textContent = `Terms version ${view.terms.version} · SHA-256 ${view.terms.hash}`; form.elements.email.value = view.email; form.elements.signature.value = view.ownerName; if (view.status === 'active') showReceipt(await api('signup-confirm',invitation)); else { $('#signup-pending').hidden = view.status !== 'payment_pending'; const button = $('button', form); button.disabled = !view.paymentsConfigured; button.title = view.paymentsConfigured ? '' : 'Payment connection is not ready'; status(view.paymentsConfigured ? 'Review the terms, then continue to secure Stripe checkout. $500 is due today.' : 'The office payment connection is being completed. You can review the agreement, but no payment or activation is available yet.',false,true); if (params.get('payment') === 'return') showReceipt(await api('signup-confirm',invitation)); } } catch(err) { status(err.message,true,true); } })();
  }
})();
