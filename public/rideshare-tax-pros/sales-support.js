(() => {
  'use strict';

  const labels = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
  const kinds = { article: 'Help articles', guide: 'User guides', tutorial: 'Quick tutorials' };
  const views = { prospects: 'Prospects', pipeline: 'Pipeline', contracts: 'Contracts', territories: 'Territories', contacts: 'Owners & Rolodex', locations: 'Signup locations' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const localTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
  const month = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric' });
  const durationNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const ratingNumber = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const ratingOptions = [1, 2, 3, 4, 5];
  const badge = status => `<span class="support-status" data-state="${escape(status)}">${escape(labels[status])}</span>`;

  function firstResponseMinutes(request) {
    if (request.requester.id === 'owner') return null;
    const reply = request.messages.find(message => message.author.id === 'owner');
    const minutes = (Date.parse(reply?.createdAt) - Date.parse(request.createdAt)) / 60_000;
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function formatResponseTime(minutes) {
    if (minutes === null) return '—';
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${durationNumber.format(minutes)} min`;
    if (minutes < 1440) return `${durationNumber.format(minutes / 60)} hr`;
    return `${durationNumber.format(minutes / 1440)} d`;
  }

  function mount({ api, navigate }) {
    const root = document.querySelector('.sdr-support');
    if (!root) return;
    const find = selector => root.querySelector(selector);
    const library = window.SdrSupportContent || [];
    const search = find('[data-support-search]');
    const libraryPanel = find('[data-support-library]');
    const libraryTitle = find('#support-library-title');
    const topicButtons = [...root.querySelectorAll('[data-support-topic]')];
    const requestPanel = find('[data-support-request-panel]');
    const requestNote = find('[data-support-request-note]');
    const requestTable = find('[data-support-table]');
    const viewAll = requestPanel.querySelector('[data-support-action="requests"]');
    const dialog = find('[data-support-dialog]');
    const dialogTitle = find('#support-dialog-title');
    const dialogBody = find('[data-support-dialog-body]');
    const metric = name => find(`[data-support-metric="${name}"]`);
    const categories = Object.fromEntries([...find('[data-support-create]').content.querySelectorAll('option')]
      .map(option => [option.value, option.textContent]));
    let userId, requests = [], canManage = false, expanded = false, loaded = false, pending, activeDialog;
    let libraryTrigger, dialogTrigger;

    function renderLibrary({ query = '', topic = '', kind = '' }) {
      const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const results = library.filter(entry => {
        const indexed = [entry.title, entry.description, entry.topic, ...entry.steps].join(' ').toLocaleLowerCase();
        return (!kind || entry.kind === kind) && (!topic || entry.topic.toLocaleLowerCase() === topic.toLocaleLowerCase()) &&
          words.every(word => indexed.includes(word));
      });
      libraryTitle.textContent = kind ? kinds[kind] : topic || 'Help search results';
      find('[data-support-results-count]').textContent = results.length
        ? `${results.length} ${results.length === 1 ? 'resource' : 'resources'}`
        : 'No resources found. Try a shorter search or submit a request.';
      find('[data-support-results]').innerHTML = results.map(entry => `<article class="support-result">
        <span>${escape(entry.topic)} · ${kinds[entry.kind]}</span><h3>${escape(entry.title)}</h3>
        <p>${escape(entry.description)}</p><button class="support-link" type="button" data-support-entry="${escape(entry.id)}">Read ${entry.kind} <span aria-hidden="true">→</span></button>
      </article>`).join('');
      for (const button of topicButtons) button.setAttribute('aria-pressed', String(button.textContent.trim().toLocaleLowerCase() === topic.toLocaleLowerCase()));
      libraryPanel.hidden = false;
      libraryTitle.focus();
    }

    function openLibrary(button, options) {
      libraryTrigger = button;
      search.elements.query.value = '';
      renderLibrary(options);
    }

    function renderRequests() {
      const thisMonth = month.format(new Date());
      const response = average(requests.map(firstResponseMinutes).filter(value => value !== null));
      const satisfaction = average(requests.map(request => request.rating).filter(value => ratingOptions.includes(value)));
      metric('open').textContent = String(requests.filter(request => request.requester.id === userId && request.status !== 'resolved').length);
      metric('response').textContent = formatResponseTime(response);
      metric('resolved').textContent = String(requests.filter(request => request.resolvedAt && month.format(new Date(request.resolvedAt)) === thisMonth).length);
      metric('satisfaction').textContent = satisfaction === null ? '—' : `${ratingNumber.format(satisfaction)} / 5`;
      find('#support-requests-title span').textContent = canManage ? 'Workspace Support Requests' : 'My Support Requests';
      find('[data-support-request-rows]').innerHTML = (expanded ? requests : requests.slice(0, 3)).map(request => `<tr>
        <td class="support-request-id">${escape(request.id)}</td>
        <td><button type="button" class="support-request-subject" data-support-request="${escape(request.id)}">
          ${escape(request.subject)}${canManage ? `<small>${escape(request.requester.name)}</small>` : ''}</button></td>
        <td>${badge(request.status)}</td>
        <td><time datetime="${escape(request.updatedAt)}">${dateTime.format(new Date(request.updatedAt))}</time></td>
      </tr>`).join('');
      requestNote.textContent = requests.length ? '' : 'No support requests yet.';
      requestNote.hidden = Boolean(requests.length);
      requestTable.hidden = !requests.length;
      viewAll.hidden = requests.length <= 3;
      viewAll.setAttribute('aria-expanded', String(expanded));
      viewAll.firstChild.textContent = expanded ? 'Show recent requests ' : 'View all requests ';
    }

    function connection(ready) {
      metric('connection').textContent = ready ? 'Connected' : 'Check failed';
      find('[data-support-check-time]').textContent = `${ready ? 'Last checked' : 'Check failed at'} ${localTime.format(new Date())}`;
      find('[data-support-service="workspace"]').textContent = ready ? 'Connected' : 'Check failed';
      find('[data-support-service="requests"]').textContent = ready ? 'Available' : 'Unable to load';
      root.querySelectorAll('[data-support-service]').forEach(node => { node.dataset.state = ready ? 'ready' : 'unavailable'; });
    }

    function load() {
      if (pending) return pending;
      const refreshButton = find('[data-support-action="refresh"]');
      refreshButton.disabled = true;
      pending = api('support-requests').then(result => {
        ({ requests, canManage } = result);
        loaded = true;
        renderRequests();
        connection(true);
      }).catch(() => {
        connection(false);
        requestNote.hidden = false;
        requestNote.textContent = 'Support requests could not be loaded. Try Refresh status.';
      }).finally(() => {
        pending = undefined;
        refreshButton.disabled = false;
      });
      return pending;
    }

    function openDialog(title, body, state = {}) {
      dialogTitle.textContent = title;
      dialogBody.replaceChildren();
      if (typeof body === 'string') dialogBody.innerHTML = body;
      else dialogBody.append(body);
      activeDialog = state;
      if (!dialog.open) {
        dialogTrigger = document.activeElement;
        dialog.showModal();
      }
    }

    function openEntry(id) {
      const entry = library.find(item => item.id === id);
      if (!entry) return;
      openDialog(entry.title, `<p>${escape(entry.description)}</p><ol class="support-step-list">
        ${entry.steps.map(step => `<li>${escape(step)}</li>`).join('')}
        </ol>${views[entry.view] ? `<button type="button" class="support-button support-primary" data-support-view="${entry.view}">Open ${views[entry.view]}</button>` : ''}`);
    }

    function openRequest(request, { notice = '', form = 'reply' } = {}) {
      const canRate = request.status === 'resolved' && request.requester.id === userId;
      openDialog(request.subject, `<p>#${escape(request.id)} · ${escape(categories[request.category] || 'Other')} · ${badge(request.status)}</p>
        <ol class="support-thread" aria-label="Request messages">${request.messages.map(message => `
          <li class="support-thread-message"><header><strong>${escape(message.author.name)}</strong>
            <time datetime="${escape(message.createdAt)}">${dateTime.format(new Date(message.createdAt))}</time></header>
            <p>${escape(message.message)}</p></li>`).join('')}</ol>
        <form class="support-form" data-support-form="reply">
          ${canManage ? `<label>Status<select name="status">${Object.entries(labels).map(([key, label]) => `<option value="${key}"${key === request.status ? ' selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}
          <label>Reply<textarea name="message" maxlength="5000" rows="4"${canManage ? '' : ' required'}></textarea></label>
          <p role="status" data-support-form-note>${form === 'reply' ? escape(notice) : ''}</p>
          <button type="submit" class="support-button support-primary">${canManage ? 'Save update' : 'Add reply'}</button>
        </form>
        ${canRate ? `<form class="support-form support-rating-form" data-support-form="rating">
          <label>Support rating<select name="rating" required>
            <option value="" disabled${request.rating === null ? ' selected' : ''}>Choose a rating</option>
            ${ratingOptions.map(value => `<option value="${value}"${request.rating === value ? ' selected' : ''}>${value} of 5</option>`).join('')}
          </select></label>
          <p role="status" data-support-form-note>${form === 'rating' ? escape(notice) : ''}</p>
          <button type="submit" class="support-button">Save rating</button>
        </form>` : ''}`, { request });
    }

    function openCreate(title) {
      openDialog(title, find('[data-support-create]').content.cloneNode(true));
    }

    function openQuote(offer) {
      find('#support-requests-title').focus();
      openCreate('Request a product quote');
      const form = dialogBody.querySelector('[data-support-form]');
      form.elements.category.value = 'billing';
      form.elements.subject.value = offer ? 'Quote request — ' + offer : 'TinkyTown quote request';
      form.elements.message.placeholder = 'Include the facility name, devices and quantities, rollout date, and follow-up contact.';
      form.elements.message.focus();
    }

    async function startChat(button) {
      if (!loaded) {
        button.disabled = true;
        await load();
        button.disabled = false;
      }
      if (root.hidden || dialog.open) return;
      const active = requests.find(request => request.requester.id === userId && request.status !== 'resolved');
      if (active) openRequest(active);
      else openCreate('Start a support conversation');
    }

    async function save(form) {
      const state = activeDialog;
      const submit = form.querySelector('button[type="submit"]');
      const note = form.querySelector('[data-support-form-note]');
      const input = Object.fromEntries(new FormData(form));
      const kind = form.dataset.supportForm;
      const creating = kind === 'create';
      if (!creating) input.id = state.request.id;
      if (kind === 'rating') input.rating = Number(input.rating);
      if (kind === 'reply') {
        if (input.status === state.request.status) delete input.status;
        if (!input.message.trim() && !input.status) {
          note.textContent = 'Add a reply or choose a different status.';
          return;
        }
      }
      submit.disabled = true;
      note.textContent = 'Saving…';
      try {
        const { request } = await api(creating ? 'support-request-create' : 'support-request-update', input);
        if (dialog.open && activeDialog === state) {
          const notice = { create: 'Request submitted.', reply: 'Update saved.', rating: 'Rating saved.' }[kind];
          openRequest(request, { notice, form: creating ? 'reply' : kind });
        }
        await pending;
        await load();
      } catch (error) {
        note.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    }

    search.addEventListener('submit', event => {
      event.preventDefault();
      libraryTrigger = search.elements.query;
      renderLibrary({ query: search.elements.query.value });
    });
    document.querySelector('[data-support-sidebar-resources]')?.addEventListener('click', event => {
      openLibrary(event.currentTarget, { kind: 'guide' });
    });
    root.addEventListener('submit', event => {
      if (!event.target.matches('[data-support-form]')) return;
      event.preventDefault();
      if (activeDialog && !event.target.querySelector('button[type="submit"]').disabled) void save(event.target);
    });
    dialog.addEventListener('close', () => {
      activeDialog = undefined;
      (dialogTrigger?.isConnected ? dialogTrigger : find('#support-requests-title')).focus();
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      const { supportTopic, supportEntry, supportRequest, supportView, supportAction } = button.dataset;
      if (supportTopic || kinds[supportAction]) {
        openLibrary(button, supportTopic ? { topic: button.textContent.trim() } : { kind: supportAction });
      } else if (supportEntry) {
        openEntry(supportEntry);
      } else if (supportRequest) {
        const request = requests.find(row => row.id === supportRequest);
        if (request) openRequest(request);
      } else if (supportView) {
        dialog.close();
        navigate(supportView);
      } else if (supportAction === 'create') {
        openCreate('Submit a support request');
      } else if (supportAction === 'chat') {
        void startChat(button);
      } else if (supportAction === 'close-dialog') {
        dialog.close();
      } else if (supportAction === 'refresh') {
        void load();
      } else if (supportAction === 'requests') {
        expanded = button !== viewAll || !expanded;
        if (loaded) renderRequests();
        if (button !== viewAll || viewAll.hidden) find('#support-requests-title').focus();
      } else if (supportAction === 'clear-library') {
        libraryPanel.hidden = true;
        topicButtons.forEach(topic => topic.setAttribute('aria-pressed', 'false'));
        libraryTrigger?.focus();
      }
    });
    return { openQuote, show(user, entering) {
      userId = String(user.id);
      if (entering || !loaded) void load();
    } };
  }

  window.SdrSalesSupport = { mount };
})();
