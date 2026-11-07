(() => {
  'use strict';
  function coordinates(card) {
    const latitudeText = card.dataset.officeLatitude, longitudeText = card.dataset.officeLongitude;
    if (!latitudeText?.trim() || !longitudeText?.trim()) return null;
    const latitude = Number(latitudeText), longitude = Number(longitudeText);
    if (!Number.isFinite(latitude) || latitude < -85 || latitude > 85 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
    return { latitude, longitude };
  }
  function urls({ latitude, longitude }) {
    const number = value => Number(value.toFixed(6)).toString();
    const lat = number(latitude), lon = number(longitude);
    const link = new URL('https://www.openstreetmap.org/');
    link.searchParams.set('mlat', lat); link.searchParams.set('mlon', lon); link.hash = `map=16/${lat}/${lon}`;
    const embed = new URL('https://www.openstreetmap.org/export/embed.html');
    embed.searchParams.set('bbox', [Math.max(-180, longitude - .016), Math.max(-85.051128, latitude - .008),
      Math.min(180, longitude + .016), Math.min(85.051128, latitude + .008)].map(number).join(','));
    embed.searchParams.set('layer', 'mapnik'); embed.searchParams.set('marker', `${lat},${lon}`);
    return { link: link.href, embed: embed.href };
  }
  function initialize() {
    for (const section of document.querySelectorAll('[data-office-map]')) {
      if (section.dataset.officeMapReady) continue;
      section.dataset.officeMapReady = 'true';
      const controls = section.querySelector('[data-office-controls]'), select = section.querySelector('[data-office-select]');
      const canvas = section.querySelector('[data-office-canvas]'), load = section.querySelector('[data-office-load]');
      const hide = section.querySelector('[data-office-hide]'), link = section.querySelector('[data-office-map-link]');
      const status = section.querySelector('[data-office-status]');
      if (!controls || !select || !canvas || !load || !hide || !link || !status) continue;
      const cards = [...section.querySelectorAll('[data-office-id]')];
      const selected = () => {
        const card = cards.find(card => card.dataset.officeId === select.value), point = card && coordinates(card);
        return point ? { name: card.dataset.officeName || 'Selected office', ...urls(point) } : null;
      };
      const close = (message = 'The map is off. Office addresses and map links remain available.') => {
        const placeholder = document.createElement('p'); placeholder.textContent = message;
        canvas.replaceChildren(placeholder); hide.hidden = true;
      };
      const choose = () => {
        close(); status.textContent = '';
        const office = selected(); load.disabled = !office;
        if (office) { link.href = office.link; link.textContent = `Open ${office.name} in OpenStreetMap ↗`; }
        else status.textContent = 'This office’s map coordinates need review. Use its published address.';
      };
      select.addEventListener('change', choose);
      hide.addEventListener('click', () => { close(); status.textContent = 'Map closed.'; load.focus(); });
      load.addEventListener('click', () => {
        const office = selected();
        if (!office) { close(); status.textContent = 'This office’s map coordinates need review. Use its published address.'; return; }
        const frame = document.createElement('iframe'); frame.title = `OpenStreetMap showing ${office.name}`;
        frame.src = office.embed; frame.loading = 'lazy'; frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        frame.setAttribute('allow', 'geolocation \'none\'');
        canvas.replaceChildren(frame); hide.hidden = false;
        status.textContent = `Map requested for ${office.name}. If it does not appear, use the OpenStreetMap link.`;
      });
      controls.hidden = false; choose();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
