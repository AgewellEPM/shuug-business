(() => {
  'use strict';
  const { $, node, button, link, dateKey, fmtDate, clock, when, zones, renderMonth, copy } = window.TinkyBooking;
  const labels = { pending: 'queued', working: 'in progress', unconfigured: 'setup needed', 'test-accepted': 'accepted in test mode',
    uncertain: 'delivery unconfirmed', 'setup-changed': 'connection changed' };
  function mount({ api }) {
    const panel = $('[data-tab-panel="calendar"]');
    if (!panel) return null;
    const form = $('#bk-settings'), select = $('#bk-staff-host');
    let account, host, data, serial = 0, month, selected, view = 'agenda';
    function status(message = '', error = false) {
      const box = $('#bk-staff-status');
      box.textContent = message; box.dataset.error = String(error);
    }
    function safe(work) {
      return async event => {
        const control = event.currentTarget;
        control.disabled = true;
        try { await work(); } catch (err) { status(err.message, true); }
        finally { if (control.isConnected) control.disabled = false; }
      };
    }
    function showView(next) {
      view = next;
      for (const pane of panel.querySelectorAll('[data-bk-pane]')) pane.hidden = pane.dataset.bkPane !== view;
      for (const tab of panel.querySelectorAll('[data-bk-view]')) tab.setAttribute('aria-pressed', String(tab.dataset.bkView === view));
    }
    for (const tab of panel.querySelectorAll('[data-bk-view]')) tab.onclick = () => { status(); showView(tab.dataset.bkView); };
    const group = (title, description) => {
      const div = node('section', undefined, 'bk-connection');
      div.append(node('h4', title), node('p', description));
      return div;
    };
    function renderConnections() {
      const { connected, configured, email, webhooks, redirect } = data.connections, own = account.id === host;
      const names = { google: 'Google Calendar', microsoft: 'Microsoft Outlook' };
      const cal = group('Google Calendar & Outlook', connected ? names[connected] + ' is connected. Busy times are blocked and appointments appear on the primary calendar.' :
        'Connect the primary calendar to check busy times, add bookings and invite clients.');
      if (!own) cal.append(node('p', 'This rep manages their connection from their own sign-in.'));
      else if (connected) cal.append(button('Disconnect ' + names[connected], safe(async () => {
        if (!window.confirm('Disconnect this calendar? Existing events stay in the external calendar and future changes will stop syncing.')) return;
        await api('booking-disconnect'); await load();
      })));
      else {
        for (const provider of configured) cal.append(button('Connect ' + names[provider], safe(async () => {
          const result = await api('booking-connect', { provider }); location.assign(result.url);
        })));
        if (configured.length < 2) {
          const details = node('details'), summary = node('summary', 'Provider setup');
          details.append(summary, node('p', 'Register a web OAuth app with your provider. Use this redirect URI.'), node('code', redirect));
          if (!configured.includes('google')) details.append(node('p', 'Google Calendar API: set SDR_GOOGLE_CALENDAR_CLIENT_ID and SDR_GOOGLE_CALENDAR_CLIENT_SECRET on the workspace server.'));
          if (!configured.includes('microsoft')) details.append(node('p', 'Microsoft Graph: set SDR_MICROSOFT_CALENDAR_CLIENT_ID and SDR_MICROSOFT_CALENDAR_CLIENT_SECRET with delegated Calendars.ReadWrite access.'));
          cal.append(details);
        }
      }
      const mail = group('Booking email', email === 'live' ? 'Mailgun and an approved sender are connected. Each appointment shows its email status.' :
        email === 'test' ? 'Mailgun test mode is active. Live email requires switching the configured sender to live mode.' :
          'Configure Mailgun and approve a provider address in Senders for client confirmations and rep notifications.');
      const feed = group('Calendar subscription', 'Subscribe in Apple Calendar or another iCalendar app to view this schedule. Anyone with the private link can read the appointments.');
      if (own && data.feedURL) {
        feed.append(button('Copy subscription link', () => copy(data.feedURL, status)), button('Turn off subscription', safe(async () => {
          await api('booking-feed', { enabled: false }); await load();
        })));
      } else if (own) feed.append(button('Create private subscription link', safe(async () => { await api('booking-feed', { enabled: true }); await load(); })));
      else feed.append(node('p', 'The rep can create a private subscription link.'));
      const hooks = group('API & webhooks', 'Connect a CRM or automation tool to booking confirmations, reschedules and cancellations.');
      for (const hook of webhooks) {
        const row = node('div', undefined, 'bk-hook-row');
        row.append(node('strong', hook.name), node('small', hook.hostname + ' · ' + (['workspace', 'server'].includes(hook.scope) ? 'Entire workspace' : 'This rep')));
        if (hook.scope !== 'server' && (hook.scope === host || account.role === 'owner')) {
          row.append(button('Remove', safe(async () => {
            if (!window.confirm('Stop sending booking events to ' + hook.name + '?')) return;
            await api('booking-webhook-remove', { host, name: hook.name, scope: hook.scope }); await load();
          })));
        }
        hooks.append(row);
      }
      const scope = $('#bk-hook-form').elements.scope;
      scope.querySelector('[value=workspace]').disabled = account.role !== 'owner';
      if (account.role !== 'owner') scope.value = 'rep';
      const doc = link('Booking API and webhook setup', '/book/api');
      doc.target = '_blank'; doc.rel = 'noopener'; hooks.append(doc);
      $('#bk-connections').replaceChildren(cal, feed, mail, hooks);
    }
    $('#bk-hook-form').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget, submit = form.querySelector('button'); submit.disabled = true;
      try {
        const result = await api('booking-webhook-add', { ...Object.fromEntries(new FormData(form)), host });
        form.reset(); $('#bk-add-hook').open = false; await load();
        $('#bk-hook-secret code').textContent = result.signingKey; $('#bk-hook-secret').hidden = false;
      } catch (err) { status(err.message, true); } finally { submit.disabled = false; }
    };
    function hideSecret() { $('#bk-hook-secret code').textContent = ''; $('#bk-hook-secret').hidden = true; }
    $('#bk-hook-done').onclick = hideSecret;
    function fillSettings() {
      const p = data.policy;
      form.elements.published.checked = p.published;
      zones(form.elements.zone, p.zone);
      for (const k of ['name', 'email', 'buffer', 'notice', 'horizon', 'location', 'question']) form.elements[k].value = p[k];
      for (const key of ['appointment', 'demo']) form.elements[key].value = p.durations[key];
      form.elements.daysOff.value = p.daysOff.join(', ');
      for (const row of form.querySelectorAll('[data-bk-day]')) {
        const hours = p.hours[Number(row.dataset.bkDay)], [enabled, start, end] = row.querySelectorAll('input');
        enabled.checked = Boolean(hours); start.value = hours?.[0] || '09:00'; end.value = hours?.[1] || '17:00';
        enabled.onchange = () => { start.disabled = end.disabled = !enabled.checked; };
        enabled.onchange();
      }
    }
    function entry(row, zone) {
      const el = node('article', undefined, 'bk-entry'), details = node('details'), content = node('div', undefined, 'bk-entry-body');
      const date = dateKey(row.start, zone);
      const summary = node('summary');
      summary.append(node('span', fmtDate(date, { month: 'short', day: 'numeric' }) + ' · ' + clock(row.start, zone), 'bk-entry-time'),
        node('strong', row.title + ' · ' + row.client.name));
      if (row.status === 'cancelled') summary.append(node('small', 'Cancelled'));
      details.append(summary);
      const email = link(row.client.email, 'mailto:' + row.client.email); email.className = 'bk-text';
      content.append(email);
      for (const value of [row.client.company, row.client.phone, row.client.notes, row.answer && row.question + ' ' + row.answer, row.location]) {
        if (value) content.append(node('p', value));
      }
      const channelNames = { clientEmail: 'Client email', repEmail: 'Rep email' };
      for (const [channel, state] of Object.entries(row.delivery)) {
        const label = channelNames[channel] || (channel.startsWith('calendar:') ? 'Connected calendar' : channel.slice(8));
        content.append(node('small', label + ' · ' + (labels[state] || state)));
      }
      const manage = link('Manage appointment', row.manageURL); manage.target = '_blank'; manage.rel = 'noopener'; content.append(manage);
      if (Object.entries(row.delivery).some(([c, s]) => s === 'failed' && (c.startsWith('calendar:') || c.startsWith('webhook:')))) {
        content.append(button('Retry sync', safe(async () => { await api('booking-retry', { host, id: row.id }); await load(); })));
      }
      details.append(content); el.append(details);
      return el;
    }
    function agenda() {
      const zone = data.policy.zone, today = dateKey(data.now, zone), counts = {};
      for (const row of data.entries) if (row.status === 'confirmed') {
        const key = dateKey(row.start, zone);
        counts[key] = (counts[key] || 0) + 1;
      }
      renderMonth('bk-rep-month', { month, selected, today, counts, min: dateKey(data.now - 365 * 86400000, zone).slice(0, 7),
        max: dateKey(data.now + 180 * 86400000, zone).slice(0, 7), onMonth: next => { month = next; selected = next + '-01'; agenda(); },
        onDay: d => { selected = d; agenda(); $('[data-day="' + d + '"]', panel).focus(); } });
      const rows = data.entries.filter(row => selected ? dateKey(row.start, zone) === selected : row.start >= data.now && row.status === 'confirmed');
      $('#bk-agenda-title').textContent = selected ? fmtDate(selected, { weekday: 'short', month: 'long', day: 'numeric' }) : 'Upcoming appointments';
      $('#bk-agenda').replaceChildren(...(rows.length ? rows.map(row => entry(row, zone)) :
        [node('p', selected ? 'No appointments on this date.' : 'No upcoming appointments.', 'bk-empty')]));
    }
    function render() {
      select.replaceChildren(...data.hosts.map(h => new Option(h.name + (h.active ? '' : ' (inactive)'), h.id)));
      select.value = host; select.closest('label').hidden = data.hosts.length < 2;
      if (!month) month = dateKey(data.now, data.policy.zone).slice(0, 7);
      const publicLink = $('#bk-public-link'), accepts = data.policy.active && data.policy.published;
      publicLink.href = accepts ? data.shareURL : '/book'; publicLink.textContent = accepts ? 'Open booking page ↗' : 'Open team booking page ↗';
      $('#bk-copy').disabled = !accepts;
      $('#bk-share-hint').textContent = !accepts ? 'Enable client bookings in Availability to share this rep’s link.' :
        location.protocol === 'http:' ? 'This link opens on this Mac. Sharing with clients requires the workspace’s HTTPS address.' : 'Clients can choose a meeting and book directly with this rep.';
      fillSettings(); renderConnections(); agenda(); showView(view);
    }
    async function load() {
      const current = ++serial;
      try {
        status('Loading calendar…'); panel.setAttribute('aria-busy', 'true');
        const result = await api('booking-dashboard', { host });
        if (current !== serial) return;
        host = result.host; data = result; render(); status();
      } catch (err) { if (current === serial) status(err.message, true); }
      finally { if (current === serial) panel.removeAttribute('aria-busy'); }
    }
    form.onsubmit = async event => {
      event.preventDefault();
      if (!data || data.host !== host) return;
      const submit = form.querySelector('button[type=submit]'); submit.disabled = true;
      try {
        const fields = Object.fromEntries(new FormData(form));
        const hours = [...form.querySelectorAll('[data-bk-day]')].map(row => {
          const [enabled, start, end] = row.querySelectorAll('input');
          return enabled.checked ? [start.value, end.value] : null;
        });
        await api('booking-settings', { ...fields, host, revision: data.policy.revision, published: form.elements.published.checked,
          hours, daysOff: fields.daysOff.split(/[,\s]+/).filter(Boolean), durations: { appointment: Number(fields.appointment), demo: Number(fields.demo) },
          notice: Number(fields.notice), horizon: Number(fields.horizon), buffer: Number(fields.buffer) });
        await load(); status('Availability saved.');
      } catch (err) { status(err.message, true); } finally { submit.disabled = false; }
    };
    select.onchange = () => { hideSecret(); host = select.value; month = selected = null; load(); };
    $('#bk-refresh').onclick = load;
    $('#bk-copy').onclick = () => copy(data.shareURL, status);
    $('#bk-upcoming').onclick = () => { selected = null; month = dateKey(data.now, data.policy.zone).slice(0, 7); agenda(); };
    window.addEventListener('focus', () => { if (account && !panel.hidden && view === 'agenda') load(); });
    return { show(user, section) {
      hideSecret();
      if (user.id !== account?.id) { host = user.id; month = selected = null; view = 'agenda'; }
      if (section === 'connections') view = 'connect';
      account = user; load();
    } };
  }
  window.SdrBookings = { mount };
})();
