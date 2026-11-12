(() => {
  'use strict';
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const roles = [['unverified', 'Role unknown'], ['owner', 'Owner'], ['partner', 'Partner / co-owner'], ['manager', 'Manager'], ['accountant', 'Accountant'], ['staff', 'Staff'], ['other', 'Other']];
  const preferences = [['unspecified', 'Not recorded'], ['email', 'Email'], ['phone', 'Phone'], ['do_not_contact', 'Do not contact']];
  const label = role => roles.find(([value]) => value === role)?.[1] || 'Role unknown';
  const field = (name, title, value = '', attrs = '') => `<label>${title}<input name="${name}" value="${e(value)}" ${attrs}></label>`;
  const select = (name, title, options, value) => `<label>${title}<select name="${name}">${options.map(([id, text]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  const phone = value => { const digits = String(value || '').replace(/[^\d+]/g, ''); return /^\+?\d{7,15}$/.test(digits) ? digits : ''; };
  function source(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
  function actions(contact) {
    if (contact.suppressed) return '<span class="sdr-contact-muted">Contact actions paused</span>';
    const number = phone(contact.phone || contact.mobile);
    return `${contact.email ? `<a class="button secondary" href="mailto:${e(encodeURIComponent(contact.email))}">Email</a>` : ''}${number ? `<a class="button secondary" href="tel:${e(number)}${contact.extension && contact.phone ? `;ext=${e(contact.extension)}` : ''}">Call</a>` : ''}`;
  }
  function card(contact, controls = '') {
    const checked = Boolean(contact.verification);
    return `<article class="sdr-contact-card${contact.archived ? ' sdr-contact-archived' : ''}"><div class="sdr-contact-heading"><div><h4>${e(contact.name || 'Office contact')}</h4><p>${e(label(contact.role))}${contact.title ? ` · ${e(contact.title)}` : ''}</p></div>${contact.primary ? '<span class="sdr-contact-badge">Primary</span>' : ''}</div>
      <p class="sdr-contact-evidence">${contact.archived ? 'Archived' : checked ? 'Name and role source checked' : 'Name and role need checking'}${contact.verification?.at ? ` · ${e(new Date(contact.verification.at).toLocaleDateString())}` : ''}</p>
      <dl class="sdr-contact-facts"><div><dt>Business email</dt><dd>${e(contact.email || 'Missing')}</dd></div><div><dt>Phone</dt><dd>${e(contact.phone || 'Missing')}${contact.extension ? ` ext. ${e(contact.extension)}` : ''}</dd></div>${contact.mobile ? `<div><dt>Mobile</dt><dd>${e(contact.mobile)}</dd></div>` : ''}<div><dt>Preference</dt><dd>${e(preferences.find(([id]) => id === contact.preference)?.[1] || 'Not recorded')}</dd></div></dl>
      ${contact.sourceURL && source(contact.sourceURL) ? `<a href="${e(source(contact.sourceURL))}" target="_blank" rel="noopener noreferrer">Contact source ↗</a>` : ''}${contact.sourceNote ? `<p>${e(contact.sourceNote)}</p>` : ''}${contact.notes ? `<p class="sdr-contact-notes">${e(contact.notes)}</p>` : ''}
      <div class="sales-actions">${actions(contact)}${controls}</div></article>`;
  }

  window.GigTaxContacts = {
    mount({ api, status, onSelect, onNavigate }) {
      const host = document.querySelector('#sales-rolodex');
      if (!host) return null;
      let data, query = '', filter = 'all';
      const render = () => {
        const directory = data?.rolodex || { contacts: [], coverage: {} }, counts = directory.coverage;
        const input = host.querySelector('[data-contact-search]'), focused = document.activeElement === input, position = input?.selectionStart;
        const contacts = directory.contacts.filter(contact => {
          if (filter === 'archived' ? !contact.archived : contact.archived) return false;
          if (filter === 'owners' && !['owner', 'partner'].includes(contact.role)) return false;
          if (filter === 'missing_email' && contact.email) return false;
          if (filter === 'missing_phone' && (contact.phone || contact.mobile)) return false;
          if (filter === 'needs_review' && contact.verification) return false;
          if (filter === 'do_not_contact' && !contact.suppressed) return false;
          return [contact.name, contact.role, contact.title, contact.email, contact.phone, contact.mobile, contact.officeName, contact.city, contact.state, contact.address, contact.postalCode].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
        });
        host.innerHTML = `<div class="sdr-card-head"><div><h2>Owners & Rolodex</h2><p>The people behind each office, with the details your team needs.</p></div><button type="button" class="button primary" data-contact-find>Find offices</button></div>
          <div class="sdr-contact-summary" aria-label="Contact coverage"><span><strong>${counts.contacts || 0}</strong> contacts</span><span><strong>${counts.owners || 0}</strong> owners / partners recorded</span><span><strong>${counts.missingOwner || 0}</strong> offices missing an owner</span><span><strong>${counts.missingEmail || 0}</strong> missing email</span><span><strong>${counts.missingPhone || 0}</strong> missing phone</span></div>
          <div class="sales-toolbar"><label>Search people, offices or locations<input type="search" data-contact-search value="${e(query)}" placeholder="Name, email, phone, office, city or ZIP"></label><label>Show<select data-contact-filter>${[['all', 'Active contacts'], ['owners', 'Owners & partners'], ['missing_email', 'Missing email'], ['missing_phone', 'Missing phone'], ['needs_review', 'Needs source check'], ['do_not_contact', 'Contact actions paused'], ['archived', 'Archived']].map(([id, title]) => `<option value="${id}" ${filter === id ? 'selected' : ''}>${title}</option>`).join('')}</select></label></div>
          <p role="status">${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'} shown</p><div class="sdr-contact-grid">${contacts.map(contact => `<div>${card(contact, `<button type="button" class="button secondary" data-contact-office="${e(contact.officeId)}">Open ${e(contact.officeName)}</button>`)}<p class="sdr-contact-location">${e(contact.officeName)} · ${e(contact.city)}, ${e(contact.state)} ${e(contact.postalCode)}</p></div>`).join('')}</div>
          ${contacts.length ? '' : '<div class="sdr-card"><h3>No contacts in this view</h3><p>Open an office below to add its owner and business contacts, or find an office to start your pipeline.</p></div>'}
          <details class="sdr-card" ${!directory.contacts.length ? 'open' : ''}><summary>Add or update contacts by office</summary><div class="sales-actions">${(data?.offices || []).map(office => `<button type="button" class="button secondary" data-contact-office="${e(office.id)}">${e(office.town)} · ${e(office.locality)}, ${e(office.state)}</button>`).join('') || '<p>No saved offices yet. Find and save an office first.</p>'}</div></details>`;
        host.querySelector('[data-contact-search]').addEventListener('input', event => { query = event.target.value; render(); });
        host.querySelector('[data-contact-filter]').addEventListener('change', event => { filter = event.target.value; render(); });
        host.querySelector('[data-contact-find]').onclick = () => onNavigate('discover');
        host.querySelectorAll('[data-contact-office]').forEach(button => button.onclick = async () => { try { await onSelect(button.dataset.contactOffice); } catch (error) { status(error.message, true); } });
        if (focused) { const next = host.querySelector('[data-contact-search]'); next.focus(); if (typeof position === 'number') next.setSelectionRange(position, position); }
      };
      return { render(value) { data = value; render(); } };
    },

    office({ office, book, api, status, refresh }) {
      if (!book) return;
      const host = document.createElement('section'); host.id = 'sales-office-contacts'; host.className = 'sdr-office-contacts';
      const parent = document.querySelector('#sales-detail'); parent.insertBefore(host, parent.querySelector('#sales-update-office'));
      let editing = null, busy = false;
      const contacts = book.contacts || [];
      const localStatus = message => { const target = host.querySelector('[data-contact-status]'); if (target) target.textContent = message; };
      async function command(action, contactId, extra = {}) {
        if (busy) return;
        busy = true; host.setAttribute('aria-busy', 'true');
        host.querySelectorAll('button').forEach(button => button.disabled = true);
        try {
          await api(action, { id: office.id, contactId, expectedRevision: book.revision, requestId: crypto.randomUUID(), ...extra });
          await refresh(); status('Office contacts saved.');
        } catch (error) { localStatus(error.message); status(error.message, true); }
        finally { busy = false; if (host.isConnected) { host.removeAttribute('aria-busy'); host.querySelectorAll('button').forEach(button => button.disabled = false); } }
      }
      function edit(contact = null, owner = false) {
        editing = contact;
        const formHost = host.querySelector('[data-contact-editor]'), value = contact || { role: owner ? 'owner' : 'unverified', preference: 'unspecified' };
        formHost.hidden = false;
        formHost.innerHTML = `<form class="sales-form" id="sales-contact-form"><h4>${contact ? 'Edit contact' : owner ? 'Add an office owner' : 'Add a contact'}</h4><div class="sdr-contact-form-grid">${field('name', 'Full name', value.name, 'maxlength="140" autocomplete="off"')}${select('role', 'Role', roles, value.role)}${field('title', 'Job title', value.title, 'maxlength="140"')}${field('email', 'Business email', value.email, 'type="email" maxlength="240"')}${field('phone', 'Business phone', value.phone, 'type="tel" maxlength="60"')}${field('extension', 'Extension', value.extension, 'inputmode="numeric" maxlength="12"')}${field('mobile', 'Business mobile', value.mobile, 'type="tel" maxlength="60"')}${select('preference', 'Preferred contact method', preferences, value.preference)}</div>
          ${field('sourceURL', 'Contact / owner source URL', value.sourceURL, 'type="url" maxlength="1200"')}<label>What does the source confirm?<textarea name="sourceNote" maxlength="900">${e(value.sourceNote)}</textarea></label><label>Relationship notes<textarea name="notes" maxlength="1500">${e(value.notes)}</textarea></label><label class="sales-check"><input type="checkbox" name="reviewed">I checked this person’s name, role and entered details against the source above.</label><p class="field-hint">An owner role stays unconfirmed until source checked. This does not confirm independent office ownership or email delivery.</p><div class="sales-actions"><button class="button primary" type="submit">Save contact</button><button class="button secondary" type="button" data-cancel-contact>Cancel</button></div></form>`;
        const form = formHost.querySelector('form');
        form.onsubmit = event => { event.preventDefault(); const value = Object.fromEntries(new FormData(form)); value.reviewed = form.elements.reviewed.checked; return command('save-contact', editing?.id || crypto.randomUUID(), { contact: value }); };
        formHost.querySelector('[data-cancel-contact]').onclick = () => { formHost.hidden = true; formHost.replaceChildren(); editing = null; };
        form.elements.name.focus();
      }
      host.innerHTML = `<h3>Owners & contacts</h3><p>Keep owners, partners and staff as separate people. The primary contact is used by the office’s conversation tools.</p><div class="sales-actions"><button type="button" class="button secondary" data-add-owner>Add owner</button><button type="button" class="button secondary" data-add-contact>Add contact</button></div><p role="status" aria-live="polite" data-contact-status></p><div data-contact-editor hidden></div>
        ${contacts.filter(c => !c.archived).map(contact => card(contact, `<button type="button" class="button secondary" data-edit-contact="${e(contact.id)}">Edit</button>${!contact.primary ? `<button type="button" class="button secondary" data-primary-contact="${e(contact.id)}">Make primary</button>` : ''}<button type="button" class="button secondary" data-archive-contact="${e(contact.id)}">Archive</button>`)).join('') || '<p>No contacts saved. Add the owner or a public business contact.</p>'}
        ${contacts.some(c => c.archived) ? `<details><summary>Archived contacts</summary>${contacts.filter(c => c.archived).map(contact => card(contact, `<button type="button" class="button secondary" data-restore-contact="${e(contact.id)}">Restore</button>`)).join('')}</details>` : ''}`;
      host.querySelector('[data-add-owner]').onclick = () => edit(null, true);
      host.querySelector('[data-add-contact]').onclick = () => edit();
      host.querySelectorAll('[data-edit-contact]').forEach(button => button.onclick = () => edit(contacts.find(c => c.id === button.dataset.editContact)));
      for (const [key, action] of [['primaryContact', 'set-primary-contact'], ['archiveContact', 'archive-contact'], ['restoreContact', 'restore-contact']]) {
        const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
        host.querySelectorAll(`[data-${attr}]`).forEach(button => button.onclick = () => command(action, button.dataset[key]));
      }
    },
  };
})();
