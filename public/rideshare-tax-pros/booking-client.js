(() => {
  'use strict';
  const { $, node, button, link, dateKey, fmtDate, clock, when, zones, renderMonth, request, download, copy } = window.TinkyBooking;
  const api = body => request('/api/booking', body), picker = $('#bk-picker'), receipt = $('#bk-receipt'), form = $('#bk-intake');
  const query = new URLSearchParams(location.search), requestedRep = query.get('rep'), requestedType = query.get('type');
  let token = new URLSearchParams(location.hash.slice(1)).get('manage'), existing, moving = false;
  let hosts = [], types, host, type, zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', now = Date.now();
  let month, selected, days = {}, chosen, serial = 0, requestId, loaded = false;
  function status(message = '', error = false) {
    $('#bk-message').textContent = message;
    $('#bk-message').dataset.error = String(error);
  }
  function chooseType() {
    const active = hosts.find(item => item.id === host);
    const available = Object.entries(active.durations).filter(([key, value]) => value > 0 && (moving || !requestedType || key === requestedType));
    if (!active.durations[type]) type = available[0][0];
    $('#bk-types div').replaceChildren(...available.map(([key, duration]) => {
      const label = node('label', undefined, 'bk-type'), radio = node('input');
      radio.type = 'radio'; radio.name = 'meeting-type'; radio.value = key; radio.checked = key === type; radio.disabled = moving;
      radio.onchange = () => { type = key; loadMonth(true); };
      label.append(radio, node('span', types[key]), node('small', duration + ' min'));
      return label;
    }));
    $('#bk-question').hidden = !active.question;
    $('#bk-question span').textContent = active.question;
  }
  function showTimes() {
    $('#bk-times-title').textContent = selected ? fmtDate(selected, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Available times';
    const times = days[selected] || [];
    $('#bk-times').replaceChildren(...(times.length ? times.map(start => {
      const el = button(clock(start, zone), () => selectTime(start), 'bk-time');
      el.dataset.start = start;
      return el;
    }) : [node('p', loaded ? 'No openings this month. Try another month or rep.' : 'Checking availability…')]));
  }
  function draw() {
    const rep = hosts.find(item => item.id === host);
    renderMonth('bk-client-month', { month, selected, today: dateKey(now, zone), counts: Object.fromEntries(Object.entries(days).map(([d, times]) => [d, times.length])),
      availableOnly: true, min: dateKey(now, zone).slice(0, 7), max: dateKey(now + rep.horizon * 86400000, zone).slice(0, 7),
      onMonth: next => { month = next; loadMonth(false); }, onDay: d => { selected = d; draw(); $('[data-day="' + d + '"]').focus(); } });
    showTimes();
  }
  async function loadMonth(reset) {
    const current = ++serial;
    if (reset || !month) month = dateKey(now, zone).slice(0, 7);
    chosen = null; requestId = null; days = {}; selected = null; loaded = false;
    $('#bk-choose').hidden = false; $('#bk-details').hidden = true; status('Checking availability…'); draw();
    try {
      const input = { host, type, month, zone };
      const data = moving ? await api({ action: 'slots', token, ...input }) : await request('/api/booking/slots?' + new URLSearchParams(input));
      if (current !== serial) return;
      days = data.days; selected = Object.keys(days)[0] || null; loaded = true;
      draw(); status();
    } catch (err) {
      if (current !== serial) return;
      $('#bk-times').replaceChildren(button('Try again', () => loadMonth(false)));
      status(err.message, true);
    }
  }
  function selectTime(start) {
    chosen = start; requestId = crypto.randomUUID();
    $('#bk-selected-time').textContent = types[type] + ' · ' + when(start, zone);
    $('#bk-choose').hidden = true; $('#bk-details').hidden = false;
    $('#bk-details h2').textContent = moving ? 'Confirm new time' : 'Your details';
    form.querySelector('.bk-fields').hidden = moving;
    $('#bk-question').hidden = moving || !hosts.find(h => h.id === host).question;
    form.elements.notes.closest('label').hidden = moving;
    for (const field of form.querySelectorAll('input,textarea')) field.disabled = moving;
    form.querySelector('button').textContent = moving ? 'Confirm new time' : 'Confirm booking';
    (moving ? form.querySelector('button') : form.elements.name).focus();
  }
  function startPicker() {
    serial++;
    picker.hidden = false; receipt.hidden = true;
    $('#bk-title').textContent = moving ? 'Reschedule your meeting' : requestedType === 'demo' ? 'Schedule a product demo' : 'Book a meeting';
    $('#bk-intro').textContent = moving ? 'Choose a new time with ' + existing.hostName + '.' : requestedType === 'demo' ? 'Choose your sales agent and a time for your demo.' : 'Choose a sales rep and a time for your appointment or product demo.';
    $('#bk-rep').replaceChildren(...hosts.map(rep => new Option(rep.name, rep.id)));
    $('#bk-rep').value = host; $('#bk-rep').disabled = moving;
    zones($('#bk-zone'), zone); chooseType();
    if (moving) month = dateKey(Math.max(now, existing.start), zone).slice(0, 7);
    loadMonth(!moving);
  }
  function display(data) {
    serial++; moving = false; existing = data.booking; token = new URL(existing.manageURL).hash.slice('#manage='.length);
    history.replaceState(null, '', '/book#manage=' + token);
    picker.hidden = true; receipt.hidden = false; status();
    const row = existing, confirmed = row.status === 'confirmed';
    $('#bk-title').textContent = 'Your meeting';
    $('#bk-intro').textContent = 'TinkyTown appointments and product demos';
    $('#bk-receipt-title').textContent = confirmed ? 'Booking confirmed' : 'Booking cancelled';
    const info = $('#bk-receipt-info');
    info.replaceChildren(node('h3', row.title + ' with ' + row.hostName), node('p', when(row.start, row.zone) + ' · ' + (row.end - row.start) / 60000 + ' minutes'));
    if (confirmed && row.location) {
      let url;
      try { const u = new URL(row.location); if (u.protocol === 'https:' && !u.username && !u.password) url = u.href; } catch {}
      info.append(url ? link('Join meeting', url) : node('p', row.location));
    }
    if (confirmed) info.append(node('p', 'Save your private booking link to return here.'));
    if (data.email === 'delivered') info.append(node('p', 'Confirmation email delivered to ' + row.client.email + '.'));
    else if (data.email === 'pending' || data.email === 'working') info.append(node('p', 'Confirmation email queued for ' + row.client.email + '.'));
    else if (data.email === 'accepted') info.append(node('p', 'The email provider accepted the confirmation for ' + row.client.email + '.'));
    else if (data.calendarInvite === 'synced') info.append(node('p', 'The rep’s calendar has issued an invitation to ' + row.client.email + '.'));
    else if (confirmed && !data.calendarInvite && data.email === 'unconfigured') info.append(node('p', 'Email confirmations are currently off. You can download this meeting for your calendar.'));
    const actions = $('#bk-receipt-actions');
    actions.replaceChildren(button('Download calendar event', () => download(data.calendar)),
      button('Copy private booking link', () => copy(row.manageURL, status)));
    if (confirmed && row.start > Date.now()) {
      if (hosts.some(h => h.id === row.host && h.durations[row.type])) actions.append(button('Reschedule', () => {
        moving = true; host = row.host; type = row.type; zone = row.zone; startPicker();
      }));
      actions.append(button('Cancel appointment', async event => {
        if (!window.confirm('Cancel this appointment and release the time?')) return;
        event.currentTarget.disabled = true;
        try { display(await api({ action: 'cancel', token, revision: row.revision })); }
        catch (err) { status(err.message, true); actions.querySelector('button:last-child').disabled = false; }
      }, 'bk-text bk-danger'));
    }
    if (!confirmed) actions.append(link('Book another meeting', '/book'));
    $('#bk-receipt-title').focus();
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (!chosen || form.querySelector('button').disabled) return;
    const submit = form.querySelector('button'); submit.disabled = true;
    const fields = Object.fromEntries(new FormData(form));
    try {
      const result = await api(moving ? { action: 'reschedule', token, revision: existing.revision, zone, start: chosen } :
        { ...fields, action: 'book', host, type, start: chosen, requestId, zone });
      display(result);
    } catch (err) {
      if (err.status === 409) {
        await loadMonth(false);
        if (moving) { try { display(await api({ action: 'read', token })); } catch {} }
      } else if (err.status === 400) requestId = crypto.randomUUID();
      status(err.message, true);
    } finally { submit.disabled = false; }
  };
  $('#bk-back').onclick = () => { $('#bk-choose').hidden = false; $('#bk-details').hidden = true; $('[data-day][aria-pressed=true]')?.focus(); };
  $('#bk-rep').onchange = event => { host = event.target.value; chooseType(); loadMonth(true); };
  $('#bk-zone').onchange = event => { zone = event.target.value; loadMonth(true); };
  async function init() {
    const data = await request('/api/booking/hosts');
    hosts = data.hosts; types = data.types; now = data.now;
    if (token) { display(await api({ action: 'read', token })); return; }
    if (requestedType) {
      hosts = hosts.filter(rep => Object.hasOwn(types, requestedType) && rep.durations[requestedType] > 0);
      if (!hosts.length || (requestedRep && !hosts.some(rep => rep.id === requestedRep))) {
        status('No published openings for this meeting type with the selected team or rep.');
        $('#bk-message').append(' ', link('See all booking options', '/book')); return;
      }
      type = requestedType;
    }
    if (!hosts.length) { status('No reps are accepting bookings right now. Please check back or contact your rep.'); return; }
    if (requestedRep && !hosts.some(h => h.id === requestedRep)) {
      status('This rep is no longer accepting bookings.'); $('#bk-message').append(' ', link('Choose another rep', '/book')); return;
    }
    host = requestedRep || hosts[0].id; startPicker();
  }
  init().catch(err => status(err.message, true));
})();
