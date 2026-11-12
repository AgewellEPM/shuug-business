(() => {
  'use strict';
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const waiting = { us: 'Our team', office: 'Office reply', delivery: 'Email delivery', signature: 'Owner signature', payment: 'Payment / activation', none: 'Nothing pending', other: 'Other' };
  const date = value => value ? new Date(value).toLocaleString() : 'Not recorded';
  const option = (values, selected) => Object.entries(values).map(([id, label]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${label}</option>`).join('');
  function facts(pipeline) {
    const p = pipeline || {}, contact = p.lastContact, reply = p.lastReply;
    return `<dl class="sdr-progress-facts"><div><dt>Last contact</dt><dd>${contact ? `${e(contact.by)} · ${e(contact.channel)}<small>${e(date(contact.at))}</small>` : 'No contact recorded'}</dd></div><div><dt>Latest reply</dt><dd>${reply ? `${e(reply.outcome.replaceAll('_', ' '))}<small>${e(date(reply.at))} · recorded by ${e(reply.by)}</small>` : 'No reply recorded'}</dd></div><div><dt>Waiting on</dt><dd>${e(waiting[p.waitingOn] || 'Choose next step')}</dd></div><div><dt>Next action</dt><dd>${e(p.nextAction || 'Choose the next step')}${p.nextDue ? `<small>Due ${e(p.nextDue)}</small>` : ''}</dd></div><div><dt>Contract</dt><dd>${p.contract?.signed ? `Signed ${e(date(p.contract.signedAt))}` : p.contract?.delivery ? `${e(p.contract.delivery.status.replaceAll('_', ' '))}${p.contract.delivery.mode === 'test' ? ' · test only' : ''}` : p.contract?.prepared ? 'Prepared; sending not recorded' : 'Not prepared'}</dd></div><div><dt>Conversion</dt><dd>${p.paidActive ? 'Paid membership active' : p.converted ? 'Agreement signed · payment pending' : 'Not converted'}</dd></div></dl>`;
  }
  window.GigTaxProgress = {
    facts,
    office({ office, pipeline, api, status, refresh }) {
      const parent = document.querySelector('#sales-detail'), host = document.createElement('section');
      host.id = 'sales-office-progress'; host.className = 'sdr-card sdr-progress-panel';
      parent.insertBefore(host, parent.querySelector('#sales-office-contacts') || parent.querySelector('#sales-update-office'));
      host.innerHTML = `<h3>Where this office stands</h3>${facts(pipeline)}<details><summary>Record contact, a reply or the next step</summary><form class="sales-form" id="sales-progress-form"><label>What happened?<select name="kind">${option({ contacted: 'I contacted the office', replied: 'The office replied', waiting: 'We are waiting on something', next_step: 'Set the next action', note: 'Add a progress note' })}</select></label><label>Conversation channel<select name="channel">${option({ call: 'Phone', email: 'Email', meeting: 'Meeting', other: 'Other' })}</select></label><label>Reply outcome<select name="outcome">${option({ other: 'Other / not a reply', interested: 'Interested', questions: 'Has questions', not_now: 'Not now', declined: 'Not interested', opt_out: 'Asked us not to contact' })}</select></label><label>What actually happened?<textarea name="note" maxlength="2000" required></textarea></label><label>Who / what are we waiting on?<select name="waitingOn">${option(waiting, pipeline?.waitingOn || 'office')}</select></label><label>Next action<input name="nextAction" value="${e(pipeline?.nextAction || '')}" maxlength="300"></label><label>Follow-up date<input type="date" name="nextDue" value="${e(office.meeting_date || '')}"></label><button class="button primary">Save progress</button><p data-progress-status role="status" aria-live="polite"></p></form></details>`;
      const form = host.querySelector('form');
      form.onsubmit = async event => {
        event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
        try { await api('record-progress', { id: office.id, expectedRevision: pipeline?.revision || '', requestId: crypto.randomUUID(), ...Object.fromEntries(new FormData(form)) }); await refresh(); status('Office progress saved.'); }
        catch (error) { host.querySelector('[data-progress-status]').textContent = error.message; status(error.message, true); }
        finally { if (button.isConnected) button.disabled = false; }
      };
    },
    locations(data, onSelect) {
      const host = document.querySelector('#sales-signup-locations'); if (!host) return;
      const rows = (data.offices || []).filter(office => office.pipeline?.converted || office.pipeline?.paidActive);
      let selected = '';
      const render = () => {
        const list = selected ? rows.filter(office => office.state === selected) : rows;
        const target = host.querySelector('[data-signup-office-list]');
        target.innerHTML = list.map(office => { let info = {}; try { info = JSON.parse(office.notes || '{}'); } catch {} const address = [info.address, office.locality, office.state, info.postalCode].filter(Boolean).join(', '); return `<article class="sdr-card"><h3>${e(office.town)}</h3><p>${e(address)}</p><p>${office.pipeline.paidActive ? 'Paid membership active' : 'Agreement signed · payment pending'}</p><p>Signed ${e(date(office.pipeline.contract?.signedAt))}</p><div class="sales-actions"><button type="button" class="button secondary" data-signup-office="${e(office.id)}">Open office and pipeline</button><a href="https://maps.apple.com/?q=${e(encodeURIComponent(address))}" target="_blank" rel="noopener noreferrer">View address in Maps ↗</a></div></article>`; }).join('') || '<div class="sdr-card"><h3>No signed offices in this view</h3><p>Offices appear here after their owner signs an agreement. Payment status stays separate.</p></div>';
        target.querySelectorAll('[data-signup-office]').forEach(button => button.onclick = () => Promise.resolve(onSelect(button.dataset.signupOffice)).catch(() => {}));
        host.querySelector('[data-signup-location-count]').textContent = `${list.length} signed ${list.length === 1 ? 'office' : 'offices'}${selected ? ' in ' + selected : ''}`;
      };
      if (!host.querySelector('[data-signup-office-list]')) host.innerHTML = '<div class="sdr-card-head"><div><h2>Signup locations</h2><p>Signed office agreements and their actual business addresses.</p></div><span data-signup-location-count></span></div><div id="sales-signup-map" class="sdr-card sdr-map"></div><label>State<select data-signup-state><option value="">All states</option></select></label><p class="sdr-map-caption">State counts show signed offices. Addresses below open their map location; state shading does not imply nationwide service coverage.</p><div data-signup-office-list class="sdr-contact-grid"></div>';
      const source = document.querySelector('svg[data-sales-state-map]'), map = host.querySelector('#sales-signup-map');
      if (source) {
        map.replaceChildren(source.cloneNode(true)); const svg = map.querySelector('svg'); svg.removeAttribute('data-sales-state-map'); svg.setAttribute('data-sales-signup-map', '');
        for (const path of map.querySelectorAll('[data-state]')) {
          const state = path.dataset.state, count = rows.filter(office => office.state === state).length;
          path.classList.add('sdr-map-state'); path.classList.remove('is-selected'); path.dataset.level = String(Math.min(4, Math.ceil(Math.log2(count + 1))));
          path.setAttribute('aria-label', `${state}: ${count} signed offices`); path.setAttribute('aria-disabled', 'false'); path.setAttribute('tabindex', '0');
          const choose = () => { selected = state; host.querySelector('[data-signup-state]').value = selected; render(); };
          path.onclick = choose; path.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); choose(); } };
          if (path.querySelector('title')) path.querySelector('title').textContent = `${state}: ${count} signed offices`;
        }
      }
      const select = host.querySelector('[data-signup-state]');
      select.innerHTML = '<option value="">All states</option>' + (data.states || []).map(state => `<option>${e(state)}</option>`).join('');
      select.onchange = () => { selected = select.value; render(); }; render();
    },
  };
})();
