(() => {
  'use strict';
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const field = (name, label, value, extra = '') => `<label>${label}<input name="${name}" value="${e(value)}" ${extra}></label>`;
  function contactFields(value) {
    return field('phone', 'Public help number', value.phone, 'type="tel" maxlength="40"') +
      field('hours', 'Phone / office hours, including time zone', value.hours, 'maxlength="240"') +
      field('appointmentURL', 'Appointment booking link', value.appointmentURL, 'type="url" placeholder="https://…" maxlength="1200"') +
      `<label class="sales-check"><input name="available24x7" type="checkbox" ${value.available24x7 ? 'checked' : ''}>Show phone help as available 24/7</label>` +
      '<label class="sales-check"><input name="coverageConfirmed" type="checkbox">If selected above, I confirm this number is staffed 24 hours a day, every day.</label>';
  }
  function input(form) {
    const values = Object.fromEntries(new FormData(form));
    for (const name of ['enabled', 'available24x7', 'coverageConfirmed', 'publicDetailsConfirmed']) values[name] = values[name] === 'on';
    return values;
  }
  function submit(form, work, status) {
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try { await work(input(form)); } catch (error) { status(error.message, true); }
      finally { if (button.isConnected) button.disabled = false; }
    };
  }
  window.GigTaxDirectory = {
    async support({ api, status }) {
      const result = await api('directory-settings');
      let panel = document.querySelector('#directory-support');
      if (!panel) { panel = document.createElement('section'); panel.id = 'directory-support'; panel.className = 'sales-panel'; document.querySelector('[data-tab-panel="team"]').append(panel); }
      panel.innerHTML = '<h2>App help & appointments</h2><p>These public contact details appear in the app. Leave a field blank until it is ready. Office-specific details are managed on each office record.</p>' +
        `<form id="directory-support-form" class="sales-form">${contactFields(result.support || {})}<button type="submit" class="button primary">Save app help details</button></form>`;
      submit(panel.querySelector('form'), async values => {
        await api('save-directory-support', values); status('Public help details saved. The app will receive them on its next refresh.');
      }, status);
    },
    office({ office, info, api, status, refresh }) {
      const saved = info.publicListing || {}, value = { name: office.town, address: info.address, city: office.locality, state: office.state, postalCode: info.postalCode, phone: office.contact_phone, ...saved };
      const panel = document.createElement('section'); panel.className = 'sales-panel'; panel.id = 'directory-listing';
      panel.innerHTML = '<h3>App map listing</h3><p>Prepare the public listing now. It appears in the app when this office has an active, paid enrollment and confirmed independent ownership. Uncheck the listing to remove it from the next refresh.</p>' +
        `<form id="directory-listing-form" class="sales-form"><label class="sales-check"><input type="checkbox" name="enabled" ${saved.enabled ? 'checked' : ''}>Show in the app when enrollment is active</label>` +
        field('name', 'Public office name', value.name, 'maxlength="180"') + field('address', 'Street address', value.address, 'maxlength="300"') +
        field('city', 'City', value.city, 'maxlength="100"') + field('state', 'State abbreviation', value.state, 'maxlength="2"') +
        field('postalCode', 'ZIP code', value.postalCode, 'maxlength="10"') +
        `<a href="https://maps.apple.com/?q=${encodeURIComponent([value.address, value.city, value.state].join(', '))}" target="_blank" rel="noopener noreferrer">Check the office in Apple Maps ↗</a>` +
        '<p>Use the office entrance’s confirmed map coordinates. Do not use a city center or a guessed position.</p>' +
        field('latitude', 'Latitude', value.latitude, 'type="number" step="any" min="-90" max="90"') +
        field('longitude', 'Longitude', value.longitude, 'type="number" step="any" min="-180" max="180"') +
        field('exteriorImageURL', 'Office exterior photo link', value.exteriorImageURL, 'type="url" placeholder="https://…" maxlength="1200"') +
        '<p>Add a clear photo of this office’s entrance so clients can recognize it when they arrive.</p>' + contactFields(value) +
        '<label class="sales-check"><input type="checkbox" name="publicDetailsConfirmed">I verified this office’s address, map position and exterior photo, and these details are approved for the public app.</label>' +
        '<button type="submit" class="button primary">Save app map listing</button></form>';
      document.querySelector('#sales-detail').append(panel);
      submit(panel.querySelector('form'), async values => {
        await api('save-office-listing', { id: office.id, ...values }); await refresh();
        status(values.enabled ? 'Listing saved. It becomes visible when enrollment is active; the app refreshes it automatically.' : 'Listing removed from the app directory.');
      }, status);
    },
  };
})();
