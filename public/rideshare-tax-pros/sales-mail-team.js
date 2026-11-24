(() => {
  'use strict';
  window.SdrMailTeam = {
    mount({ api, escape, onNavigate }) {
      function management(host) {
        if (!host) return;
        const details = document.createElement('details');
        details.className = 'sdr-card sdr-mail-allocation';
        details.innerHTML = '<summary>Agent mailboxes</summary><div data-allocation-content></div>';
        host.append(details);
        const content = details.querySelector('[data-allocation-content]');
        let data,
          selected = '',
          mode = 'existing',
          active = false;
        const opt = (value, label) => `<option value="${escape(value)}">${escape(label)}</option>`;
        function draw(note = '') {
          const members = data.members;
          if (!members.some((member) => member.id === selected)) selected = members[0]?.id || '';
          const member = members.find((m) => m.id === selected),
            box = member?.mailbox;
          const available = data.accounts.filter(
            (a) =>
              a.address !== data.ownerAddress &&
              !data.assigned.some((holder) => holder.address === a.address && holder.memberId !== selected)
          );
          const retired = data.assigned.filter((holder) => !members.some((m) => m.id === holder.memberId));
          const status = (box?.address ? box.address + ' · ' : '') + (box?.label || '');
          content.innerHTML = `<div class="sdr-mail-allocation-head">
          <p>${escape(data.directoryError || (data.domains.length ? 'Company email · ' + data.domains.join(', ') : 'Company email'))}</p>
          <button type="button" class="button secondary" data-add-rep>${members.length ? 'Sales team' : 'Add a sales agent'}</button></div>
          ${
            member
              ? `<label>Sales agent<select data-allocation-member>${members.map((m) => opt(m.id, m.name + ' · ' + m.login)).join('')}</select></label>
          <p class="sdr-allocation-current">${escape(status)}</p>
          ${box?.status === 'pending' ? '<p>Grant the workspace account access to this mailbox, then choose Check access. <a href="https://www.zoho.com/mail/help/adminconsole/mailbox-delegation-admin-settings.html" target="_blank" rel="noopener noreferrer">Zoho delegation instructions</a></p>' : ''}
          <form class="sales-form sdr-allocation-form" data-allocation-form>
            <fieldset><legend>Mailbox action</legend><label><input type="radio" name="mode" value="existing" ${mode === 'existing' ? 'checked' : ''}> Assign existing</label>
            <label><input type="radio" name="mode" value="new" ${mode === 'new' ? 'checked' : ''}> Create new</label></fieldset>
            ${
              mode === 'existing'
                ? `<label>Existing Zoho address<input type="email" name="address" list="sdr-zoho-directory" placeholder="Choose or enter an address" required maxlength="240" value="${escape(box?.status === 'pending' || box?.status === 'check' ? box.address : '')}"></label>
              <datalist id="sdr-zoho-directory">${available.map((a) => opt(a.address, a.name)).join('')}</datalist>
              ${data.next !== null ? '<button type="button" class="button secondary" data-more-mailboxes>Load more addresses</button>' : ''}`
                : `<div class="sdr-mail-address-fields"><label>New email address<input name="local" placeholder="first.last" maxlength="64" required autocapitalize="none" spellcheck="false"></label>
              <label>Company domain<select name="domain" required>${data.domains.map((domain) => opt(domain, '@' + domain)).join('')}</select></label></div>
              <label>Initial Zoho password (optional)<input type="password" name="password" autocomplete="new-password" maxlength="256" placeholder="Generate automatically"></label>
              <p>Creating this mailbox uses an available Zoho license.</p>`
            }
            <div class="sales-actions"><button class="button primary" type="submit" ${data.directoryError || (mode === 'new' && !data.domains.length) ? 'disabled' : ''}>${mode === 'new' ? 'Create mailbox' : 'Assign mailbox'}</button>
              ${box?.address && ['pending', 'check', 'creating'].includes(box.status) ? '<button class="button secondary" type="button" data-check-mail>Check access</button>' : ''}
              ${box?.address ? '<button class="button secondary" type="button" data-release-mail>Release SDR assignment</button>' : ''}</div>
          </form>`
              : '<p>Add a sales agent to assign or create their company mailbox.</p>'
          }
          ${retired.map((row) => `<div class="sdr-mail-allocation-head"><span>${escape(row.address)} · Former rep</span><button class="button secondary" type="button" data-release-former="${escape(row.memberId)}">Release SDR assignment</button></div>`).join('')}
          <p role="status" data-allocation-status>${escape(note)}</p><button type="button" class="button secondary" data-directory-refresh>Refresh directory</button>`;
          content.querySelector('[data-add-rep]').onclick = () => onNavigate('team');
          content.querySelector('[data-directory-refresh]').onclick = () => load();
          const select = content.querySelector('[data-allocation-member]');
          if (select) {
            select.value = selected;
            select.onchange = () => {
              selected = select.value;
              draw();
            };
          }
          const form = content.querySelector('[data-allocation-form]');
          if (form) {
            form.querySelectorAll('[name="mode"]').forEach(
              (input) =>
                (input.onchange = () => {
                  mode = input.value;
                  draw();
                })
            );
            form.onsubmit = (event) => {
              event.preventDefault();
              if (!form.reportValidity()) return;
              const creating = mode === 'new',
                address = creating
                  ? form.elements.local.value.trim() + '@' + form.elements.domain.value
                  : form.elements.address.value.trim();
              if (creating && !window.confirm('Create ' + address + ' in Zoho and assign it to ' + member.name + '?'))
                return;
              const extra = creating ? { password: form.elements.password.value } : {};
              void save(creating ? 'rep-email-provision' : 'rep-email-bind', {
                memberId: selected,
                revision: box.revision,
                address,
                ...extra,
              });
            };
            form
              .querySelector('[data-check-mail]')
              ?.addEventListener('click', () =>
                save('rep-email-bind', { memberId: selected, revision: box.revision, address: box.address })
              );
            form
              .querySelector('[data-release-mail]')
              ?.addEventListener('click', () => release(selected, box.revision, box.address));
            form.querySelector('[data-more-mailboxes]')?.addEventListener('click', () => load(data.next));
          }
          content.querySelectorAll('[data-release-former]').forEach(
            (button) =>
              (button.onclick = () => {
                const row = retired.find((r) => r.memberId === button.dataset.releaseFormer);
                if (row) release(row.memberId, row.revision, row.address);
              })
          );
        }
        function release(memberId, revision, address) {
          if (window.confirm('Remove SDR access to ' + address + '? The mailbox stays in Zoho.'))
            void save('rep-email-release', { memberId, revision });
        }
        async function save(action, fields) {
          if (active) return;
          active = true;
          const note = content.querySelector('[data-allocation-status]');
          const controls = [...content.querySelectorAll('button,input,select')];
          controls.forEach((c) => (c.disabled = true));
          note.textContent =
            action === 'rep-email-provision' ? 'Creating the company mailbox…' : 'Updating the mailbox assignment…';
          let message;
          try {
            const result = await api(action, fields);
            const box = result.mailbox;
            message =
              box.status === 'ready'
                ? box.address + ' is assigned. The agent can open Email.'
                : box.status === 'released'
                  ? 'SDR assignment released.'
                  : box.status === 'pending'
                    ? box.address + ' exists in Zoho. Grant workspace mailbox access in Zoho, then choose Check access.'
                    : 'Zoho accepted the request. Check access when the mailbox appears in the directory.';
          } catch (error) {
            message = error.message;
          } finally {
            active = false;
          }
          await load(null, message);
        }
        async function load(offset = null, note = '') {
          if (active) return;
          active = true;
          const area = content.querySelector('[data-allocation-status]');
          if (area) area.textContent = 'Loading company mailboxes…';
          else content.textContent = 'Loading company mailboxes…';
          try {
            const part = await api('rep-email-allocations', { offset: offset || 0 });
            data = { ...part, accounts: offset && data ? [...data.accounts, ...part.accounts] : part.accounts };
            draw(note);
          } catch (error) {
            content.textContent = error.message;
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'button secondary';
            retry.textContent = 'Retry';
            retry.onclick = () => load();
            content.append(retry);
          } finally {
            active = false;
          }
        }
        details.ontoggle = () => {
          if (details.open && !data) void load();
        };
      }
      function incoming(host, id, owner) {
        host.innerHTML =
          '<button type="button" class="button secondary" data-route-email>Assign to agent</button><div data-route-fields></div>';
        const trigger = host.querySelector('[data-route-email]'),
          fields = host.querySelector('[data-route-fields]');
        trigger.onclick = async () => {
          trigger.disabled = true;
          try {
            const result = await api('rep-email-handoff-options', { messageId: id });
            if (!host.isConnected) return;
            if (!result.members.length) {
              fields.innerHTML =
                '<p>No other active sales agents are available.</p>' +
                (owner ? '<button type="button" class="button secondary">Add a sales agent</button>' : '');
              fields.querySelector('button')?.addEventListener('click', () => onNavigate('team'));
              return;
            }
            fields.innerHTML = `<form class="sdr-mail-route-form"><label>Assign to<select name="rep" required><option value="">Choose an agent</option>${result.members.map((m) => `<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('')}</select></label><button type="submit" class="button primary">Assign email</button><p role="status"></p></form>`;
            const form = fields.querySelector('form'),
              note = form.querySelector('[role="status"]');
            if (result.current) {
              form.elements.rep.value = result.current.assigneeId;
              note.textContent = 'Currently assigned to ' + result.current.name + '.';
            }
            form.onsubmit = async (event) => {
              event.preventDefault();
              const submit = form.querySelector('button');
              if (submit.disabled || !form.reportValidity()) return;
              submit.disabled = true;
              try {
                const out = await api('rep-email-handoff', {
                  messageId: id,
                  memberId: form.elements.rep.value,
                  revision: result.current?.revision || 0,
                });
                result.current = out.assignment;
                note.textContent = 'Assigned to ' + out.assignment.assignee + '.';
              } catch (error) {
                note.textContent = error.message;
              } finally {
                submit.disabled = false;
              }
            };
          } catch (error) {
            fields.textContent = error.message;
          } finally {
            trigger.disabled = false;
          }
        };
      }
      return { management, incoming };
    },
  };
})();
