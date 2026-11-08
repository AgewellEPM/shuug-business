(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const metadata = office => { try { return JSON.parse(office.notes || '{}'); } catch { return {}; } };
  const closed = new Set(['active', 'not_interested', 'do_not_contact']);
  const contactBlocked = office => ['not_interested', 'do_not_contact'].includes(office.status);
  const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function followupDate(value) {
    const raw = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
    const [year, month, date] = raw.split('-').map(Number), candidate = new Date(year, month - 1, date);
    return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === date ? raw : '';
  }
  function phone(value) {
    const raw = String(value || '').trim(), extension = raw.match(/(?:ext\.?|extension|x)\s*(\d{1,6})$/i);
    const base = extension ? raw.slice(0, extension.index) : raw;
    const digits = base.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return '';
    return `${base.trim().startsWith('+') ? '+' : ''}${digits}${extension ? `;ext=${extension[1]}` : ''}`;
  }
  function email(value) {
    const raw = String(value || '').trim();
    return /^[^\s@,;<>()[\]\\:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(raw) && !/[\r\n]/.test(raw) ? raw : '';
  }
  const field = (name, label, value, extra = '') => `<label>${label}<input name="${name}" value="${escape(value)}" ${extra}></label>`;
  async function copy(value, source, announce) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      announce('Draft copied. Nothing was marked as sent. Record the actual outcome after your conversation.');
    } catch {
      source.focus(); source.select?.();
      announce('Clipboard access is unavailable. Select and copy the draft manually. Nothing was marked as sent.', true);
    }
  }

  window.GigTaxWorkflows = {
    queue({ offices = [], container = document.querySelector('#sales-followups'), onSelect = () => {} } = {}) {
      if (!container) return;
      const today = day(new Date());
      const candidates = offices.filter(office => !closed.has(office.status)).map(office => {
        const date = followupDate(office.meeting_date);
        return { office, date, group: !date ? 3 : date < today ? 0 : date === today ? 1 : 2 };
      }).sort((a, b) => a.group - b.group || a.date.localeCompare(b.date) || String(a.office.town || '').localeCompare(String(b.office.town || '')));
      const counts = ['Overdue', 'Due today', 'Upcoming', 'Unscheduled'].map((label, group) => ({ label, count: candidates.filter(item => item.group === group).length }));
      container.innerHTML = '<h2>Follow-up queue</h2><p>Prioritized by your saved dates. This queue does not send messages or schedule reminders.</p>' +
        `<div class="sales-followup-counts">${counts.map(item => `<span><strong>${item.count}</strong> ${item.label}</span>`).join('')}</div>` +
        '<label class="sales-queue-filter">Show<select><option value="due">Due and overdue</option><option value="upcoming">Upcoming</option><option value="unscheduled">No follow-up date</option><option value="all">All open offices</option></select></label><div class="sales-followup-list"></div><p class="sales-queue-status" role="status" aria-live="polite"></p>';
      const select = container.querySelector('select'), list = container.querySelector('.sales-followup-list');
      function render() {
        const filtered = candidates.filter(item => select.value === 'all' || (select.value === 'due' && item.group < 2) || (select.value === 'upcoming' && item.group === 2) || (select.value === 'unscheduled' && item.group === 3));
        list.innerHTML = filtered.length ? filtered.map(item => `<button type="button" class="sales-followup-item" data-followup-office="${escape(item.office.id)}"><span><strong>${escape(item.office.town || 'Office')}</strong><small>${escape([item.office.locality, item.office.state].filter(Boolean).join(', '))}</small></span><span class="sales-followup-state" data-state="${item.group}">${item.group === 0 ? 'Overdue · ' : item.group === 1 ? 'Today · ' : ''}${escape(item.date || 'Set a follow-up date')}</span></button>`).join('') : `<p class="sales-queue-empty">${select.value === 'due' ? 'No open offices have a follow-up due today. Use “No follow-up date” to plan your next conversations.' : 'No offices match this follow-up view.'}</p>`;
        list.querySelectorAll('[data-followup-office]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; try { await onSelect(button.dataset.followupOffice); } catch (error) { container.querySelector('.sales-queue-status').textContent = error.message || 'The office could not be opened. Refresh and try again.'; } finally { if (button.isConnected) button.disabled = false; } }));
      }
      select.addEventListener('change', render); render();
      return counts;
    },

    mount({ office, api, status = () => {}, refresh = async () => {}, drafts = {}, events = [] }) {
      const parent = document.querySelector('#sales-detail'); if (!parent) return;
      let host = parent.querySelector('#sales-contact-tools');
      if (!host) { host = document.createElement('section'); host.id = 'sales-contact-tools'; parent.append(host); }
      host.className = 'sales-contact-tools';
      const info = metadata(office), ownership = info.independenceVerification || info.ownershipVerification || {}, address = email(office.contact_email), number = phone(office.contact_phone), blocked = contactBlocked(office);
      const savedDrafts = events.map(row => ({ row, details: metadata(row) })).filter(item => item.details.action === 'outreach_draft' && item.details.detail && typeof item.details.detail === 'object').sort((a, b) => (Date.parse(b.details.at || b.row.created_at) || 0) - (Date.parse(a.details.at || a.row.created_at) || 0) || Number(b.row.id) - Number(a.row.id));
      const latestDraft = savedDrafts.map(item => item.details.detail).find(item => email(item.to).toLowerCase() === address.toLowerCase()) || null;
      const subject = latestDraft?.subject || `A conversation with ${office.town || 'your office'} about Gig Tax Pros`.slice(0, 180);
      const body = latestDraft?.message || drafts.message || `Hi ${office.contact_name || 'there'},\n\nI’m reaching out to ${office.town || 'your office'} about Gig Tax Pros’ independent office network. Would you be open to a short conversation about whether it fits your office?\n\nPlease let us know if you prefer not to be contacted.`;
      host.innerHTML = '<h3>Contact and follow-up tools</h3>' +
        `<p>${blocked ? 'This office is marked not interested or do not contact. Contact actions are disabled. Keep any outcome or correction in the office history.' : 'Open your own phone or email app to contact the office. Copying or opening a draft never records a message as sent.'}</p>` +
        `<div class="sales-contact-shortcuts">${number && !blocked ? `<a class="button secondary" href="tel:${escape(number)}" data-contact-call>Call ${escape(office.contact_phone)}</a>` : '<span class="sales-contact-unavailable">Phone action unavailable</span>'}${address ? `<span class="sales-contact-address">${escape(address)}</span>` : '<span class="sales-contact-unavailable">Add a verified business email to open an email draft.</span>'}</div>` +
        `<p class="sales-contact-provenance">Contact role: ${escape(info.contactRole || 'Unverified')}. ${info.contactVerified ? 'Contact role was marked verified.' : 'Confirm the named person’s role before treating them as a decision maker.'} ${info.emailVerified ? 'Business email was checked at its source; delivery is unverified.' : 'Business email still needs verification.'}</p>` +
        `<p class="field-hint">Direct sending from this workspace is not connected. Save a reviewed draft or send through your own email app.</p><form class="sales-form sales-compose-form">${field('subject', 'Email subject', subject, 'maxlength="180"')}<label>Email draft<textarea name="body" maxlength="4000">${escape(body)}</textarea></label><label class="sales-check"><input name="draftReviewed" type="checkbox">I reviewed this draft and the saved business recipient.</label><div class="sales-compose-actions"><button type="button" class="button secondary" data-save-draft ${blocked || !address ? 'disabled' : ''}>Save reviewed draft</button>${latestDraft ? '<button type="button" class="button secondary" data-restore-draft>Restore last saved draft</button>' : ''}<button type="button" class="button secondary" data-copy-draft ${blocked ? 'disabled' : ''}>Copy draft</button>${address && !blocked ? '<a class="button primary" data-open-email>Open in email app</a>' : ''}</div><p class="field-hint">Review the recipient, message and source before sending in your email app. Save what actually happened using “Record a follow-up.”</p></form>` +
        `<form class="sales-form sales-quick-followup"><h4>Plan the next follow-up</h4>${field('nextFollowup', 'Follow-up date', followupDate(office.meeting_date), 'type="date"')}<div class="sales-followup-presets"><button type="button" class="button secondary" data-followup-days="1">Tomorrow</button><button type="button" class="button secondary" data-followup-days="3">In 3 days</button><button type="button" class="button secondary" data-followup-days="7">In 1 week</button><button type="button" class="button secondary" data-clear-followup>Clear date</button></div><button type="submit" class="button primary">Save follow-up date</button></form>` +
        `<form class="sales-form sales-contact-verification"><h4>Record contact checks</h4><label>Person’s published role<select name="contactRole">${[['unverified','Role unverified'],['owner','Owner'],['manager','Manager'],['staff','Staff'],['other','Other published role']].map(([value,label]) => `<option value="${value}" ${info.contactRole === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field('verificationSource', 'Public source for these checks', info.verificationSource || '', 'type="url" maxlength="1200" placeholder="https://…"')}<label>What did you confirm?<textarea name="verificationNote" maxlength="900">${escape(info.verificationNote || '')}</textarea></label><label class="sales-check"><input name="contactVerified" type="checkbox" ${info.contactVerified ? 'checked' : ''}>I checked this person’s role at the cited source.</label><label class="sales-check"><input name="emailVerified" type="checkbox" ${info.emailVerified ? 'checked' : ''}>Email checked at this public source. Delivery has not been verified.</label><button type="submit" class="button primary">Save contact checks</button></form>` +
        `<form class="sales-form sales-ownership-verification" id="sales-verify-ownership"><h4>Verify office ownership</h4><p>Saved finding: <strong>${escape(info.independence || 'unverified')}</strong>${ownership.checkedAt ? ` · reviewed ${escape(new Date(ownership.checkedAt).toLocaleString())}` : ' · no reviewed ownership evidence recorded'}. Record a public source and your reason before confirming an independent office or chain/franchise.</p><label>Ownership finding<select name="finding">${[['unverified','Needs verification'],['independent','Confirmed independent'],['chain','Chain / franchise']].map(([value,label]) => `<option value="${value}" ${info.independence === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${field('sourceURL', 'Ownership source URL', ownership.sourceURL || '', 'type="url" maxlength="1200" placeholder="https://…"')}<label>Reason for this finding<textarea name="note" maxlength="900">${escape(ownership.note || '')}</textarea></label><label class="sales-check"><input name="reviewed" type="checkbox" required>I reviewed this office and the cited ownership evidence.</label><button type="submit" class="button primary" ${blocked ? 'disabled' : ''}>Save ownership finding</button></form><p class="sales-workflow-status" role="status" aria-live="polite"></p>`;
      const compose = host.querySelector('.sales-compose-form'), schedule = host.querySelector('.sales-quick-followup'), localStatus = host.querySelector('.sales-workflow-status');
      const announce = (message, error = false) => { localStatus.textContent = message; localStatus.dataset.error = String(error); status(message, error); };
      const updateEmail = () => {
        const link = host.querySelector('[data-open-email]'); if (!link) return;
        const title = compose.elements.subject.value.replace(/[\r\n]+/g, ' ').slice(0, 180);
        const text = compose.elements.body.value.slice(0, 4000);
        link.href = `mailto:${encodeURIComponent(address).replace(/%40/gi, '@')}?${new URLSearchParams({ subject: title, body: text })}`;
      };
      compose.addEventListener('submit', event => event.preventDefault());
      compose.addEventListener('input', event => { if (event.target !== compose.elements.draftReviewed) compose.elements.draftReviewed.checked = false; updateEmail(); }); updateEmail();
      host.querySelector('[data-restore-draft]')?.addEventListener('click', () => { compose.elements.subject.value = latestDraft.subject || ''; compose.elements.body.value = latestDraft.message || ''; compose.elements.draftReviewed.checked = false; updateEmail(); announce('Last saved draft restored for review. Nothing was marked as sent.'); });
      host.querySelector('[data-save-draft]').addEventListener('click', async () => {
        if (blocked || !address) return;
        if (!compose.elements.draftReviewed.checked) { announce('Review the saved recipient and draft, then confirm before saving.', true); compose.elements.draftReviewed.focus(); return; }
        const subject = compose.elements.subject.value.replace(/[\r\n]+/g, ' ').trim(), message = compose.elements.body.value.trim();
        if (subject.length > 180 || message.length > 4000) { announce('Keep the draft within 180 subject characters and 4,000 message characters.', true); return; }
        if (!subject || !message) { announce('Add an email subject and message before saving a draft.', true); return; }
        const button = host.querySelector('[data-save-draft]'); button.disabled = true;
        try { await api('save-outreach-draft', { id: office.id, to: office.contact_email, subject, message, reviewed: true }); await refresh(); announce('Reviewed draft saved to this office’s history. Nothing was marked as sent.'); }
        catch (error) { announce(error.message || 'The draft save was not confirmed.', true); }
        finally { if (button.isConnected) button.disabled = false; }
      });
      host.querySelector('[data-copy-draft]').addEventListener('click', () => {
        if (blocked) return;
        copy(`Subject: ${compose.elements.subject.value}\n\n${compose.elements.body.value}`, compose.elements.body, announce);
      });
      host.querySelector('[data-open-email]')?.addEventListener('click', () => { updateEmail(); announce('Review and send in your email app. Nothing was marked as sent.'); });
      host.querySelector('[data-contact-call]')?.addEventListener('click', () => announce('Complete the call in your phone app, then record the actual outcome below.'));
      schedule.querySelectorAll('[data-followup-days]').forEach(button => button.addEventListener('click', () => { const next = new Date(); next.setDate(next.getDate() + Number(button.dataset.followupDays)); schedule.elements.nextFollowup.value = day(next); }));
      schedule.querySelector('[data-clear-followup]').addEventListener('click', () => { schedule.elements.nextFollowup.value = ''; });
      const checks = host.querySelector('.sales-contact-verification'), ownershipForm = host.querySelector('.sales-ownership-verification');
      const publicSource = value => {
        try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.') ? url.href : ''; } catch { return ''; }
      };
      const invalidateChecks = event => {
        if (event.target.name === 'contactRole') checks.elements.contactVerified.checked = false;
        if (['verificationSource', 'verificationNote'].includes(event.target.name)) { checks.elements.contactVerified.checked = false; checks.elements.emailVerified.checked = false; }
      };
      checks.addEventListener('input', invalidateChecks); checks.addEventListener('change', invalidateChecks);
      checks.addEventListener('submit', async event => {
        event.preventDefault();
        const values = { contactRole: checks.elements.contactRole.value, contactVerified: checks.elements.contactVerified.checked, emailVerified: checks.elements.emailVerified.checked, verificationSource: checks.elements.verificationSource.value.trim(), verificationNote: checks.elements.verificationNote.value.trim() };
        if (values.contactVerified && values.contactRole === 'unverified') { announce('Choose the role you confirmed, or leave the role-check box clear.', true); checks.elements.contactRole.focus(); return; }
        if ((values.contactVerified || values.emailVerified) && !publicSource(values.verificationSource)) { announce('Provide the public HTTP or HTTPS source used for the selected contact checks.', true); checks.elements.verificationSource.focus(); return; }
        const button = checks.querySelector('button[type="submit"]'); button.disabled = true;
        try { await api('update-office', { id: office.id, ...values }); await refresh(); announce('Contact checks saved. An email source check does not establish deliverability.'); }
        catch (error) { announce(error.message || 'The contact checks were not confirmed.', true); }
        finally { if (button.isConnected) button.disabled = false; }
      });
      ownershipForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (blocked) { announce('Ownership changes are paused while this office is marked not interested or do not contact.', true); return; }
        const values = { finding: ownershipForm.elements.finding.value, sourceURL: ownershipForm.elements.sourceURL.value.trim(), note: ownershipForm.elements.note.value.trim(), reviewed: ownershipForm.elements.reviewed.checked };
        if (!values.reviewed) { announce('Review the ownership evidence and confirm it before saving.', true); ownershipForm.elements.reviewed.focus(); return; }
        if (values.finding !== 'unverified' && (!publicSource(values.sourceURL) || !values.note)) { announce('Provide a public HTTP or HTTPS source and a reason for the ownership finding.', true); ownershipForm.elements.sourceURL.focus(); return; }
        const button = ownershipForm.querySelector('button[type="submit"]'); button.disabled = true;
        try { await api('verify-office', { id: office.id, ...values }); await refresh(); announce('Reviewed ownership finding saved.'); }
        catch (error) { announce(error.message || 'The ownership finding was not confirmed.', true); }
        finally { if (button.isConnected) button.disabled = false; }
      });
      schedule.addEventListener('submit', async event => {
        event.preventDefault();
        const supplied = schedule.elements.nextFollowup.value;
        if (supplied && !followupDate(supplied)) { announce('Choose a valid follow-up date.', true); return; }
        const button = schedule.querySelector('button[type="submit"]'); button.disabled = true;
        try { await api('update-office', { id: office.id, nextFollowup: supplied }); await refresh(); announce(supplied ? 'Follow-up date saved. It appears in your queue when due.' : 'Follow-up date cleared.'); }
        catch (error) { announce(error.message || 'The follow-up change was not confirmed.', true); }
        finally { if (button.isConnected) button.disabled = false; }
      });
    },
  };
})();
