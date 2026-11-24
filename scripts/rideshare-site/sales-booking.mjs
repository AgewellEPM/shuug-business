import { escape } from './layout.mjs';

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const button = (id, label, primary = false) => `<button type="button" id="${id}" class="bk-button${primary ? ' bk-primary' : ''}">${label}</button>`;
const zoneField = id => `<label>Time zone<select id="${id}" name="zone" required></select></label>`;
function monthGrid(id) {
  return `<section class="bk-month" aria-labelledby="${id}-title"><div class="bk-month-head">
    <h3 id="${id}-title"></h3><div class="bk-month-arrows">
      <button type="button" data-prev aria-label="Previous month">‹</button><button type="button" data-next aria-label="Next month">›</button>
    </div></div><div class="bk-week" aria-hidden="true">${weekdays.map(d => '<span>' + d.slice(0, 2) + '</span>').join('')}</div>
    <div class="bk-dates" id="${id}-days" role="group" aria-labelledby="${id}-title"></div></section>`;
}
export function bookingOverview(icon) {
  return `<section class="sdr-card bk-overview"><div class="bk-overview-mark">${icon('calendar')}</div><div><h2>Appointments &amp; demos</h2>
  <p id="bk-overview-next">View your schedule and share your booking page.</p></div><button type="button" class="bk-button" data-overview-action="calendar">Open calendar ${icon('arrow')}</button></section>`;
}
const durationOptions = '<option value="0">Off</option>' + Array.from({ length: 12 }, (_, i) => '<option value="' + (i + 1) * 15 + '">' + (i + 1) * 15 + ' minutes</option>').join('');
export function bookingPanel() {
  return `<section data-tab-panel="calendar" hidden aria-label="Booking calendar" class="bk-staff">
  <header class="bk-hero"><div><h2>Booking calendar</h2><p>Appointments and product demos with your sales team.</p></div></header>
  <div class="bk-toolbar"><div class="bk-tabs" role="group" aria-label="Calendar views">
    <button type="button" data-bk-view="agenda" aria-pressed="true">Schedule</button>
    <button type="button" data-bk-view="hours" aria-pressed="false">Availability</button>
    <button type="button" data-bk-view="connect" aria-pressed="false">Connections</button>
  </div><label class="bk-rep-picker">Calendar<select id="bk-staff-host" aria-label="Sales rep calendar"></select></label></div>
  <p id="bk-staff-status" class="bk-status" role="status"></p>
  <div data-bk-pane="agenda"><div class="bk-staff-grid"><div class="bk-card">
    ${monthGrid('bk-rep-month')}<button type="button" class="bk-text" id="bk-upcoming">Show upcoming appointments</button>
  </div><section class="bk-card" aria-labelledby="bk-agenda-title">
    <div class="bk-agenda-head"><h3 id="bk-agenda-title">Upcoming appointments</h3>${button('bk-refresh', 'Refresh')}</div>
    <div id="bk-agenda" aria-live="polite"></div></section></div>
    <section class="bk-card bk-sharing"><div><h3>Your booking page</h3><p id="bk-share-hint"></p></div>
    <div class="bk-actions"><a class="bk-button" id="bk-public-link" href="/book" target="_blank" rel="noopener">Open booking page ↗</a>
    ${button('bk-copy', 'Copy booking link', true)}</div></section></div>
  <section class="bk-card" data-bk-pane="hours" hidden><h3>Rep availability</h3>
    <form id="bk-settings" class="bk-form"><label class="bk-check"><input type="checkbox" name="published"> Accept client bookings</label>
    <div class="bk-fields"><label>Public rep name<input name="name" maxlength="120" required></label>
    <label>Booking notification email<input name="email" type="email" maxlength="240"></label>${zoneField('bk-staff-zone')}
    <label>Sales appointment<select name="appointment">${durationOptions}</select></label><label>Product demo<select name="demo">${durationOptions}</select></label>
    <label>Time between meetings (minutes)<input type="number" name="buffer" min="0" max="120" step="5" required></label>
    <label>Minimum notice (hours)<input type="number" name="notice" min="0" max="168" required></label>
    <label>Booking window (days)<input type="number" name="horizon" min="1" max="180" required></label></div>
    <fieldset class="bk-hours"><legend>Weekly hours</legend>${weekdays.map((d, i) => `<div data-bk-day="${i}"><label class="bk-check"><input type="checkbox"> ${d}</label>
      <input type="time" aria-label="${d} opening time" step="900"><span>to</span><input type="time" aria-label="${d} closing time" step="900"></div>`).join('')}</fieldset>
    <label>Dates off <small>Enter dates as YYYY-MM-DD, separated by commas.</small><textarea name="daysOff" rows="2"></textarea></label>
    <label>Meeting location or video link <small>Shown after booking.</small><input name="location" maxlength="600"></label>
    <label>Additional question for clients <small>Optional</small><input name="question" maxlength="180" placeholder="What would you like us to cover?"></label>
    <button type="submit" class="bk-button bk-primary">Save availability</button></form></section>
  <section class="bk-card" data-bk-pane="connect" hidden><h3>Calendar, email &amp; API connections</h3><div id="bk-connections"></div>
    <details id="bk-add-hook"><summary>Add an API connection</summary><form id="bk-hook-form" class="bk-form">
    <div class="bk-fields"><label>Connection name<input name="name" required maxlength="50" placeholder="CRM"></label>
    <label>Send bookings from<select name="scope"><option value="rep">This rep</option><option value="workspace">Entire workspace</option></select></label></div>
    <label>Webhook URL<input type="url" name="url" required maxlength="1800" placeholder="https://"></label>
    <label>API bearer token <small>Optional, if your endpoint requires one.</small><input type="password" name="bearer" autocomplete="off" maxlength="1500"></label>
    <p>This endpoint will receive client contact details and intake answers when appointments are created, rescheduled or cancelled.</p>
    <button class="bk-button bk-primary" type="submit">Connect endpoint</button></form></details>
    <div id="bk-hook-secret" class="bk-hook-secret" hidden><strong>Webhook signing secret</strong><p>Copy this secret into your receiving service. It is shown once.</p>
    <code></code>${button('bk-hook-done', 'Done')}</div></section></section>`;
}

function publicFrame(name, title, main, script) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${title} | TinkyTown</title>
    <link rel="stylesheet" href="/sales-booking.css">${script ? `<script defer src="/booking-ui.js"></script><script defer src="/${script}"></script>` : ''}</head>
    <body class="bk-public"><a class="bk-skip" href="#booking-main">Skip to booking</a><header class="bk-brandbar">
    <a class="bk-brand" href="/book"><span aria-hidden="true">🚂</span><span><strong>TinkyTown</strong><small>${escape(name)}</small></span></a></header>
    <main id="booking-main">${main}</main></body></html>`;
}
export function clientBookingPage(name) {
  return publicFrame(name, 'Book a meeting', `<header class="bk-hero"><div><h1 id="bk-title">Book a meeting</h1>
    <p id="bk-intro">Choose a sales rep and a time for your appointment or product demo.</p></div></header>
    <p id="bk-message" class="bk-status" role="status" aria-live="polite">Loading booking calendar…</p>
    <div id="bk-picker" class="bk-public-grid" hidden><aside class="bk-sidebar bk-form"><h2>Meeting details</h2>
      <label>Sales rep<select id="bk-rep"></select></label><fieldset id="bk-types"><legend>Meeting type</legend><div></div></fieldset>
      ${zoneField('bk-zone')}</aside><div class="bk-picker-body"><section id="bk-choose"><h2>Choose a date and time</h2>
      <div class="bk-pick-grid">${monthGrid('bk-client-month')}<section class="bk-times" aria-labelledby="bk-times-title">
        <h3 id="bk-times-title">Available times</h3><div id="bk-times" aria-live="polite"></div></section></div></section>
      <section id="bk-details" hidden><button class="bk-text" type="button" id="bk-back">‹ Change time</button><h2>Your details</h2>
      <p id="bk-selected-time"></p><form id="bk-intake" class="bk-form"><div class="bk-fields">
        <label>Your name<input name="name" required maxlength="120" autocomplete="name"></label>
        <label>Email address<input name="email" type="email" required maxlength="240" autocomplete="email"></label>
        <label>Organization <small>Optional</small><input name="company" maxlength="140" autocomplete="organization"></label>
        <label>Phone <small>Optional</small><input name="phone" type="tel" maxlength="48" autocomplete="tel"></label></div>
        <label id="bk-question" hidden><span></span><textarea name="answer" maxlength="800" rows="2"></textarea></label>
        <label>Anything else we should know? <small>Optional</small><textarea name="notes" maxlength="1600" rows="3"></textarea></label>
        <button type="submit" class="bk-button bk-primary">Confirm booking</button></form></section></div></div>
    <section id="bk-receipt" class="bk-card bk-receipt" hidden><h2 tabindex="-1" id="bk-receipt-title"></h2>
      <div id="bk-receipt-info"></div><div class="bk-actions" id="bk-receipt-actions"></div></section>
    <noscript>Enable JavaScript to see available times and book an appointment.</noscript>`, 'booking-client.js');
}
export function connectionPage(name) {
  return publicFrame(name, 'Connect your calendar', `<section class="bk-card"><h1>Connect your calendar</h1>
    <p id="bk-oauth-status" role="status">Finishing your calendar connection…</p><a class="bk-button" href="/sales#view=calendar">Return to calendar</a></section>`, 'booking-connect.js');
}
export function bookingAPIGuide(name) {
  return publicFrame(name, 'Booking integrations', `<article class="bk-card bk-guide"><h1>Booking integrations</h1>
    <h2>Read availability</h2><p><code>GET /api/booking/hosts</code> returns published reps, meeting types, durations in minutes and the server time.
    Send the selected rep ID, type, month and IANA time zone to the slots endpoint.</p>
    <pre>GET /api/booking/slots?host=owner&amp;type=demo&amp;month=2027-01&amp;zone=America%2FNew_York</pre>
    <p>The <code>days</code> object maps local dates to available start times in Unix milliseconds.</p>
    <h2>Create and manage appointments</h2><p>POST JSON to <code>/api/booking</code>. Use a fresh random UUID v4 per booking attempt and reuse it when retrying the same request.</p>
    <pre>{
  "action": "book", "requestId": "&lt;UUID v4&gt;",
  "host": "&lt;rep ID&gt;", "type": "demo",
  "start": &lt;number returned by slots&gt;, "zone": "America/New_York",
  "name": "Client name", "email": "client@example.com",
  "company": "", "phone": "", "notes": "", "answer": ""
}</pre><p>A confirmation includes the appointment, its revision, calendar file and a private management URL. Give this URL only to the client.
    Use its <code>manage</code> fragment value as <code>token</code> in subsequent JSON requests.
    Use <code>action: "read"</code> to retrieve the booking, <code>"slots"</code> with month and zone to choose a new time,
    <code>"reschedule"</code> with start, zone and current revision, or <code>"cancel"</code> with the current revision.
    HTTP 409 means the time or revision changed. Refresh availability before submitting a different time.</p>
    <h2>Send events to another API</h2><p>In Calendar → Connections, choose <strong>Add an API connection</strong>. Enter the receiving HTTPS endpoint and optional bearer token.
    Copy the signing secret to your receiving service. Reps can connect their own bookings. The owner can connect the whole workspace.
    For server-managed destinations, set <code>SDR_BOOKING_WEBHOOKS</code> to a JSON array and restart. Each destination receives client contact and intake details.
    Use a distinct signing secret of at least 32 characters for each server-managed endpoint.</p>
    <pre>[{"name":"crm","url":"https://your-service.example/appointments","secret":"&lt;your signing secret&gt;"}]</pre>
    <p>Events are <code>booking.created</code>, <code>booking.rescheduled</code> and <code>booking.cancelled</code>.
    The payload includes an event ID, UTC occurrence time, booking ID, revision, meeting times, rep ID and client details.
    Verify <code>X-Booking-Signature</code> against <code>sha256=</code> plus the lowercase hex HMAC-SHA256 of
    <code>X-Booking-Timestamp + "." + rawRequestBody</code>. Check the timestamp against your clock.
    Deduplicate using <code>X-Booking-ID</code> and apply the latest revision. A 2xx response acknowledges the event.
    Failed deliveries retry with increasing delays. Reps can review and retry failed syncs in their schedule.</p>
    <a class="bk-button" href="/sales#view=calendar&amp;section=connections">Calendar connections</a></article>`);
}
