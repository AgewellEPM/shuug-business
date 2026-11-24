(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const address = value => String(value || '').trim().toLowerCase();
  const person = value => value.name ? value.name + ' <' + value.address + '>' : value.address;
  const linked = contact => ({ officeId: contact.officeId, contactId: contact.id });
  window.SdrEmail = {
    mount({ api, onNavigate, onOpenOffice, refresh }) {
      const host = document.querySelector('[data-tab-panel="email"]');
      const settings = document.querySelector('#sales-rep-email-settings');
      if (!host || !settings) return;
      const find = name => host.querySelector('[data-email-' + name + ']');
      const list = find('list'), reader = find('reader'), editor = find('editor');
      const search = host.querySelector('.sdr-email-search');
      const pages = host.querySelector('.sdr-email-pages');
      let owner = false, state, contacts = [], folder = 'inbox', query = '', contactFilter = null;
      let cursors = [''], next = '', messages = [], drafts = [], editing, dirty = false, working = false, loaded = false;
      let listRequest = 0, readRequest = 0, selected = '';

      function announce(value, error = false) {
        find('status').textContent = value;
        find('status').dataset.error = String(error);
      }
      function updateHeader() {
        const mailbox = state.mailbox;
        find('account').textContent = mailbox.address || 'Business mailbox';
        const from = editor.querySelector('[data-email-from]');
        if (from) {
          from.textContent = mailbox.address ? person(mailbox) : 'Business mailbox';
          editor.querySelector('[data-email-send]').disabled = working || !mailbox.configured;
        }
      }
      function clearReader() {
        readRequest++;
        selected = '';
        reader.innerHTML = '<p class="sdr-email-placeholder">Select a message to read it here.</p>';
      }
      function clearEditor() {
        editing = null;
        dirty = false;
        editor.hidden = true;
        editor.replaceChildren();
        reader.hidden = false;
      }
      function canClose() {
        return !working && (!dirty || window.confirm('Close this email and discard unsaved changes?'));
      }
      function configureFolder() {
        host.querySelectorAll('[data-email-folder]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.emailFolder === folder)));
        search.hidden = folder === 'drafts';
        search.elements.query.value = query;
        const filter = find('contact-filter');
        filter.hidden = !contactFilter || folder === 'drafts';
        filter.querySelector('strong').textContent = contactFilter ? 'Conversation with ' + (contactFilter.name || contactFilter.email) : '';
      }
      function showRows() {
        if (folder === 'drafts') {
          list.innerHTML = drafts.map(draft => `<li><button type="button" data-email-draft="${escape(draft.id)}" ${selected === draft.id ? 'aria-current="true"' : ''}><strong>${escape(draft.subject || '(No subject)')}</strong><span>${escape(draft.to || 'No recipient')}${draft.status === 'uncertain' ? ' · Submission unconfirmed' : ''}</span><time>${escape(date(draft.updatedAt))}</time></button></li>`).join('');
        } else list.replaceChildren();
        list.insertAdjacentHTML('beforeend', messages.map(message => {
          const names = (folder === 'sent' || folder === 'drafts' ? message.to : message.from).map(part => part.name || part.address).join(', ');
          return `<li><button type="button" data-email-message="${escape(message.id)}" data-unread="${message.unread}" ${selected === message.id ? 'aria-current="true"' : ''}><strong>${message.unread ? '<span class="sdr-email-unread" role="img" aria-label="Unread"></span>' : ''}${escape(names || 'Unknown address')}</strong><span>${escape(message.subject)}</span><time>${escape(date(message.date))}</time></button></li>`;
        }).join(''));
      }
      async function load() {
        const request = ++listRequest;
        clearReader();
        configureFolder();
        pages.hidden = true;
        list.replaceChildren();
        list.setAttribute('aria-busy', 'true');
        announce('Checking your mail…');
        messages = [];
        drafts = [];
        try {
          if (folder === 'drafts' && cursors.length === 1) {
            const result = await api('rep-email-drafts');
            if (request !== listRequest) return;
            drafts = result.drafts;
            showRows();
          }
          if (!state.mailbox.configured) {
            announce(folder === 'drafts' ? (drafts.length ? '' : 'No saved drafts yet.') : 'Zoho Mail is awaiting workspace authorization. You can compose and save drafts.');
            return;
          }
          const result = await api('rep-email-list', { folder, query: folder === 'drafts' ? '' : query, contact: folder === 'drafts' ? '' : contactFilter?.email, cursor: cursors.at(-1) });
          if (request !== listRequest) return;
          messages = result.messages;
          next = result.next;
          find('older').disabled = !next;
          find('newer').disabled = cursors.length < 2;
          pages.hidden = !next && cursors.length < 2;
          announce(messages.length || drafts.length ? '' : (query || contactFilter) ? 'No matching messages.' : 'This folder is empty.');
          showRows();
        } catch (error) {
          if (request === listRequest) announce(error.message, true);
        } finally {
          if (request === listRequest) list.setAttribute('aria-busy', 'false');
        }
      }
      function firstPage() {
        cursors = [''];
        return load();
      }
      async function refreshMail() {
        const button = find('refresh');
        button.disabled = true;
        try {
          const current = await api('rep-email-settings');
          if (state?.revision !== current.revision) applySettings(current);
          loaded = true;
          await firstPage();
        } catch (error) { announce(error.message, true); }
        finally { button.disabled = false; }
      }
      function applySettings(nextState) {
        const changed = state?.revision !== nextState.revision;
        state = nextState;
        if (changed) {
          listRequest++;
          clearReader();
          list.replaceChildren();
          loaded = false;
        }
        renderSettings();
        updateHeader();
      }
      function renderSettings() {
        const mailbox = state.mailbox;
        settings.innerHTML = `<section class="sdr-card sdr-email-settings" aria-labelledby="sdr-email-settings-title">
          <div class="sdr-card-head"><div><h2 id="sdr-email-settings-title">My business mailbox</h2>
          <p>${escape(mailbox.address || 'Zoho Mail')} · ${mailbox.configured ? 'Managed by your workspace' : 'Awaiting workspace authorization'}</p></div>
          <button type="button" class="button primary" data-open-mailbox>Open Email</button></div>
          ${owner ? `<details class="sdr-zoho-admin"><summary>Workspace mail authorization</summary>
            <form class="sales-form" data-zoho-admin>
              <ol class="sdr-zoho-steps">
                <li>Open the <a href="https://api-console.zoho.com/" target="_blank" rel="noopener noreferrer">Zoho API Console</a> using the company owner account. Select <strong>Self Client</strong>. On a new account, choose <strong>Get Started → Self Client → Create Now → Create → OK</strong>.</li>
                <li>Open <strong>Generate Code</strong> and paste these scopes. <code>ZohoMail.accounts.READ,ZohoMail.folders.READ,ZohoMail.messages.ALL</code></li>
                <li>Choose <strong>10 minutes</strong>, enter <strong>TinkyTown sales email</strong> as the description, and click <strong>Create</strong>. Choose the company organization if prompted, then click <strong>Download</strong>.</li>
              </ol>
              <label>Owner’s business email<input type="email" name="ownerAddress" value="${escape(mailbox.address)}" ${mailbox.address ? 'readonly' : ''} required></label>
              <label>Zoho grant file<input type="file" accept=".json,application/json" name="grant" required></label>
              <button type="submit" class="button secondary">Authorize workspace mail</button>
              <p role="status" data-zoho-status></p>
            </form></details><p role="status" data-zoho-result></p>` : ''}</section>`;
        settings.querySelector('[data-open-mailbox]').onclick = () => onNavigate('email');
        const form = settings.querySelector('[data-zoho-admin]');
        if (form) form.onsubmit = async event => {
          event.preventDefault();
          const file = form.elements.grant.files[0], note = form.querySelector('[data-zoho-status]'), submit = form.querySelector('button');
          if (!file || !form.reportValidity() || submit.disabled) return;
          if (file.size > 16384) { note.textContent = 'Choose the JSON file downloaded from the Zoho API Console.'; return; }
          submit.disabled = true;
          note.textContent = 'Verifying the owner mailbox with Zoho…';
          try {
            let grant;
            try { grant = JSON.parse(await file.text()); }
            catch { throw new Error('Choose a valid Zoho JSON grant file.'); }
            applySettings(await api('rep-email-authorize', { address: form.elements.ownerAddress.value, grant }));
            settings.querySelector('[data-zoho-result]').textContent = 'Zoho verified the owner inbox. Open Email to read your mail.';
          } catch (error) { note.textContent = error.message; }
          finally { form.reset(); submit.disabled = false; }
        };
      }
      function contactOptions(value) {
        const term = value.trim().toLowerCase();
        return contacts.filter(contact => contact.email && !contact.suppressed && !contact.archived &&
          [contact.name, contact.email, contact.officeName].join(' ').toLowerCase().includes(term)).slice(0, 8);
      }
      function openEditor(draft = {}) {
        selected = draft.id || '';
        editing = { id: draft.id || crypto.randomUUID(), revision: draft.revision || 0, link: draft.link, replyToken: draft.replyToken, files: draft.files || [] };
        dirty = Boolean(!draft.id && (draft.to || draft.subject || draft.body));
        editor.hidden = false;
        reader.hidden = true;
        const isReply = Boolean(draft.isReply || draft.replyToken);
        const locked = draft.status === 'uncertain';
        editor.innerHTML = `<div class="sdr-card-head"><h3 tabindex="-1">${locked ? 'Submission unconfirmed' : isReply ? 'Reply' : 'Compose email'}</h3>
          <button type="button" class="button secondary" data-email-close-editor>Close</button></div>
          ${locked ? `<p>Check Sent for this message before sending again.</p><p>${escape(draft.to)} · ${escape(draft.subject)}</p><pre class="sdr-email-body">${escape(draft.body)}</pre>` : `
          <form class="sales-form" data-email-compose-form novalidate>
            <p class="sdr-email-from"><strong>From</strong> <span data-email-from></span></p>
            <label>To<input type="email" name="to" multiple maxlength="1800" required value="${escape(draft.to)}" ${isReply ? 'readonly' : ''}></label>
            ${isReply ? '' : '<button type="button" class="button secondary sdr-email-choose" data-email-choose aria-expanded="false">Choose from Rolodex</button><div data-email-choices hidden><label>Search Rolodex<input type="search" name="contactQuery" placeholder="Name, organization, or email"></label><div class="sdr-email-choices" data-email-choice-list></div></div>'}
            <details class="sdr-email-copy" ${draft.cc || draft.bcc ? 'open' : ''}><summary>Cc / Bcc</summary>
              <label>Cc<input type="email" name="cc" multiple maxlength="1800" value="${escape(draft.cc)}"></label>
              <label>Bcc<input type="email" name="bcc" multiple maxlength="1800" value="${escape(draft.bcc)}"></label></details>
            <label>Subject<input name="subject" maxlength="300" required value="${escape(draft.subject)}"></label>
            <label>Message<textarea name="body" rows="10" maxlength="100000" required>${escape(draft.body)}</textarea></label>
            <label>Attachments<input type="file" name="attachments" multiple></label><ul class="sdr-email-file-list" data-draft-files></ul>
            ${state.mailbox.configured ? '' : '<p>Sending will be available when the workspace has Zoho Mail authorization.</p>'}
            <div class="sales-actions"><button type="submit" class="button primary" data-email-send>Send email</button><button type="button" class="button secondary" data-email-save>Save draft</button>
            ${draft.revision ? '<button type="button" class="button secondary" data-email-discard>Discard draft</button>' : ''}</div>
            <p role="status" aria-live="polite" data-email-editor-status></p>
          </form>`}`;
        editor.querySelector('h3').focus();
        editor.querySelector('[data-email-close-editor]').onclick = () => {
          if (!canClose()) return;
          clearEditor();
          if (folder === 'drafts') void load();
          find('compose').focus();
        };
        const form = editor.querySelector('form');
        if (!form) return;
        updateHeader();
        form.addEventListener('keydown', event => {
          if (event.key === 'Enter' && event.target.matches('input')) event.preventDefault();
        });
        const tell = (message, error = false) => {
          const node = form.querySelector('[data-email-editor-status]');
          node.textContent = message;
          node.dataset.error = String(error);
        };
        let target = address(draft.to);
        form.oninput = event => {
          if (event.target.name === 'contactQuery') return;
          if (event.target.name === 'to' && address(form.elements.to.value) !== target) editing.link = undefined;
          dirty = true;
        };
        function renderFiles() {
          const list = form.querySelector('[data-draft-files]');
          list.innerHTML = editing.files.map((file, index) => `<li>${escape(file.name)} <button type="button" class="button secondary" data-remove-file="${index}" aria-label="Remove ${escape(file.name)}">Remove</button></li>`).join('');
          list.querySelectorAll('button').forEach(button => button.onclick = () => {
            editing.files = editing.files.filter((_, index) => index !== Number(button.dataset.removeFile));
            dirty = true;
            renderFiles();
          });
        }
        renderFiles();
        form.elements.attachments.onchange = async event => {
          const files = [...event.target.files];
          event.target.value = '';
          if (!files.length) return;
          if (files.length + editing.files.length > 8 || [...editing.files, ...files].reduce((sum, file) => sum + file.size, 0) > 4 * 1024 * 1024) {
            tell('Choose up to eight files totaling 4 MB.', true);
            return;
          }
          lock(true);
          try {
            const added = await Promise.all(files.map(file => new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ name: file.name, size: file.size, base64: reader.result.split(',')[1] || '' });
              reader.onerror = () => reject(new Error('The file could not be read.'));
              reader.readAsDataURL(file);
            })));
            editing.files = [...editing.files, ...added];
            dirty = true;
            renderFiles();
          } catch (error) { tell(error.message, true); }
          finally { lock(false); }
        };
        const choose = form.querySelector('[data-email-choose]');
        if (choose) {
          const panel = form.querySelector('[data-email-choices]'), input = form.elements.contactQuery;
          function suggestions() {
            const results = contactOptions(input.value);
            const picker = form.querySelector('[data-email-choice-list]');
            picker.innerHTML = results.map((contact, index) => `<button type="button" class="button secondary" data-choice="${index}"><strong>${escape(contact.name || contact.email)}</strong><small>${escape(contact.officeName)} · ${escape(contact.email)}</small></button>`).join('') || '<p>No eligible contacts match.</p>';
            picker.querySelectorAll('[data-choice]').forEach(button => button.onclick = () => {
              const contact = results[Number(button.dataset.choice)];
              editing.link = linked(contact);
              form.elements.to.value = target = address(contact.email);
              dirty = true;
              panel.hidden = true;
              choose.setAttribute('aria-expanded', 'false');
              form.elements.subject.focus();
            });
          }
          choose.onclick = () => {
            panel.hidden = !panel.hidden;
            choose.setAttribute('aria-expanded', String(!panel.hidden));
            if (!panel.hidden) { suggestions(); input.focus(); }
          };
          input.oninput = suggestions;
          input.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
        }
        async function save() {
          const to = address(form.elements.to.value);
          if (![form.elements.to, form.elements.cc, form.elements.bcc].every(field => !field.value || field.reportValidity())) throw new Error('Check the recipient addresses.');
          const matches = contacts.filter(contact => address(contact.email) === to && to && !contact.suppressed && !contact.archived);
          const link = editing.link || (matches.length === 1 ? linked(matches[0]) : undefined);
          const payload = { ...editing, link, to, cc: form.elements.cc.value, bcc: form.elements.bcc.value, subject: form.elements.subject.value, body: form.elements.body.value };
          const { draft: stored } = await api('rep-email-save', payload);
          editing.revision = stored.revision;
          editing.link = stored.link;
          editing.files = stored.files || [];
          editing.replyToken = undefined;
          dirty = false;
          return stored;
        }
        function lock(value) {
          working = value;
          form.querySelectorAll('input, textarea, button').forEach(control => control.disabled = value);
          if (!value) updateHeader();
        }
        form.querySelector('[data-email-save]').onclick = async () => {
          if (working) return;
          lock(true);
          try {
            const stored = await save();
            if (folder === 'drafts') drafts = [stored, ...drafts.filter(draft => draft.id !== stored.id)];
            openEditor(stored);
            if (folder === 'drafts') showRows();
            announce('Draft saved.');
          }
          catch (error) { tell(error.message, true); }
          finally { lock(false); }
        };
        form.querySelector('[data-email-discard]')?.addEventListener('click', async () => {
          if (working || !window.confirm('Discard this saved draft?')) return;
          lock(true);
          try {
            await api('rep-email-discard', { id: editing.id, revision: editing.revision });
            clearEditor();
            if (folder === 'drafts') await load();
            announce('Draft discarded.');
            find('compose').focus();
          } catch (error) { tell(error.message, true); }
          finally { lock(false); }
        });
        form.onsubmit = async event => {
          event.preventDefault();
          if (working || !state.mailbox.configured || !form.reportValidity()) return;
          lock(true);
          let submitted = false;
          try {
            const stored = await save();
            tell('Sending through Zoho Mail…');
            submitted = true;
            const receipt = await api('rep-email-send', { id: stored.id, revision: stored.revision });
            if (receipt.status === 'accepted') {
              clearEditor();
              if (folder !== 'inbox') await firstPage();
              announce('Zoho Mail accepted your email.');
              find('compose').focus();
              if (stored.link) void refresh().catch(() => {});
            } else if (receipt.status === 'rejected') {
              openEditor({ ...stored, revision: receipt.revision });
              announce('Zoho Mail declined the email. The draft is still available.', true);
            } else {
              openEditor({ ...stored, status: 'uncertain' });
              announce('The provider did not confirm submission. Check Sent before sending again.', true);
            }
          } catch (error) {
            tell(error.status || !submitted ? error.message : 'Submission status is unavailable. Review this email in Drafts or Sent.', true);
          } finally { lock(false); }
        };
      }
      async function openMessage(id) {
        const request = ++readRequest;
        selected = id;
        showRows();
        reader.textContent = 'Opening message…';
        try {
          const { message, reply } = await api('rep-email-read', { id, folder });
          if (request !== readRequest || selected !== id) return;
          const corresponding = folder === 'sent' || folder === 'drafts' ? message.to : message.from;
          const contact = contacts.find(value => !value.archived && corresponding.some(part => address(part.address) === address(value.email)));
          const item = messages.find(row => row.id === id);
          if (item) item.unread = message.unread;
          showRows();
          reader.innerHTML = `<h3 tabindex="-1">${escape(message.subject)}</h3><p class="sdr-email-meta"><strong>From</strong> ${escape(message.from.map(person).join(', '))}<br><strong>To</strong> ${escape(message.to.map(person).join(', '))}${message.cc?.length ? '<br><strong>Cc</strong> ' + escape(message.cc.map(person).join(', ')) : ''}<br>${escape(date(message.date))}</p>
          <div class="sales-actions">${reply ? '<button type="button" class="button primary" data-email-reply>Reply</button>' : ''}<button type="button" class="button secondary" data-email-forward>${folder === 'drafts' ? 'Copy to composer' : 'Forward'}</button><button type="button" class="button secondary" data-email-unread>Mark unread</button>
            <button type="button" class="button secondary" data-email-move>${folder === 'trash' ? 'Move to Inbox' : 'Move to Trash'}</button>${contact ? `<button type="button" class="button secondary" data-email-office>${escape(contact.officeName)}</button>` : ''}</div>
          <pre class="sdr-email-body">${escape(message.body || (message.limited ? '' : 'This message has no text preview.'))}</pre>
          ${message.attachments.length ? `<div class="sdr-email-attachments"><strong>Attachments</strong><ul>${message.attachments.map((file, index) =>
            `<li><button type="button" class="button secondary" data-email-attachment="${index}">Download ${escape(file.name)}</button></li>`).join('')}</ul></div>` : ''}`;
          reader.querySelector('h3').focus();
          reader.querySelector('[data-email-reply]')?.addEventListener('click', () => {
            if (!canClose()) return;
            const matches = contacts.filter(value => !value.archived && !value.suppressed && address(value.email) === address(reply.to));
            openEditor({ ...reply, link: matches.length === 1 ? linked(matches[0]) : undefined });
          });
          reader.querySelector('[data-email-forward]').onclick = async event => {
            if (!canClose()) return;
            const button = event.currentTarget, copy = folder === 'drafts', files = [];
            button.disabled = true;
            try {
              if (message.attachments.length > 8 || message.attachments.reduce((sum, file) => sum + file.size, 0) > 4 * 1024 * 1024) {
                if (!window.confirm('These attachments exceed the compose limit. Continue with the message text only?')) return;
              } else {
                for (const [index, file] of message.attachments.entries()) {
                  const data = await api('rep-email-download', { folder, id, index });
                  if (request !== readRequest || editing) return;
                  files.push({ ...data, size: file.size });
                }
              }
              openEditor({ to: copy ? message.to.map(p => p.address).join(', ') : '', cc: copy ? message.cc?.map(p => p.address).join(', ') : '',
                subject: copy || /^fw[d]?:/i.test(message.subject) ? message.subject : 'Fwd: ' + message.subject, files,
                body: copy ? message.body : 'Forwarded message\nFrom: ' + message.from.map(person).join(', ') + '\nDate: ' + date(message.date) + '\n\n' + message.body });
            } catch (error) { announce(error.message, true); }
            finally { button.disabled = false; }
          };
          for (const [selector, operation] of [['[data-email-unread]', 'unread'], ['[data-email-move]', folder === 'trash' ? 'restore' : 'trash']]) {
            reader.querySelector(selector).onclick = async event => {
              const button = event.currentTarget;
              button.disabled = true;
              try { await api('rep-email-change', { id, folder, operation }); if (selected === id) await firstPage(); }
              catch (error) { announce(error.message, true); button.disabled = false; }
            };
          }
          reader.querySelector('[data-email-office]')?.addEventListener('click', () => onOpenOffice(contact.officeId).catch(error => announce(error.message, true)));
          reader.querySelectorAll('[data-email-attachment]').forEach(button => button.onclick = async () => {
            button.disabled = true;
            try {
              const file = await api('rep-email-download', { folder, id, index: Number(button.dataset.emailAttachment) });
              if (request !== readRequest) return;
              const download = document.createElement('a');
              const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
              download.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
              download.download = file.name;
              download.click();
              setTimeout(() => URL.revokeObjectURL(download.href), 1000);
            } catch (error) {
              if (request === readRequest) announce(error.message, true);
            } finally { button.disabled = false; }
          });
        } catch (error) {
          if (request === readRequest) reader.textContent = error.message;
        }
      }

      find('compose').onclick = () => {
        if (editing) { editor.querySelector('h3')?.focus(); return; }
        openEditor();
      };
      find('refresh').onclick = refreshMail;
      find('older').onclick = () => { if (next) { cursors.push(next); void load(); } };
      find('newer').onclick = () => { if (cursors.length > 1) { cursors.pop(); void load(); } };
      find('contact-filter').querySelector('button').onclick = () => { contactFilter = null; void firstPage(); };
      host.querySelectorAll('[data-email-folder]').forEach(button => button.onclick = () => {
        if (folder === button.dataset.emailFolder) return;
        folder = button.dataset.emailFolder;
        void firstPage();
      });
      search.onsubmit = event => {
        event.preventDefault();
        contactFilter = null;
        query = search.elements.query.value.trim();
        void firstPage();
      };
      list.onclick = event => {
        const button = event.target.closest('button');
        if (!button || !canClose()) return;
        clearEditor();
        if (button.dataset.emailDraft) openEditor(drafts.find(draft => draft.id === button.dataset.emailDraft));
        if (button.dataset.emailMessage) void openMessage(button.dataset.emailMessage);
      };

      function checkInbox() {
        if (!host.hidden && document.visibilityState === 'visible' && loaded && folder === 'inbox' && !selected && !editing &&
            !working && state?.mailbox.configured && cursors.length === 1 && list.getAttribute('aria-busy') !== 'true') void load();
      }
      window.setInterval(checkInbox, 60_000);
      document.addEventListener('visibilitychange', checkInbox);

      return {
        render(data) {
          if (!data.repEmail) return;
          owner = data.user.role === 'owner';
          contacts = data.rolodex?.contacts || [];
          if (state?.revision !== data.repEmail.revision || !state) applySettings(data.repEmail);
        },
        enter() {
          if (!state || loaded) return;
          loaded = true;
          void firstPage();
        },
        compose({ contact, to, subject, body } = {}, beforeOpen) {
          if (!state || !canClose()) return;
          beforeOpen?.();
          onNavigate('email');
          openEditor({ to: contact?.email || to, subject, body, link: contact ? linked(contact) : undefined });
        },
        history(contact, beforeOpen) {
          if (!state || !canClose()) return;
          beforeOpen?.();
          clearEditor();
          folder = 'inbox';
          query = '';
          contactFilter = contact;
          loaded = true;
          onNavigate('email');
          void firstPage();
          search.elements.query.focus();
        },
      };
    },
  };
})();
