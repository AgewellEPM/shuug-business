(() => {
  'use strict';
  function node(tag, text, className) {
    const out = document.createElement(tag);
    if (text !== undefined) out.textContent = text;
    if (className) out.className = className;
    return out;
  }
  function mount({ api, review, context, navigate, changed }) {
    const host = document.querySelector('#coach-widget');
    if (!host) return;
    const panel = host.querySelector('#coach-popup'), launcher = host.querySelector('#coach-launch'), home = host.parentElement;
    const $ = s => panel.querySelector(s), form = $('#coach-form'), question = form.elements.question;
    const send = form.querySelector('[type="submit"]'), status = $('#coach-status'), log = $('#coach-messages'), stream = $('#coach-stream');
    const editor = $('#coach-goal-form'), edit = $('#coach-edit-goal'), goalStatus = $('#coach-goal-status'), reload = $('#coach-reload');
    const older = $('#coach-older'), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let identity, active = false, state, busy = false, key, version = 0, latestRequest = 0, pending, editingRevision = 0;
    let mailTurnId, applied;
    const nativeForms = window.SdrCoachControls?.forms();
    function say(message, previewId) {
      if (busy || !state) return;
      pane(false); question.value = message; key = undefined; mailTurnId = previewId; controls(); form.requestSubmit();
    }
    const voice = window.SdrCoachControls?.voice($('#coach-mic'), say, message => announce(message));
    const switchKey = id => 'sdr.coach.open.' + id;
    function remember(open) { if (identity) { try { sessionStorage.setItem(switchKey(identity), String(open)); } catch {} } }
    function sync() {
      const here = context();
      $('#coach-context').textContent = [here.label, here.accountName || (here.form === 'prospect' ? 'New prospect' : '')].filter(Boolean).join(' · ');
    }
    function pane(goal) {
      $('#coach-side').hidden = !goal; $('#coach-conversation').hidden = goal;
      $('#coach-show-goal').setAttribute('aria-pressed', String(goal)); $('#coach-show-chat').setAttribute('aria-pressed', String(!goal));
    }
    function open(focus = true) {
      if (!identity) return;
      const wasOpen = active;
      active = true; panel.hidden = false; launcher.hidden = true; launcher.setAttribute('aria-expanded', 'true'); remember(true); sync();
      if (!wasOpen && !busy) void loadState().then(() => {
        if (focus && active && document.activeElement === $('#coach-minimize') && !question.disabled) question.focus({ preventScroll: true });
      });
      if (focus) (state && !question.disabled ? question : $('#coach-minimize')).focus({ preventScroll: true });
    }
    function minimize(focus = true) {
      voice?.stop();
      active = false; panel.hidden = true; launcher.hidden = false; launcher.setAttribute('aria-expanded','false'); remember(false);
      if (focus) launcher.focus({ preventScroll: true });
    }
    launcher.onclick = () => open();
    $('#coach-minimize').onclick = () => minimize();
    $('#coach-show-chat').onclick = () => { pane(false); if (!question.disabled) question.focus(); };
    $('#coach-show-goal').onclick = () => { pane(true); if (!busy) void loadState(); };
    host.addEventListener('keydown', e => { if (e.key === 'Escape' && active) { e.preventDefault(); e.stopPropagation(); minimize(); } });
    // Native modal dialogs trap input outside their subtree. Keep the same widget available inside the active dialog.
    function attachToDialog() {
      const dialogs = [...document.querySelectorAll('#sales-workspace dialog[open]')];
      const parent = dialogs.at(-1) || home;
      if (host.parentElement !== parent) parent.append(host);
      if (dialogs.length && typeof host.showPopover === 'function') {
        host.setAttribute('popover', 'manual');
        if (!host.hidden && !host.matches(':popover-open')) host.showPopover();
      } else if (host.hasAttribute('popover')) { if (host.matches(':popover-open')) host.hidePopover(); host.removeAttribute('popover'); }
    }
    new MutationObserver(attachToDialog).observe(home, { subtree: true, attributes: true, attributeFilter: ['open'] });
    function announce(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
    function controls() {
      question.disabled = !state;
      question.readOnly = busy;
      send.disabled = !state || busy || !question.value.trim();
      edit.disabled = !state;
      $('#coach-welcome').hidden = !state || Boolean(log.children.length);
    }
    function closeGoal() {
      editor.hidden = true;
      edit.setAttribute('aria-expanded', 'false');
    }
    function goalCard() {
      const wrap = $('#coach-goal-summary'), goal = state?.goal;
      wrap.replaceChildren();
      edit.textContent = goal ? 'Edit goal' : 'Set goal';
      if (!goal) { wrap.append(node('p', 'Choose a target and deadline so Tinky can plan with you.')); return; }
      const line = node('p', undefined, 'coach-goal-numbers');
      line.append(node('strong', String(goal.count)), document.createTextNode(' / ' + goal.target));
      const meter = node('progress');
      meter.max = goal.target; meter.value = Math.min(goal.count, goal.target);
      meter.setAttribute('aria-label', goal.label);
      wrap.append(line, node('p', goal.label), meter, node('small', goal.start + ' – ' + goal.end));
      if (goal.focus) wrap.append(node('p', goal.focus, 'coach-focus'));
    }
    function openGoal(fields = {}) {
      if (!state) return;
      pane(true);
      const goal = state.goal;
      editingRevision = goal?.revision || 0;
      const values = { metric: 'meetings', start: state.calendar.weekStart, end: state.calendar.weekEnd, target: '', focus: '', ...(goal || {}), ...fields };
      for (const field of editor.elements) if (field.name) field.value = values[field.name] ?? '';
      editor.hidden = false; edit.setAttribute('aria-expanded', 'true'); goalStatus.textContent = '';
      editor.elements.target.focus();
    }
    function sourceLink(source) {
      const isView = /^#view=[a-z-]+$/.test(source.href) || /^#view=training&(?:section=playbooks|course=[a-z0-9-]+&lesson=[a-z0-9-]+)$/.test(source.href);
      if (!isView && !/^https:\/\/tinkytown\.com\/[a-z-]+\.html$/.test(source.href)) return null;
      const a = node('a', source.title);
      a.href = source.href;
      if (!isView) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else a.onclick = event => { if (event.ctrlKey || event.metaKey || event.shiftKey) return; event.preventDefault(); go(source.href); };
      return a;
    }
    async function go(href) {
      if (href === '#view=coach') { pane(true); return; }
      try { await navigate(href); sync(); } catch (error) { pane(false); announce(error.message, true); }
    }
    async function fillDraft(draft, originalForm) {
      if (draft.type === 'goal') { openGoal(draft.fields); return; }
      if (draft.type === 'workspaceForm') {
        if (draft.recordId && context().officeId !== draft.recordId) await navigate('#view=pipeline&account=' + encodeURIComponent(draft.recordId));
        await nativeForms.fill(draft, originalForm, navigate, context().view); return;
      }
      await review(draft);
    }
    function reviewedFields(turn) {
      const draft = turn?.draft;
      if (!draft || applied !== (turn.draftTurnId || turn.id)) return;
      if (draft.recordId && context().officeId !== draft.recordId) return;
      const selectors = { prospect: '#sales-business-prospect-form', activity: '#sales-activity', followup: '.sales-quick-followup', goal: '#coach-goal-form' };
      const form = selectors[draft.type] && document.querySelector(selectors[draft.type]);
      if (!form || (draft.type === 'goal' ? form.hidden : form.closest('[hidden]'))) return;
      const fields = Object.fromEntries([...form.elements].filter(f => f.name && !f.disabled && !['file','hidden','password'].includes(f.type)).map(f => [f.name, f.value]));
      return { type: draft.type, recordId: draft.recordId, fields };
    }
    function renderTurn(turn) {
      const group = node('article', undefined, 'coach-turn');
      group.dataset.id = turn.id;
      group.append(node('p', turn.question, 'coach-question'));
      const response = node('div', undefined, 'coach-answer');
      const author = turn.mode === 'guide' ? 'Workspace guide · AI unavailable' : turn.mode === 'workflow' ? 'Workspace guide' : 'Tinky';
      response.append(node('strong', author, 'coach-author'), node('p', turn.answer));
      if (turn.draft) {
        const labels = { prospect: 'Review prospect form', activity: 'Review activity', followup: 'Review follow-up', email: 'Review email draft', goal: 'Review goal', workspaceForm: 'Fill in form' };
        const button = node('button', labels[turn.draft.type] + (turn.draft.recordName ? ' · ' + turn.draft.recordName : ''), 'coach-review');
        button.type = 'button';
        button.onclick = async () => {
          if (turn.draft.type === 'goal') { openGoal(turn.draft.fields); applied = turn.draftTurnId || turn.id; return; }
          button.disabled = true;
          try { await fillDraft(turn.draft); applied = turn.draftTurnId || turn.id; minimize(false); }
          catch (error) {
            announce(error.message, true);
            const visible = document.querySelector('#sales-detail-drawer:not([hidden]) #sales-detail-status') || document.querySelector('#sales-message');
            if (visible) { visible.textContent = error.message; visible.dataset.error = 'true'; }
          } finally { button.disabled = false; }
        };
        response.append(button);
      }
      if (turn.mail) {
        const card = node('section', undefined, 'coach-mail-preview');
        card.append(node('strong', 'From ' + (turn.mail.entries[0]?.from || 'your sales mailbox')));
        for (const entry of turn.mail.entries) {
          const details = node('details'); details.open = turn.mail.entries.length === 1;
          details.append(node('summary', entry.name + ' · ' + entry.to), node('strong', entry.subject), node('p', entry.body)); card.append(details);
        }
        if (turn.mail.omitted.length) card.append(node('p', 'Excluded: ' + turn.mail.omitted.join(', ')));
        if (!turn.mail.configured) card.append(node('p', 'Connect your business mailbox in Senders to deliver this message.'));
        const deliver = node('button', turn.mail.entries.length === 1 ? 'Send this email' : 'Send ' + turn.mail.entries.length + ' individual emails', 'coach-review');
        deliver.type = 'button'; deliver.onclick = () => {
          if (state?.turns.at(-1)?.id !== turn.id) { announce('This preview is from an earlier turn. Ask for a fresh draft.', true); return; }
          say('Send it', turn.id);
        };
        card.append(deliver); response.append(card);
      }
      if (turn.navigation) {
        const button = node('button', 'Open ' + turn.navigation.title, 'coach-review'); button.type = 'button';
        button.onclick = () => go(turn.navigation.href); response.append(button);
      }
      const links = node('div', undefined, 'coach-sources');
      for (const source of turn.sources || []) { const link = sourceLink(source); if (link) links.append(link); }
      if (links.childNodes.length) response.append(links);
      group.append(response);
      return group;
    }
    function summary() {
      goalCard();
      const items = $('#coach-next');
      items.replaceChildren(...state.next.slice(0, 3).map(task => {
        const li = node('li'), link = node('a', task.title);
        if (task.officeId) link.href = '#view=pipeline&account=' + encodeURIComponent(task.officeId);
        else link.href = '#view=' + encodeURIComponent(task.view || 'today');
        link.onclick = event => { event.preventDefault(); void go(link.hash); };
        li.append(link); return li;
      }));
      if (!items.children.length) items.append(node('li', 'Your plan has no open recommendations.'));
    }
    async function loadState() {
      const generation = version, request = ++latestRequest;
      reload.hidden = true;
      if (!busy) announce('Loading your workspace…');
      try {
        const result = await api('coach-state', { timeZone });
        if (version !== generation || request !== latestRequest) return;
        state = result;
        log.replaceChildren(...state.turns.map(renderTurn));
        if (pending) log.append(pending);
        older.hidden = !state.hasOlder;
        summary(); controls(); stream.scrollTop = stream.scrollHeight;
        if (!busy) announce('');
      } catch (error) {
        if (version !== generation || request !== latestRequest) return;
        if ([401,403].includes(error.status)) reset();
        announce(error.message, true); reload.hidden = false;
      }
    }
    function reset() {
      minimize(false); pane(false); host.hidden = true; applied = mailTurnId = undefined;
      version++; latestRequest++; identity = undefined; state = pending = key = undefined; busy = false;
      log.replaceChildren(); question.value = ''; goalStatus.textContent = ''; $('#coach-next').replaceChildren();
      $('#coach-goal-summary').replaceChildren(); editor.reset(); closeGoal(); older.hidden = reload.hidden = true; announce(''); controls();
    }
    function view(user) {
      if (identity !== user.id) {
        reset(); identity = user.id; host.hidden = false;
        try { if (sessionStorage.getItem(switchKey(identity)) === 'true') open(false); } catch {}
      }
      sync();
    }
    reload.onclick = () => { key = undefined; void loadState(); };
    older.onclick = async () => {
      if (!state?.turns.length || older.disabled) return;
      const generation = version, first = state.turns[0].id;
      older.disabled = true;
      try {
        const page = await api('coach-state', { timeZone, before: first });
        if (generation !== version || state.turns[0]?.id !== first) return;
        const height = stream.scrollHeight;
        state.turns.unshift(...page.turns); log.prepend(...page.turns.map(renderTurn)); older.hidden = !page.hasOlder;
        stream.scrollTop += stream.scrollHeight - height;
      } catch (error) { if (version === generation) announce(error.message, true); }
      finally { older.disabled = false; }
    };
    edit.onclick = () => editor.hidden ? openGoal() : closeGoal();
    $('#coach-cancel-goal').onclick = () => { closeGoal(); edit.focus(); };
    editor.onsubmit = async event => {
      event.preventDefault();
      const generation = version, button = editor.querySelector('[type="submit"]');
      if (!state || button.disabled) return;
      button.disabled = true;
      try {
        const fields = Object.fromEntries(new FormData(editor));
        const { goal } = await api('coach-goal', { ...fields, target: Number(fields.target), timeZone, revision: editingRevision });
        if (generation !== version) return;
        state.goal = goal; closeGoal(); goalCard(); goalStatus.textContent = 'Goal saved.'; edit.focus();
      } catch (error) {
        if (generation === version) { goalStatus.textContent = error.message; if (error.status === 409) { closeGoal(); await loadState(); } }
      } finally { button.disabled = false; }
    };
    question.oninput = () => { key = undefined; mailTurnId = undefined; controls(); };
    for (const prompt of panel.querySelectorAll('[data-prompt]')) prompt.onclick = () => {
      question.value = prompt.dataset.prompt; key = undefined; controls(); question.focus();
    };
    question.onkeydown = event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault(); if (!send.disabled) form.requestSubmit();
      }
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (!state || busy || !question.value.trim()) return;
      const generation = version, message = question.value.trim(), lastId = state.turns.at(-1)?.id || 0;
      key ||= crypto.randomUUID();
      busy = true; reload.hidden = true; pending = node('p', message, 'coach-question'); log.append(pending);
      controls(); announce('Tinky is working on your question…'); stream.scrollTop = stream.scrollHeight;
      try {
        const here = context(), activeForm = nativeForms?.current();
        const reviewed = /^(?:please )?(?:save|record) (?:it|this|that|the )/i.test(message) ? reviewedFields(state.turns.at(-1)) : undefined;
        const { turn } = await api('coach-ask', { question: message, lastId, requestId: key, timeZone, mailTurnId, reviewed,
          screen: { view: here.view, form: here.form, officeId: here.officeId, prospect: here.prospect, activeForm } });
        if (generation !== version) return;
        pending.remove(); pending = null;
        if (!state.turns.some(item => item.id === turn.id)) { state.turns.push(turn); log.append(renderTurn(turn)); }
        question.value = ''; key = mailTurnId = undefined; announce(''); stream.scrollTop = stream.scrollHeight;
        if (turn.navigation && active && context().view === here.view && context().officeId === here.officeId) go(turn.navigation.href);
        if (turn.apply && turn.draft && active && context().view === here.view && context().officeId === here.officeId) {
          try { await fillDraft(turn.draft, activeForm); applied = turn.draftTurnId || turn.id; announce('Filled in the workspace. Review the fields before saving.'); }
          catch (error) { announce(error.message, true); }
        }
        if (turn.saved) { applied = undefined; if (turn.saved.type === 'goal') closeGoal(); await changed?.(); await loadState(); }
        if (active) voice?.answer(turn);
        if (active && panel.contains(document.activeElement)) question.focus({ preventScroll: true });
      } catch (error) {
        if (generation !== version) return;
        if ([401,403].includes(error.status)) reset();
        voice?.stop();
        announce(error.message, true); reload.hidden = error.status !== 409;
      } finally {
        if (generation === version) { pending?.remove(); pending = null; busy = false; controls(); }
      }
    };
    return { reset, view, sync, open };
  }
  window.SdrCoach = { mount };
})();
