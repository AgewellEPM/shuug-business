(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  function node(tag, value, className) {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  function button(label, act, className = 'bk-button') {
    const el = node('button', label, className);
    el.type = 'button';
    el.addEventListener('click', act);
    return el;
  }
  function link(label, href) {
    const a = node('a', label, 'bk-button');
    a.href = href;
    return a;
  }
  const number = n => String(n).padStart(2, '0');
  const dateKey = (ms, zone) => new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  function shiftMonth(month, delta) {
    const date = new Date(month + '-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + delta);
    return date.toISOString().slice(0, 7);
  }
  const fmtDate = (date, options) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  const clock = (ms, zone) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: zone }).format(ms);
  const when = (ms, zone) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: zone }).format(ms);
  function zones(select, selected) {
    const names = new Set([selected, Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC',
      ...(Intl.supportedValuesOf?.('timeZone') || ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London'])]);
    select.replaceChildren(...[...names].filter(Boolean).sort().map(z => new Option(z.replaceAll('_', ' '), z)));
    select.value = selected;
  }
  function renderMonth(id, { month, selected, today, counts, availableOnly = false, min, max, onMonth, onDay }) {
    const title = $('#' + id + '-title'), box = title.closest('.bk-month'), days = $('#' + id + '-days');
    title.textContent = fmtDate(month + '-01', { month: 'long', year: 'numeric' });
    const prev = $('[data-prev]', box), next = $('[data-next]', box);
    prev.disabled = month <= min;
    next.disabled = month >= max;
    prev.onclick = () => onMonth(shiftMonth(month, -1));
    next.onclick = () => onMonth(shiftMonth(month, 1));
    const start = new Date(month + '-01T12:00:00Z'), limit = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Array.from({ length: start.getUTCDay() }, () => node('span'));
    for (let n = 1; n <= limit; n++) {
      const date = month + '-' + number(n), amount = counts[date] || 0;
      const cell = button(n, () => onDay(date), 'bk-date');
      cell.dataset.day = date;
      cell.disabled = availableOnly && !amount;
      cell.setAttribute('aria-pressed', String(date === selected));
      if (date === today) cell.setAttribute('aria-current', 'date');
      if (amount) cell.dataset.marked = 'true';
      cell.setAttribute('aria-label', fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) +
        (amount ? ', ' + amount + (availableOnly ? ' available times' : ' appointments') : ''));
      cells.push(cell);
    }
    days.replaceChildren(...cells);
  }
  async function request(path, body) {
    const response = await fetch(path, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'The request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function download(ics) {
    const a = link('Download calendar event', URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })));
    a.download = 'tinkytown-appointment.ics';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copy(value, status) {
    try { await navigator.clipboard.writeText(value); status('Link copied.'); }
    catch { window.prompt('Copy this link', value); }
  }
  window.TinkyBooking = { $, node, button, link, dateKey, shiftMonth, fmtDate, clock, when, zones, renderMonth, request, download, copy };
})();
