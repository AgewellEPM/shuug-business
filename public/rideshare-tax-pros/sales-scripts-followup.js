(() => {
  'use strict';

  const suppressed = account => ['do_not_contact', 'not_interested'].includes(account.pipeline?.stage || account.status);

  function mount({ api, offices, changed }) {
    const workspace = document.querySelector('#sales-workspace');
    if (!workspace) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'sdr-display';
    dialog.setAttribute('aria-labelledby', 'script-followup-title');
    dialog.innerHTML = `<form>
      <h2 id="script-followup-title">Create follow-up</h2>
      <label>Account <select name="account" required></select></label>
      <label>Follow-up date <input type="date" name="nextDue" required></label>
      <p data-current-followup hidden></p>
      <label>Note <textarea name="note" rows="6" maxlength="2000" required></textarea></label>
      <p role="status" data-followup-status></p>
      <div class="sdr-display-actions">
        <button class="button secondary" type="button" data-followup-cancel>Cancel</button>
        <button class="button primary" type="submit">Save follow-up</button>
      </div>
    </form>`;
    workspace.append(dialog);
    const form = dialog.querySelector('form'), { account, nextDue, note } = form.elements;
    const save = form.querySelector('[type=submit]'), cancel = form.querySelector('[data-followup-cancel]');
    const status = form.querySelector('[data-followup-status]'), current = form.querySelector('[data-current-followup]');
    let active, selected, requestId, opener, saving = false;

    function showAccount() {
      selected = active?.accounts.find(row => String(row.id) === account.value);
      const due = selected?.pipeline?.nextDue || selected?.meeting_date;
      current.hidden = !due;
      current.textContent = due ? 'Current follow-up date: ' + due + '. Saving sets a new date for this account.' : '';
    }
    account.addEventListener('change', showAccount);
    cancel.onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      active = selected = requestId = undefined;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = undefined;
    });
    form.addEventListener('input', () => { if (!saving) requestId = undefined; });
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving || !selected) return;
      const fields = { id: String(selected.id), expectedRevision: selected.pipeline?.revision || '',
        requestId: requestId ||= crypto.randomUUID(), kind: 'next_step', waitingOn: 'us',
        nextAction: ('Follow up · ' + active.title).slice(0, 300), nextDue: nextDue.value, note: note.value };
      saving = save.disabled = cancel.disabled = account.disabled = nextDue.disabled = note.disabled = true;
      status.textContent = 'Saving follow-up…';
      try {
        await api('record-progress', fields);
        const message = 'Follow-up saved for ' + selected.town + ' on ' + nextDue.value + '.';
        dialog.close();
        await changed(message);
      } catch (error) {
        status.textContent = error.message || 'The workspace could not confirm the follow-up.';
      } finally {
        saving = save.disabled = cancel.disabled = account.disabled = nextDue.disabled = note.disabled = false;
      }
    };

    return ({ title, note: draft }) => {
      if (dialog.open) return;
      const accounts = offices().filter(row => !suppressed(row));
      if (!accounts.length) throw new Error('Save an account in Pipeline before creating a follow-up.');
      opener = document.activeElement;
      active = { title, accounts };
      form.reset();
      account.replaceChildren(new Option('Choose an account', ''), ...accounts.map(row =>
        new Option([row.town, row.locality, row.state].filter(Boolean).join(' · '), String(row.id))));
      note.value = (draft || title).slice(0, 2000);
      status.textContent = '';
      showAccount();
      dialog.showModal();
      account.focus();
    };
  }

  window.SdrScriptFollowup = { mount };
})();
