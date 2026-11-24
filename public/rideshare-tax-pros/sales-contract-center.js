(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const icons = {
    file: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h8"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 6-6"/>',
    renew: '<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
    shield: '<path d="M12 2c3 2 6 3 9 3v6c0 5-3 8-9 11-6-3-9-6-9-11V5c3 0 6-1 9-3Z"/><path d="m8 11 3 3 5-5"/>',
    pen: '<path d="m4 16 13-13 4 4L8 20l-5 1 1-5Zm10-10 4 4M11 21h10"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
    pilot: '<path d="M9 15c-2-1-3 0-5 1l1-6 4-1c2-4 5-6 11-6 0 6-2 9-6 11l-1 5-5 1c1-2 2-4 1-5ZM5 19l-2 2"/><circle cx="15" cy="8" r="1"/>',
    bed: '<path d="M3 5v15m18 0v-7H3m5 0V8h8a5 5 0 0 1 5 5M5 9h1"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    flow: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 7v5m-7 4v-4h14v4"/>',
    chart: '<path d="M4 20V14m5 6V10m5 10V6m5 14V3" stroke-width="3"/>',
    arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 5 2 2 4-4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const routes = [['overview','file','Contracts Overview'], ['templates','layers','Templates'], ['active','check','Active Contracts'],
    ['renewals','renew','Renewals'], ['compliance','shield','Compliance'], ['approvals','pen','Approvals'], ['archive','archive','Archive']];
  const templateIcons = { pilot: 'pilot', service: 'bed', extension: 'plus', renewal: 'renew' };
  const templateNames = { pilot: 'Pilot', service: 'Service', extension: 'Add-on', renewal: 'Renewal' };
  const draftLabels = { draft: 'Draft', review: 'Awaiting approval', approved: 'Approved', prepared: 'Invited', archived: 'Archived' };
  const checklist = [
    'Confirm the facility’s legal name, independent ownership and authorized signer.',
    'Document scope, participating sites, dates, pricing and any renewal conditions.',
    'Review accessibility, communication needs, training and acceptance criteria.',
    'Review data handling, privacy responsibilities and any facility-required agreements.',
    'Retain the reviewed version, delivery history and the signed agreement receipt.',
  ];
  const workflow = ['Select a template', 'Set scope, dates and pricing', 'Request review and approval', 'Prepare and share a private signature link', 'Track signatures and retain the receipt'];
  const date = value => {
    if (!value) return '—';
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const instant = new Date(dayOnly ? value + 'T12:00:00Z' : value);
    return Number.isFinite(+instant) ? instant.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric', ...(dayOnly ? { timeZone:'UTC' } : {}) }) : '—';
  };
  const today = () => new Date().toISOString().slice(0,10);
  function contractStatus(row) {
    if (row.status === 'expired') return ['expired','Link expired'];
    if (row.status === 'signed_payment_pending') return ['pending','Payment pending'];
    if (!row.signed) return ['pending','Awaiting signature'];
    const now = today();
    if (row.endDate && row.endDate < now) return ['expired','Term ended'];
    if (row.startDate && row.startDate > now) return ['signed','Scheduled'];
    return row.active || row.startDate ? ['active','Active'] : ['signed','Signed'];
  }
  const button = (label, action, style = '', glyph = '') => `<button type="button" class="ct-button ${style}" data-ct-action="${action}">${glyph ? icon(glyph) : ''}${label}</button>`;
  const heading = (label, glyph, sub = '') => `<div class="ct-section-heading">${icon(glyph)}<div><h2>${label}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>`;
  const checks = items => '<ul class="ct-checks">' + items.map(item => '<li>' + escape(item) + '</li>').join('') + '</ul>';

  window.SdrContractCenter = { mount({ host, api, onSelect, onNavigate, onCompose, refresh }) {
    if (!host || !document.body.hasAttribute('data-agreement-only')) return;
    const care = document.body.hasAttribute('data-care-crm');
    const facility = care ? 'facility' : 'business';
    const programTitle = care ? 'Contract Program for Nursing Homes' : 'Contract Program';
    host.classList.add('sdr-contract-center');
    host.innerHTML = `
      <div class="ct-top"><form class="ct-search" role="search">${icon('search')}<label class="ct-sr-only" for="contract-center-search">Search contracts</label>
        <input id="contract-center-search" type="search" maxlength="160" placeholder="Search contracts, templates, or ${care ? 'facilities' : 'businesses'}…">
        <button class="ct-button" type="submit">Search</button></form><div class="ct-actions">
        ${document.querySelector('[data-display-open]') ? button('Display settings','display') : ''}${button('Sign out','logout')}</div></div>
      <header class="ct-hero"><div class="ct-hero-copy"><p class="ct-mark"><span aria-hidden="true">🚂</span> TinkyTown</p><h1>Contracts</h1>
        <p>Create, manage, and track ${care ? 'nursing home' : 'business'} agreements from pilot to long-term partnership.</p></div></header>
      <nav class="ct-tabs" aria-label="Contracts workspace">${routes.map(([id,glyph,label]) =>
        `<button type="button" data-ct-view="${id}" aria-pressed="${id === 'overview'}">${icon(glyph)}<span>${label}</span></button>`).join('')}</nav>
      <p class="ct-message" role="status" data-ct-message></p><div class="ct-content" data-ct-content></div>
      <dialog class="ct-dialog" aria-labelledby="ct-dialog-title">
        <header><h2 id="ct-dialog-title"></h2><button class="ct-button" type="button" data-ct-action="close" aria-label="Close">×</button></header>
        <div data-ct-dialog-body></div><p role="status" data-ct-dialog-note></p>
      </dialog>`;
    const content = host.querySelector('[data-ct-content]'), message = host.querySelector('[data-ct-message]');
    const dialog = host.querySelector('.ct-dialog'), dialogBody = host.querySelector('[data-ct-dialog-body]');
    const dialogNote = host.querySelector('[data-ct-dialog-note]'), search = host.querySelector('#contract-center-search');
    let data, workspace, view = 'overview', query = '', pending, working = false, returnFocus, preparedEmail;
    function alert(value, error = false) {
      const element = dialog.open ? dialogNote : message;
      element.textContent = value;
      element.dataset.error = String(error);
    }
    function showDialog(title, markup) {
      if (!dialog.open) returnFocus = document.activeElement;
      dialog.querySelector('h2').textContent = title;
      dialogBody.innerHTML = markup;
      dialogNote.textContent = '';
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.open = true;
      }
      syncControls();
    }
    function closeDialog() {
      if (typeof dialog.close === 'function') dialog.close();
      else { dialog.open = false; returnFocus?.focus(); }
    }
    dialog.addEventListener('close', () => returnFocus?.focus());
    const offices = () => data?.offices || [];
    const contracts = () => data?.contracts || [];
    const owner = () => data?.user.role === 'owner';
    const canManage = draft => owner() || draft.authorId === data?.user.id;
    const currentDrafts = () => (workspace?.drafts || []).filter(row => row.status !== 'prepared' && row.status !== 'archived');
    function load() {
      if (pending) return pending;
      pending = api('contract-center-read').then(value => { workspace = value; renderBody(); })
        .catch(error => { alert(error.message, true); renderBody(); })
        .finally(() => { pending = null; });
      return pending;
    }
    function setView(next) {
      view = next;
      query = '';
      search.value = '';
      message.textContent = '';
      renderBody();
    }
    function syncControls() {
      host.setAttribute('aria-busy', String(working));
      host.querySelectorAll('[data-ct-action], [data-ct-editor] button, [data-ct-review] button').forEach(button => { button.disabled = working; });
    }
    function showContent(markup) {
      content.innerHTML = markup;
      syncControls();
    }
    function matching(items, keys) {
      return items.filter(item => query.split(/\s+/).every(word => keys.map(key => item[key]).join(' ').toLowerCase().includes(word)));
    }
    function templateSection() {
      const cards = matching(workspace?.templates || [], ['title','description']);
      return `<section class="ct-card ct-template-card">
        <div class="ct-card-head">${heading('Contract Templates','layers','Start with a template and enter the terms for this agreement.')}
          ${view === 'templates' ? '' : button('Browse All Templates','templates','','arrow')}</div>
        <div class="ct-template-grid">${cards.map(template => `<article class="ct-template">
          ${icon(templateIcons[template.id])}<h3>${escape(template.title)}</h3><p>${escape(template.description)}</p>
          ${button('Use Template','template:'+template.id,'ct-primary')}</article>`).join('') ||
          (workspace ? '<p>No matching templates.</p>' : '<p>Loading templates…</p>')}</div>
      </section>`;
    }
    function tableSection(title, rows, { limited = false, archive = false, renew = false } = {}) {
      const visible = limited ? rows.slice(0,5) : rows;
      const body = visible.map(row => {
        const [tone,label] = contractStatus(row);
        return `<tr><td><strong>${escape(row.office)}</strong><small>${escape([row.city,row.state].filter(Boolean).join(', '))}</small></td>
          <td><span class="ct-type" data-kind="${escape(row.agreementType)}">${escape(templateNames[row.agreementType] || 'Agreement')}</span></td>
          <td><span class="ct-state" data-tone="${tone}">${label}</span></td><td>${date(row.startDate || row.signedAt)}</td><td>${date(row.endDate)}</td><td>${escape(row.value || '—')}</td>
          <td>${button('Open','office:'+row.officeId)}
            ${renew ? button('Start renewal','renew:'+row.id) : ''}
            ${owner() && (archive || row.signed || row.status === 'expired') ? button(archive ? 'Restore' : 'Archive', (archive ? 'restore-file:' : 'archive-file:')+row.id) : ''}</td></tr>`;
      }).join('');
      return `<section class="ct-card ct-records"><div class="ct-card-head">
        ${heading(title + ' (' + rows.length + ')','file')}${limited ? button('View Contracts','active','','arrow') : ''}</div>
        ${visible.length ? `<div class="ct-table-wrap"><table><thead><tr><th>${care ? 'Facility' : 'Business'} / organization</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Value</th><th>Actions</th></tr></thead><tbody>${body}</tbody></table></div>` :
          `<p class="ct-empty">${query ? 'No matching contracts.' : 'There are no contracts in this view yet.'}</p>`}
      </section>`;
    }
    function draftsSection(title, rows) {
      return `<section class="ct-card">${heading(title,'pen')}<div class="ct-draft-list">${rows.map(row => {
        const actions = canManage(row);
        return `<article><div><h3>${escape(row.title)}</h3><p>${escape(row.office)} · ${draftLabels[row.status]}</p></div><div class="ct-actions">
          ${row.status === 'draft' && actions ? button('Edit draft','edit:'+row.id) : ''}
          ${['review','approved'].includes(row.status) ? button(row.status === 'review' && owner() ? 'Review agreement' : 'View terms','review:'+row.id) : ''}
          ${row.status === 'approved' && actions ? button('Prepare signature link','prepare:'+row.id,'ct-primary') : ''}
          ${row.status === 'approved' && actions ? button(care ? 'Open facility' : 'Open business','office:'+row.officeId) : ''}
          ${row.status === 'archived' && actions ? button('Restore draft','restore:'+row.id) : ''}
          ${row.status !== 'archived' && actions ? button('Archive draft','archive:'+row.id) : ''}</div></article>`;
      }).join('') || '<p class="ct-empty">No drafts in this view.</p>'}</div></section>`;
    }
    function compliance() {
      return `<section class="ct-card ct-compliance">${heading('Compliance & Documentation','shield')}
        ${checks(checklist)}${button('Download Contract Checklist','checklist','','download')}</section>`;
    }
    function renderBody() {
      host.querySelectorAll('[data-ct-view]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.ctView === view)));
      if (!data) return;
      const all = contracts().slice().reverse();
      const current = matching(all.filter(row => !row.archived),['office','city','state','termsTitle','agreementType','email']);
      const active = current.filter(row => contractStatus(row)[0] !== 'expired');
      const drafts = matching(currentDrafts(),['office','city','state','title','type']);
      if (query) {
        const rows = view === 'archive' ? matching(all.filter(row => row.archived),['office','city','state','termsTitle','agreementType','email']) : current;
        showContent(tableSection('Matching Contracts',rows,{archive:view === 'archive'}) + templateSection() + draftsSection('Matching Drafts',drafts));
        return;
      }
      if (view === 'templates') { showContent(templateSection()); return; }
      if (view === 'approvals') { showContent(draftsSection('Contract Drafts & Approvals',drafts)); return; }
      if (view === 'compliance') { showContent(compliance()); return; }
      if (view === 'archive') {
        showContent(tableSection('Archived Contracts',all.filter(row => row.archived),{archive:true}) +
          draftsSection('Archived Drafts',(workspace?.drafts || []).filter(row => row.status === 'archived')));
        return;
      }
      if (view === 'renewals') {
        const upcoming = new Date(Date.now() + 60 * 86400000).toISOString().slice(0,10);
        const scheduled = new Set([
          ...current.filter(row => row.agreementType === 'renewal' && row.status !== 'expired'),
          ...drafts.filter(row => row.type === 'renewal'),
        ].map(row => row.priorId));
        const due = current.filter(row => row.signed && row.endDate && row.endDate <= upcoming && !scheduled.has(row.id));
        showContent(tableSection('Renewals Due Within 60 Days',due,{renew:true}) +
          draftsSection('Renewals in Preparation',drafts.filter(row => row.type === 'renewal')) +
          tableSection('Renewal Agreements',current.filter(row => row.agreementType === 'renewal')));
        return;
      }
      if (view === 'active') {
        showContent(tableSection('Current Contracts',active) +
          tableSection('Ended Terms & Expired Invitations',current.filter(row => contractStatus(row)[0] === 'expired')));
        return;
      }
      showContent(`
        <div class="ct-overview-top">
          <section class="ct-card ct-program">${heading(programTitle,'file')}
            <p>Prepare reviewed agreements for pilots, deployments, and renewals with clear terms and a private signature link.</p>
            ${checks(['Pilot and ongoing service agreements','Defined scope and pricing','Reviewed terms and electronic signatures','Renewals and expansion options'])}</section>
          <section class="ct-card">${heading('Contract Benefits','chart')}
            ${checks(['Clear pricing and dates','Defined scope and deliverables','Documented support and training','One version for review and signing','A saved record of signatures'])}</section>
        </div>
        <div class="ct-template-row">${templateSection()}<section class="ct-card">${heading('Contract Workflow','flow')}
          <ol class="ct-workflow">${workflow.map(item => '<li>' + escape(item) + '</li>').join('')}</ol></section></div>
        <div class="ct-records-row">${tableSection('Current Contracts',active,{limited:true})}${compliance()}</div>
        <section class="ct-card ct-start">${heading('Start a New Contract','file','Choose a template, customize the terms, and prepare it for review.')}
          <div class="ct-actions">${button('New Contract','template:service','ct-primary','plus')}${button('Use a Template','templates','','layers')}${button('Book a Meeting','calendar','','calendar')}</div></section>`);
    }
    function editor(draft = {}, type = 'service', existing) {
      const template = workspace?.templates.find(row => row.id === type);
      if (!template) { alert('The template directory is still loading.'); return; }
      const officeId = draft.officeId || existing?.officeId || '';
      const office = offices().find(row => String(row.id) === officeId);
      const locked = Boolean(draft.id || existing);
      if (!offices().length) {
        showDialog('Choose a saved ' + facility,`<p>Save a ${facility} in Prospects or the Pipeline before starting a contract.</p>
          <div class="ct-actions">${button('Go to Pipeline','pipeline','ct-primary')}${button('Open Prospects','prospects')}</div>`);
        return;
      }
      const values = { title: template.title, business:workspace.defaults?.business || '', agreementText:workspace.defaults?.body || '',
        ownerName: existing?.ownerName || office?.contact_name || '', ownerEmail: existing?.email || office?.contact_email || '', ...draft };
      showDialog(draft.id ? 'Edit contract draft' : template.title, `<p>${escape(template.guidance)}</p>
        <form class="ct-form" data-ct-editor>
          <label>${care ? 'Facility' : 'Business'}<select name="officeId" required ${locked ? 'disabled' : ''}><option value="">Choose a saved ${facility}</option>
            ${offices().map(row => `<option value="${escape(row.id)}" ${String(row.id) === officeId ? 'selected' : ''}>${escape(row.town)}</option>`).join('')}</select></label>
          ${['extension','renewal'].includes(type) ? '<label>Prior signed agreement<select name="priorId" required></select></label>' : ''}
          <div class="ct-form-pair"><label>Agreement title<input name="title" required maxlength="180" value="${escape(values.title)}"></label>
          <label>Contracting business<input name="business" maxlength="180" value="${escape(values.business)}"></label></div>
          <div class="ct-form-pair"><label>Authorized signer<input name="ownerName" maxlength="140" value="${escape(values.ownerName)}"></label>
          <label>Signer’s business email<input name="ownerEmail" type="email" maxlength="240" value="${escape(values.ownerEmail)}"></label></div>
          <div class="ct-form-pair"><label>Start date<input name="startDate" type="date" value="${escape(values.startDate)}"></label>
          <label>End date<input name="endDate" type="date" value="${escape(values.endDate)}"></label></div>
          <label>Contract value<input name="value" maxlength="120" placeholder="Amount, currency and billing frequency" value="${escape(values.value)}"></label>
          <label>Agreement terms<textarea name="agreementText" maxlength="9500" rows="8">${escape(values.agreementText)}</textarea></label>
          <div class="ct-actions"><button class="ct-button" type="submit" value="save">Save Draft</button><button class="ct-button ct-primary" type="submit" value="submit">Submit for Approval</button></div>
        </form>`);
      const form = dialogBody.querySelector('form'), field = form.elements;
      function updatePrior(selected = '') {
        if (!field.priorId) return;
        const signed = contracts().filter(row => row.officeId === field.officeId.value && row.signed && row.status !== 'signed_payment_pending');
        field.priorId.replaceChildren(new Option('Choose a signed agreement',''), ...signed.map(row => new Option(row.termsTitle + ' · ' + date(row.signedAt),row.id)));
        field.priorId.value = selected;
      }
      updatePrior(draft.priorId || existing?.id || '');
      field.officeId.onchange = () => {
        const row = offices().find(office => String(office.id) === field.officeId.value);
        field.ownerName.value = row?.contact_name || '';
        field.ownerEmail.value = row?.contact_email || '';
        updatePrior();
      };
      const requestId = crypto.randomUUID();
      form.onsubmit = event => {
        event.preventDefault();
        const operation = event.submitter?.value;
        void perform(async () => {
          if (!form.reportValidity()) return;
          const fields = { ...Object.fromEntries(new FormData(form)), requestId, type, officeId:field.officeId.value, id:draft.id, revision:draft.revision };
          const saved = await api('contract-draft-save',fields);
          draft = saved.draft;
          if (operation === 'submit') await api('contract-draft-action',{ id:draft.id, revision:draft.revision, operation:'submit' });
          closeDialog();
          setView('approvals');
          await load();
          alert(operation === 'submit' ? 'Draft submitted for owner approval.' : 'Contract draft saved.');
        });
      };
    }
    async function perform(work) {
      if (working) return;
      working = true;
      syncControls();
      try { await work(); } catch (error) { alert(error.message, true); }
      finally { working = false; syncControls(); }
    }
    async function updateDraft(draft, operation, extra = {}) {
      const { draft: next } = await api('contract-draft-action',{ id:draft.id, revision:draft.revision, operation, ...extra });
      if (dialog.open) closeDialog();
      if (operation === 'prepare') {
        await refresh();
        await load();
        const link = await api('contract-link',{id:draft.officeId,enrollmentId:next.enrollmentId});
        preparedEmail = { to:draft.ownerEmail, subject:draft.title, body:`Hi ${draft.ownerName},\n\nPlease review and sign your agreement using this private link.\n\n${link.link}` };
        showDialog('Private signature link',`<p>Review the recipient and share the link with the authorized signer.</p><label>Signature link<input readonly value="${escape(link.link)}" data-ct-link></label>
          <div class="ct-actions">${button('Copy Link','copy','ct-primary')}${data.repEmail ? button('Compose Email','compose') : ''}${button(care ? 'Open Facility Record' : 'Open Business Record','office:'+draft.officeId)}</div>`);
        return;
      }
      await load();
      alert({approve:'Agreement approved and ready to prepare.',reopen:'Draft reopened for editing.',archive:'Draft archived.',restore:'Draft restored.'}[operation] || '');
    }
    function showReview(draft, terms) {
      showDialog('Review ' + draft.title, `<p>${escape(draft.office)} · ${escape(draft.ownerName)} &lt;${escape(draft.ownerEmail)}&gt;</p>
        <pre class="ct-terms">${escape(terms.text)}</pre>
        ${draft.status === 'review' && owner() ? `<form class="ct-form" data-ct-review><label class="ct-approve"><input name="reviewed" type="checkbox" required>I reviewed the exact terms shown above and approve them for this agreement.</label>
          <div class="ct-actions"><button type="submit" class="ct-button ct-primary">Approve Agreement</button>${button('Return to Draft','reopen:'+draft.id)}</div></form>` :
          canManage(draft) ? `<div class="ct-actions">${button('Return to Draft','reopen:'+draft.id)}</div>` : ''}`);
      const form = dialogBody.querySelector('[data-ct-review]');
      if (form) form.onsubmit = event => {
        event.preventDefault();
        if (form.reportValidity()) void perform(() => updateDraft(draft,'approve',{ termsHash:terms.hash, reviewed:form.elements.reviewed.checked }));
      };
    }
    function downloadChecklist() {
      const file = new Blob(['TinkyTown contract checklist\n\n', checklist.map(item => '[ ] ' + item).join('\n\n'),'\n'], { type:'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(file), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'tinkytown-contract-checklist.txt'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    }
    async function action(operation, id) {
      if (routes.some(([route]) => route === operation) && !id) { setView(operation); return; }
      if (['calendar','pipeline','prospects'].includes(operation)) { if (dialog.open) closeDialog(); onNavigate(operation); return; }
      if (operation === 'close') { closeDialog(); return; }
      if (operation === 'display') { document.querySelector('[data-display-open]')?.click(); return; }
      if (operation === 'logout') { document.getElementById('sales-logout')?.click(); return; }
      if (operation === 'checklist') { downloadChecklist(); return; }
      if (operation === 'copy') { await navigator.clipboard.writeText(dialogBody.querySelector('[data-ct-link]').value); alert('Private signature link copied.'); return; }
      if (operation === 'compose' && preparedEmail) { closeDialog(); onCompose(preparedEmail); return; }
      if (operation === 'office') { if (dialog.open) closeDialog(); await onSelect(id); return; }
      if (operation === 'template' || operation === 'renew') {
        await load();
        editor({},operation === 'renew' ? 'renewal' : id,operation === 'renew' ? contracts().find(row => row.id === id) : undefined);
        return;
      }
      if (operation === 'archive-file' || operation === 'restore-file') {
        const row = contracts().find(item => item.id === id);
        if (!row) return;
        if (operation === 'archive-file' && !window.confirm('File this agreement in the Archive?')) return;
        await api('contract-file-archive',{ id, officeId:row.officeId, archived:operation === 'archive-file' });
        await refresh();
        alert(operation === 'archive-file' ? 'Agreement archived.' : 'Agreement restored.');
        return;
      }
      const draft = workspace?.drafts.find(row => row.id === id);
      if (!draft) return;
      if (operation === 'edit') { editor(draft,draft.type); return; }
      if (operation === 'review') {
        const { terms } = await api('contract-draft-action',{ id, operation:'preview' });
        showReview(draft,terms);
        return;
      }
      if (operation === 'archive' && !window.confirm('Archive this draft?')) return;
      await updateDraft(draft,operation);
    }
    host.addEventListener('click', event => {
      const control = event.target.closest('button[data-ct-action],button[data-ct-view]');
      if (!control) return;
      if (control.dataset.ctView) { setView(control.dataset.ctView); return; }
      const [operation,id] = control.dataset.ctAction.split(':');
      void perform(() => action(operation,id));
    });
    host.querySelector('.ct-search').onsubmit = event => {
      event.preventDefault();
      query = search.value.trim().toLowerCase();
      renderBody();
    };
    search.addEventListener('search', () => { if (!search.value) { query = ''; renderBody(); } });
    return { render(value) { data = value; renderBody(); }, enter() { void load(); } };
  } };
})();
