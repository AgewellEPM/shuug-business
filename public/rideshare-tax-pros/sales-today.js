(() => {
  'use strict';

  const filterKinds = {
    'follow-ups': ['follow-up', 'reply'],
    meetings: ['meeting'],
    outreach: ['outreach'],
    pipeline: ['agreement', 'review', 'research', 'prospecting', 'territory'],
  };
  const taskKinds = {
    'follow-up': ['Follow-up', 'mail', 'green', 'Open'],
    reply: ['Reply', 'contacts', 'blue', 'Open'],
    agreement: ['Agreement', 'contracts', 'gold', 'Review'],
    outreach: ['Outreach', 'mail', 'violet', 'Prepare'],
    meeting: ['Meeting', 'calendar', 'blue', 'View'],
    review: ['Pipeline', 'pipeline', 'blue', 'Review'],
    research: ['Research', 'discover', 'violet', 'Research'],
    prospecting: ['Prospects', 'prospects', 'violet', 'Open'],
    territory: ['Territory', 'territories', 'blue', 'View map'],
  };
  const closedStages = new Set(['active', 'contract_signed', 'not_interested', 'do_not_contact']);
  const quickActions = {
    compose: { view: 'pipeline', label: 'Choose a business to email', empty: 'Save an open business with a contact email before opening a draft.' },
    schedule: { view: 'pipeline', label: 'Choose a business to follow up with', empty: 'Save an open business first to schedule a follow-up.' },
    proposal: { view: 'contracts', label: 'Choose a business for the agreement', empty: 'Save an open business first to prepare an agreement.' },
  };
  const pageSize = 20;

  function actionAllowed(office, action) {
    if (closedStages.has(office.pipeline?.stage) || closedStages.has(office.status)) return false;
    try {
      if (JSON.parse(office.notes || '{}')?.primaryContactDoNotContact === true) return false;
    } catch { /* The office tools validate its record before making changes. */ }
    return action !== 'compose' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(office.contact_email?.trim() || '');
  }

  function node(tag, text, className = '') {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  }

  function button(text, className, action) {
    const item = node('button', text, className);
    item.type = 'button';
    item.addEventListener('click', action);
    return item;
  }

  function mount({ api, onAction }) {
    const host = document.querySelector('[data-tab-panel="today"]');
    if (!host) return null;
    const $ = selector => host.querySelector(selector);
    const filters = [...host.querySelectorAll('[data-today-filter]')];
    const tasks = $('[data-today-tasks]');
    const more = $('[data-today-more]');
    const status = $('[data-today-status]');
    const recommendationStatus = $('[data-today-recommendation-status]');
    const refresh = $('[data-today-refresh]');
    const picker = $('[data-today-office-picker]');
    const pickerForm = $('[data-today-office-form]');
    const officeSelect = pickerForm.elements.office;
    const scheduleLink = $('[data-today-schedule-link]');
    const scheduleEmpty = $('[data-today-schedule-empty]');
    const scheduleMetric = $('[data-today-metric="meetingsSet"], [data-today-metric="followUpsScheduled"]');
    const scheduleAction = $('[data-today-schedule-action]');
    const initialCalendar = scheduleLink.dataset.todayAction === 'calendar';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const formatTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone });
    let workspace, plan, filter = 'all', shown = pageSize, pending = false, sequence = 0, choosing, choiceButton;

    const icon = name => $(`[data-today-icon="${name}"]`).content.cloneNode(true);
    function announce(text = '', error = false) {
      status.textContent = text;
      status.dataset.error = String(error);
    }
    async function launch(action) {
      try {
        await onAction(action);
      } catch (error) {
        announce(error.message || 'The workspace action could not open.', true);
      }
    }

    function match(task, key) {
      return key === 'all' || filterKinds[key].includes(task.kind);
    }
    function disableWhilePending() {
      refresh.disabled = pending;
      tasks.setAttribute('aria-busy', String(pending));
      for (const control of tasks.querySelectorAll('[data-today-task-check]')) control.disabled = pending;
    }

    function taskRow(task, index) {
      const [label, symbol, tone, verb] = taskKinds[task.kind] || ['Task', 'pipeline', 'blue', 'View'];
      const row = node('li', undefined, 'today-task');
      row.dataset.completed = String(task.completed);
      const check = node('input');
      check.type = 'checkbox';
      check.checked = task.completed;
      check.dataset.todayTaskCheck = task.id;
      check.setAttribute('aria-label', task.title);
      check.addEventListener('change', () => {
        void request('set-sales-daily-plan-task', { date: plan.date, taskId: task.id, completed: check.checked }, { restore: task.id });
      });
      const rank = node('span', index + 1 + '.', 'today-rank');
      rank.setAttribute('aria-hidden', 'true');
      const sign = node('span', undefined, 'today-task-icon');
      sign.append(icon(symbol));
      const text = node('div', undefined, 'today-task-text');
      text.append(node('strong', task.title));
      if (task.detail) text.append(node('span', task.detail));
      const badge = node('span', label, 'today-tag ' + tone);
      const action = button(task.completed ? 'View' : verb, 'today-task-action', () =>
        launch({
          view: task.view, action: task.kind, officeId: task.officeId,
          ...(task.appointmentId ? { appointmentId: task.appointmentId, date: task.dueOn } : {}),
        }));
      action.setAttribute('aria-label', (task.completed ? 'View' : verb) + ' ' + task.title);
      action.append(icon('arrow'));
      row.append(check, rank, sign, text, badge, action);
      return row;
    }

    function paintTasks(restore) {
      const items = plan?.tasks || [];
      const count = items.filter(task => task.completed).length;
      $('[data-today-completed]').textContent = `${count} of ${items.length} completed`;
      $('[data-today-percent]').textContent = (items.length ? Math.round(100 * count / items.length) : 0) + '%';
      const progress = $('[data-today-progress]');
      progress.max = items.length || 1;
      progress.value = count;
      for (const control of filters) {
        const key = control.dataset.todayFilter;
        control.setAttribute('aria-pressed', String(key === filter));
        control.querySelector('[data-today-filter-count]').textContent = '(' + items.filter(task => match(task, key)).length + ')';
      }
      const matching = items.map((task, index) => ({ task, index })).filter(({ task }) => match(task, filter));
      tasks.replaceChildren(...matching.slice(0, shown).map(({ task, index }) => taskRow(task, index)));
      $('[data-today-tasks-empty]').hidden = !plan || matching.length > 0;
      more.hidden = matching.length <= shown;
      disableWhilePending();
      if (restore && !host.hidden) {
        [...tasks.querySelectorAll('[data-today-task-check]')].find(control => control.dataset.todayTaskCheck === restore)?.focus();
      }
    }

    function scheduleRow(item) {
      const appointment = item.type === 'appointment';
      const date = node('span', undefined, 'today-schedule-date');
      if (appointment) {
        const start = Date.parse(item.start);
        const minutes = Math.round((Date.parse(item.end) - start) / 60000);
        if (Number.isFinite(start)) {
          const time = node('time', formatTime.format(start));
          time.dateTime = item.start;
          date.append(time);
        }
        date.append(node('small', minutes > 0 ? minutes + ' min' : 'Appointment'));
      } else {
        const day = node('time', 'Today');
        day.dateTime = item.dueOn;
        date.append(day, node('small', 'Follow-up'));
      }
      const text = node('span', undefined, 'today-schedule-text');
      text.append(node('strong', item.title));
      if (item.detail) text.append(node('small', item.detail));
      const destination = appointment
        ? { view: 'calendar', action: 'appointment', appointmentId: item.appointmentId, date: item.dueOn }
        : { view: item.view, action: 'follow-up', officeId: item.officeId };
      const action = button(undefined, 'today-schedule-row', () => launch(destination));
      action.append(date, text, icon('calendar'));
      const row = node('li');
      row.append(action);
      return row;
    }

    function paint(restore) {
      paintTasks(restore);
      const schedule = plan?.schedule || [];
      const hasCalendar = plan?.hasCalendar ?? initialCalendar;
      scheduleLink.dataset.todayAction = hasCalendar ? 'calendar' : 'appointments';
      scheduleLink.textContent = hasCalendar ? 'View calendar' : 'View follow-ups';
      scheduleEmpty.textContent = hasCalendar ? 'No appointments or follow-ups scheduled for today.' : 'No follow-ups scheduled for today.';
      scheduleEmpty.hidden = !plan || schedule.length > 0;
      scheduleMetric.dataset.todayMetric = hasCalendar ? 'meetingsSet' : 'followUpsScheduled';
      scheduleMetric.previousElementSibling.textContent = hasCalendar ? 'Meetings set' : 'Follow-ups scheduled';
      scheduleAction.dataset.todayAction = hasCalendar ? 'schedule-meeting' : 'schedule';
      scheduleAction.querySelector('strong').textContent = hasCalendar ? 'Schedule meeting' : 'Schedule follow-up';
      scheduleAction.querySelector('span').textContent = hasCalendar ? 'Open availability and booking links.' : 'Set a date for your next conversation.';
      $('[data-today-schedule]').replaceChildren(...schedule.map(scheduleRow));
      $('[data-today-schedule-count]').textContent = plan ? '(' + schedule.length + ')' : '';
      for (const metric of host.querySelectorAll('[data-today-metric]')) {
        metric.textContent = plan ? Number(plan.counts[metric.dataset.todayMetric] || 0).toLocaleString() : '—';
      }

      const recommendations = plan?.recommendations || [];
      $('[data-today-recommendations]').replaceChildren(...recommendations.map(item => {
        const row = node('li');
        const mark = node('span', '✓', 'today-recommend-mark');
        mark.setAttribute('aria-hidden', 'true');
        const action = button(item.title, 'today-recommendation-link', () =>
          launch({
            view: item.view, action: 'recommendation', officeId: item.officeId,
            ...(item.appointmentId ? { appointmentId: item.appointmentId, date: plan.date } : {}),
          }));
        const text = node('div');
        text.append(action);
        if (item.detail) text.append(node('p', item.detail));
        row.append(mark, text);
        return row;
      }));
      $('[data-today-recommendations-empty]').hidden = !plan || recommendations.length > 0;
    }

    async function request(action, input = {}, { restore, recommendations = false } = {}) {
      if (pending) return;
      const generation = ++sequence;
      pending = true;
      disableWhilePending();
      announce(plan ? '' : 'Loading today’s plan…');
      recommendationStatus.textContent = '';
      try {
        const next = await api(action, { timeZone, ...input });
        if (generation !== sequence) return;
        plan = next;
        announce();
        if (recommendations) recommendationStatus.textContent = 'Next actions refreshed.';
      } catch (error) {
        if (generation !== sequence) return;
        const note = error.message || 'Today’s plan could not be refreshed.';
        if (recommendations) recommendationStatus.textContent = note;
        else announce(note, true);
      } finally {
        if (generation === sequence) {
          pending = false;
          paint(restore);
        }
      }
    }

    function choices(action) {
      return (workspace?.offices || []).filter(office => actionAllowed(office, action)).map(office => {
        const location = [office.locality, office.state].filter(Boolean).join(', ');
        return { id: String(office.id), label: [office.town, location].filter(Boolean).join(' · ') };
      }).sort((a, b) => a.label.localeCompare(b.label));
    }
    function closePicker(focus) {
      picker.hidden = true;
      choosing = undefined;
      if (focus) choiceButton?.focus();
      choiceButton = undefined;
    }
    function showPicker(action, source) {
      const options = choices(action);
      if (options.length === 1) {
        closePicker(false);
        return launch({ view: quickActions[action].view, action, officeId: options[0].id });
      }
      choosing = action;
      choiceButton = source;
      picker.hidden = false;
      pickerForm.hidden = options.length === 0;
      $('[data-today-office-empty]').hidden = options.length > 0;
      if (!options.length) {
        $('[data-today-office-message]').textContent = quickActions[action].empty;
        picker.querySelector('[data-today-action="prospects"]').focus();
        return;
      }
      $('[data-today-office-label]').textContent = quickActions[action].label;
      officeSelect.replaceChildren(new Option('Select a saved business', ''), ...options.map(option => new Option(option.label, option.id)));
      officeSelect.focus();
    }

    host.addEventListener('click', event => {
      const filterButton = event.target.closest('[data-today-filter]');
      if (filterButton) {
        filter = filterButton.dataset.todayFilter;
        shown = pageSize;
        paintTasks();
        return;
      }
      const control = event.target.closest('[data-today-action]');
      if (!control) return;
      const action = control.dataset.todayAction;
      if (quickActions[action]) showPicker(action, control);
      else {
        closePicker(false);
        let destination = { view: action, action };
        if (action === 'calendar') destination = { view: 'calendar', action: 'appointments', date: plan?.date };
        if (action === 'schedule-meeting') destination.view = 'calendar';
        if (action === 'add-prospect') destination.view = 'prospects';
        void launch(destination);
      }
    });
    more.addEventListener('click', () => {
      const firstNew = shown;
      shown += pageSize;
      paintTasks();
      tasks.children[firstNew]?.querySelector('input').focus();
    });
    picker.querySelectorAll('[data-today-office-cancel]').forEach(control =>
      control.addEventListener('click', () => closePicker(true)));
    pickerForm.addEventListener('submit', event => {
      event.preventDefault();
      const action = choosing, officeId = officeSelect.value;
      if (!action || !choices(action).some(option => option.id === officeId)) return;
      closePicker(false);
      void launch({ view: quickActions[action].view, action, officeId });
    });
    refresh.addEventListener('click', () => void request('sales-daily-plan', {}, { recommendations: true }));

    return {
      render(data) {
        if (workspace && workspace.user.id !== data.user.id) {
          sequence++;
          plan = undefined;
          pending = false;
          closePicker(false);
          announce();
          paint();
        }
        workspace = data;
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        const name = (data.repProfile?.name || data.user.name || '').trim();
        const first = data.user.role === 'owner' && /^workspace owner$/i.test(name) ? '' : name.split(/\s+/)[0];
        $('[data-today-greeting]').textContent = greeting + (first ? ', ' + first : '');
      },
      open() { return request('sales-daily-plan'); },
    };
  }

  window.SdrToday = { mount };
})();
