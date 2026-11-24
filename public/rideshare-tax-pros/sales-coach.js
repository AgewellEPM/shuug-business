(() => {
  'use strict';
  function node(tag, text, className) {
    const out = document.createElement(tag);
    if (text !== undefined) out.textContent = text;
    if (className) out.className = className;
    return out;
  }
  function mount({ api, review }) {
    const panel = document.querySelector('[data-tab-panel="coach"]');
    if (!panel) return;
    const $ = s => panel.querySelector(s), form = $('#coach-form'), question = form.elements.question;
    const send = form.querySelector('button'), status = $('#coach-status'), log = $('#coach-messages'), stream = $('#coach-stream');
    const editor = $('#coach-goal-form'), edit = $('#coach-edit-goal'), goalStatus = $('#coach-goal-status'), reload = $('#coach-reload');
    const older = $('#coach-older'), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let identity, active = false, state, busy = false, key, version = 0, latestRequest = 0, pending, editingRevision = 0;
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
      const goal = state.goal;
      editingRevision = goal?.revision || 0;
      const values = { metric: 'meetings', start: state.calendar.weekStart, end: state.calendar.weekEnd, target: '', focus: '', ...(goal || {}), ...fields };
      for (const field of editor.elements) if (field.name) field.value = values[field.name] ?? '';
      editor.hidden = false; edit.setAttribute('aria-expanded', 'true'); goalStatus.textContent = '';
      editor.elements.target.focus();
    }
    function sourceLink(source) {
      const isView = /^#view=[a-z-]+$/.test(source.href);
      if (!isView && !/^https:\/\/tinkytown\.com\/[a-z-]+\.html$/.test(source.href)) return null;
      const a = node('a', source.title);
      a.href = source.href;
      if (!isView) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      return a;
    }
    function renderTurn(turn) {
      const group = node('article', undefined, 'coach-turn');
      group.dataset.id = turn.id;
      group.append(node('p', turn.question, 'coach-question'));
      const response = node('div', undefined, 'coach-answer');
      response.append(node('strong', turn.mode === 'guide' ? 'Workspace guide · AI unavailable' : 'Tinky', 'coach-author'), node('p', turn.answer));
      if (turn.draft) {
        const labels = { prospect: 'Review prospect form', activity: 'Review activity', followup: 'Review follow-up', email: 'Review email draft', goal: 'Review goal' };
        const button = node('button', labels[turn.draft.type] + (turn.draft.recordName ? ' · ' + turn.draft.recordName : ''), 'coach-review');
        button.type = 'button';
        button.onclick = async () => {
          if (turn.draft.type === 'goal') { openGoal(turn.draft.fields); return; }
          button.disabled = true;
          try { await review(turn.draft); }
          catch (error) {
            announce(error.message, true);
            const visible = document.querySelector('#sales-detail-drawer:not([hidden]) #sales-detail-status') || document.querySelector('#sales-message');
            if (visible) { visible.textContent = error.message; visible.dataset.error = 'true'; }
          } finally { button.disabled = false; }
        };
        response.append(button);
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
        const li = node('li'); li.append(node('span', task.title)); return li;
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
      version++; latestRequest++; identity = undefined; state = pending = key = undefined; busy = active = false;
      log.replaceChildren(); question.value = ''; goalStatus.textContent = ''; $('#coach-next').replaceChildren();
      $('#coach-goal-summary').replaceChildren(); editor.reset(); closeGoal(); older.hidden = reload.hidden = true; announce(''); controls();
    }
    function view(user, name) {
      if (identity !== user.id) { reset(); identity = user.id; }
      if (name !== 'coach') { active = false; return; }
      if (!active) { active = true; if (!busy) void loadState(); }
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
    question.oninput = () => { key = undefined; controls(); };
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
        const { turn } = await api('coach-ask', { question: message, lastId, requestId: key, timeZone });
        if (generation !== version) return;
        pending.remove(); pending = null;
        if (!state.turns.some(item => item.id === turn.id)) { state.turns.push(turn); log.append(renderTurn(turn)); }
        question.value = ''; key = undefined; announce(''); stream.scrollTop = stream.scrollHeight;
        if (active) question.focus();
      } catch (error) {
        if (generation !== version) return;
        if ([401,403].includes(error.status)) reset();
        announce(error.message, true); reload.hidden = error.status !== 409;
      } finally {
        if (generation === version) { pending?.remove(); pending = null; busy = false; controls(); }
      }
    };
    return { reset, view };
  }
  window.SdrCoach = { mount };
})();
