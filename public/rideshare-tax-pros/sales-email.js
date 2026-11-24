(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const address = value => String(value || '').trim().toLowerCase();
  const person = value => value.name ? value.name + ' <' + value.address + '>' : value.address;
  const linked = contact => ({ officeId: contact.officeId, contactId: contact.id });
  const setupHelp = {
    gmail: 'https://support.google.com/accounts/answer/185833',
    icloud: 'https://support.apple.com/en-us/102654',
    fastmail: 'https://www.fastmail.help/hc/en-us/articles/360058752854',
  };

  window.SdrEmail = {
    mount({ api, onNavigate, onOpenOffice, refresh }) {
      const host = document.querySelector('[data-tab-panel="email"]');
      const settings = document.querySelector('#sales-rep-email-settings');
      if (!host || !settings) return;
      const find = name => host.querySelector('[data-email-' + name + ']');
      const list = find('list'), reader = find('reader'), editor = find('editor');
      const search = host.querySelector('.sdr-email-search');
      const pages = host.querySelector('.sdr-email-pages');
      let user, state, contacts = [], folder = 'inbox', query = '', contactFilter = null;
      let cursors = [''], next = '', messages = [], drafts = [], editing, dirty = false, working = false, loaded = false;
      let listRequest = 0, readRequest = 0, selected = '';

      function announce(value, error = false) {
        find('status').textContent = value;
        find('status').dataset.error = String(error);
      }
      function updateHeader() {
        find('account').textContent = state?.mailbox?.address || 'Your sales mailbox';
        find('setup').hidden = Boolean(state?.mailbox);
        const from = editor.querySelector('[data-email-from]');
        if (from) {
          from.textContent = state.mailbox ? state.mailbox.name + ' <' + state.mailbox.address + '>' : 'Connect your mailbox in Senders to send.';
          editor.querySelector('[data-email-send]').disabled = working || !state.mailbox;
          editor.querySelector('[data-email-open-senders]').hidden = Boolean(state.mailbox);
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
        search.hidden = folder === 'drafts' || !state?.mailbox;
        search.elements.query.value = query;
        const filter = find('contact-filter');
        filter.hidden = !contactFilter || folder === 'drafts';
        filter.querySelector('strong').textContent = contactFilter ? 'Conversation with ' + (contactFilter.name || contactFilter.email) : '';
      }
      function showRows() {
        if (folder === 'drafts') {
          list.innerHTML = drafts.map(draft => `<li><button type="button" data-email-draft="${escape(draft.id)}" ${selected === draft.id ? 'aria-current="true"' : ''}><strong>${escape(draft.subject || '(No subject)')}</strong><span>${escape(draft.to || 'No recipient')}${draft.status === 'uncertain' ? ' · Submission unconfirmed' : ''}</span><time>${escape(date(draft.updatedAt))}</time></button></li>`).join('');
          return;
        }
        list.innerHTML = messages.map(message => {
          const names = (folder === 'sent' ? message.to : message.from).map(part => part.name || part.address).join(', ');
          return `<li><button type="button" data-email-message="${escape(message.id)}" data-unread="${message.unread}" ${selected === message.id ? 'aria-current="true"' : ''}><strong>${message.unread ? '<span class="sdr-email-unread" role="img" aria-label="Unread"></span>' : ''}${escape(names || 'Unknown address')}</strong><span>${escape(message.subject)}</span><time>${escape(date(message.date))}</time></button></li>`;
        }).join('');
      }
      async function load() {
        const request = ++listRequest;
        clearReader();
        configureFolder();
        pages.hidden = true;
        list.replaceChildren();
        list.setAttribute('aria-busy', 'false');
        if (folder !== 'drafts' && !state?.mailbox) {
          announce('Connect your mailbox to open ' + (folder === 'inbox' ? 'Inbox.' : 'Sent.'));
          return;
        }
        list.setAttribute('aria-busy', 'true');
        announce(folder === 'drafts' ? 'Loading drafts…' : 'Checking your mail…');
        try {
          if (folder === 'drafts') {
            const result = await api('rep-email-drafts');
            if (request !== listRequest) return;
            drafts = result.drafts;
            announce(drafts.length ? '' : 'No saved drafts yet.');
          } else {
            const result = await api('rep-email-list', { folder, query, contact: contactFilter?.email, cursor: cursors.at(-1) });
            if (request !== listRequest) return;
            messages = result.messages;
            next = result.next;
            find('older').disabled = !next;
            find('newer').disabled = cursors.length < 2;
            pages.hidden = !next && cursors.length < 2;
            announce(messages.length ? '' : (query || contactFilter) ? 'No matching messages on this page.' : 'This folder is empty.');
          }
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
      function renderSettings(showForm = !state?.mailbox) {
        if (!state) return;
        const mailbox = state.mailbox;
        settings.innerHTML = `<section class="sdr-card sdr-email-settings" aria-labelledby="sdr-email-settings-title">
          <div class="sdr-card-head"><div><h2 id="sdr-email-settings-title">My business mailbox</h2>
          <p>${mailbox ? escape(mailbox.address) + ' · ' + escape(mailbox.providerName) : 'Connect the account you use for one-to-one sales email.'}</p></div>
          ${mailbox ? '<button type="button" class="button primary" data-open-mailbox>Open Email</button>' : ''}</div>
          <p role="status" data-mail-settings-status></p>
          ${showForm ? `<form class="sales-form" data-mail-connect><div class="sdr-email-fields">
            <label>Mailbox provider<select name="provider" required><option value="">Choose your provider</option>${state.providers.map(provider => `<option value="${escape(provider.id)}" ${mailbox?.provider === provider.id ? 'selected' : ''}>${escape(provider.name)}</option>`).join('')}</select></label>
            <label>Business email<input name="address" type="email" required maxlength="240" value="${escape(mailbox?.address || user.email)}" ${user.role === 'owner' ? 'autocomplete="username"' : 'readonly'}></label>
            <label>Sender name<input name="name" required maxlength="140" value="${escape(mailbox?.name || user.name)}" autocomplete="name"></label>
            <label>App password<input name="password" type="password" minlength="8" maxlength="256" autocomplete="off" required></label></div>
            <p class="field-hint">Create an app password in your email provider’s account settings. <a data-app-password-help target="_blank" rel="noopener noreferrer" hidden>Provider instructions ↗</a></p>
            <div class="sales-actions"><button type="submit" class="button primary">Verify and connect</button>${mailbox ? '<button type="button" class="button secondary" data-cancel-mailbox>Cancel</button>' : ''}</div>
          </form>` : '<div class="sales-actions"><button type="button" class="button secondary" data-edit-mailbox>Update connection</button><button type="button" class="button secondary" data-disconnect-mailbox>Disconnect</button></div>'}
        </section>`;
        const get = selector => settings.querySelector(selector);
        const note = (message, error = false) => {
          const target = get('[data-mail-settings-status]');
          target.textContent = message;
          target.dataset.error = String(error);
        };
        const form = get('[data-mail-connect]');
        get('[data-open-mailbox]')?.addEventListener('click', () => onNavigate('email'));
        get('[data-edit-mailbox]')?.addEventListener('click', () => { renderSettings(true); get('select').focus(); });
        get('[data-cancel-mailbox]')?.addEventListener('click', () => { renderSettings(); get('[data-edit-mailbox]').focus(); });
        get('[data-disconnect-mailbox]')?.addEventListener('click', async event => {
          if (!window.confirm('Disconnect this mailbox from TinkyTown?')) return;
          const button = event.currentTarget;
          button.disabled = true;
          try { applySettings(await api('rep-email-disconnect', { revision: state.revision })); note('Mailbox disconnected.'); }
          catch (error) { note(error.message, true); }
          finally { button.disabled = false; }
        });
        if (!form) return;
        function providerHelp() {
          const a = get('[data-app-password-help]');
          a.hidden = !Object.hasOwn(setupHelp, form.elements.provider.value);
          if (a.hidden) a.removeAttribute('href');
          else a.href = setupHelp[form.elements.provider.value];
        }
        form.elements.provider.onchange = providerHelp;
        providerHelp();
        form.onsubmit = async event => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(form));
          form.elements.password.value = '';
          const submit = form.querySelector('[type="submit"]');
          submit.disabled = true;
          note('Verifying incoming and outgoing mail…');
          try {
            applySettings(await api('rep-email-connect', { ...values, revision: state.revision }));
            note('Mailbox connected.');
            get('[data-open-mailbox]').focus();
          } catch (error) { note(error.message, true); }
          finally { submit.disabled = false; }
        };
      }
      function contactOptions(value) {
        const term = value.trim().toLowerCase();
        return contacts.filter(contact => contact.email && !contact.suppressed && !contact.archived &&
          [contact.name, contact.email, contact.officeName].join(' ').toLowerCase().includes(term)).slice(0, 8);
      }
      function openEditor(draft = {}) {
        selected = draft.id || '';
        editing = { id: draft.id || crypto.randomUUID(), revision: draft.revision || 0, link: draft.link, replyToken: draft.replyToken };
        dirty = Boolean(!draft.id && (draft.to || draft.subject || draft.body));
        editor.hidden = false;
        reader.hidden = true;
        const isReply = Boolean(draft.isReply || draft.replyToken);
        const locked = draft.status === 'uncertain';
        editor.innerHTML = `<div class="sdr-card-head"><h3 tabindex="-1">${locked ? 'Submission unconfirmed' : isReply ? 'Reply' : 'Compose email'}</h3>
          <button type="button" class="button secondary" data-email-close-editor>Close</button></div>
          ${locked ? `<p>Check Sent or your provider’s webmail for this message before sending again.</p><p>${escape(draft.to)} · ${escape(draft.subject)}</p><pre class="sdr-email-body">${escape(draft.body)}</pre>` : `
          <form class="sales-form" data-email-compose-form novalidate>
            <p class="sdr-email-from"><strong>From</strong> <span data-email-from></span> <button type="button" class="button secondary" data-email-open-senders>Open Senders</button></p>
            <label>To<input type="email" name="to" maxlength="240" required value="${escape(draft.to)}" ${isReply ? 'readonly' : ''}></label>
            ${isReply ? '' : '<button type="button" class="button secondary sdr-email-choose" data-email-choose aria-expanded="false">Choose from Rolodex</button><div data-email-choices hidden><label>Search Rolodex<input type="search" name="contactQuery" placeholder="Name, organization, or email"></label><div class="sdr-email-choices" data-email-choice-list></div></div>'}
            <label>Subject<input name="subject" maxlength="300" required value="${escape(draft.subject)}"></label>
            <label>Message<textarea name="body" rows="10" maxlength="7500" required>${escape(draft.body)}</textarea></label>
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
        form.querySelector('[data-email-open-senders]').onclick = () => onNavigate('mail');
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
          if (to && !form.elements.to.reportValidity()) throw new Error('Enter one email address.');
          const matches = contacts.filter(contact => address(contact.email) === to && to && !contact.suppressed && !contact.archived);
          const link = editing.link || (matches.length === 1 ? linked(matches[0]) : undefined);
          const payload = { ...editing, link, to, subject: form.elements.subject.value, body: form.elements.body.value };
          if (new Blob([JSON.stringify(payload)]).size > 15600) throw new Error('Shorten the message before saving.');
          const { draft: stored } = await api('rep-email-save', payload);
          editing.revision = stored.revision;
          editing.link = stored.link;
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
          if (working || !state.mailbox || !form.reportValidity()) return;
          lock(true);
          let submitted = false;
          try {
            const stored = await save();
            tell('Submitting to your mail provider…');
            submitted = true;
            const receipt = await api('rep-email-send', { id: stored.id, revision: stored.revision });
            if (receipt.status === 'accepted') {
              clearEditor();
              if (folder !== 'inbox') await firstPage();
              announce(receipt.copySaved === false ? 'Your provider accepted the email. A copy could not be saved to Sent.' : 'Your mail provider accepted the email.');
              find('compose').focus();
              if (stored.link) void refresh().catch(() => {});
            } else if (receipt.status === 'rejected') {
              openEditor({ ...stored, revision: receipt.revision });
              announce('Your provider rejected the email. The draft is still available.', true);
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
          const corresponding = folder === 'sent' ? message.to : message.from;
          const contact = contacts.find(value => !value.archived && corresponding.some(part => address(part.address) === address(value.email)));
          const item = messages.find(row => row.id === id);
          if (item) item.unread = message.unread;
          showRows();
          reader.innerHTML = `<h3 tabindex="-1">${escape(message.subject)}</h3><p class="sdr-email-meta"><strong>From</strong> ${escape(message.from.map(person).join(', '))}<br><strong>To</strong> ${escape(message.to.map(person).join(', '))}<br>${escape(date(message.date))}</p>
          <div class="sales-actions">${reply ? '<button type="button" class="button primary" data-email-reply>Reply</button>' : ''}${contact ? `<button type="button" class="button secondary" data-email-office>${escape(contact.officeName)}</button>` : ''}</div>
          <pre class="sdr-email-body">${escape(message.body || (message.limited ? '' : 'This message has no text preview.'))}</pre>
          ${message.limited ? '<p>Open your provider’s webmail to read the complete message.</p>' : ''}
          ${message.attachments.length ? `<div class="sdr-email-attachments"><strong>Attachments</strong><ul>${message.attachments.map((file, index) =>
            `<li><button type="button" class="button secondary" data-email-attachment="${index}">Download ${escape(file.name)}</button></li>`).join('')}</ul></div>` : ''}`;
          reader.querySelector('h3').focus();
          reader.querySelector('[data-email-reply]')?.addEventListener('click', () => {
            if (!canClose()) return;
            const matches = contacts.filter(value => !value.archived && !value.suppressed && address(value.email) === address(reply.to));
            openEditor({ ...reply, link: matches.length === 1 ? linked(matches[0]) : undefined });
          });
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
      find('settings').onclick = () => onNavigate('mail');
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

      return {
        render(data) {
          if (!data.repEmail) return;
          user = data.user;
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
