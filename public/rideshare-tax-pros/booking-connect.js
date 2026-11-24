(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  history.replaceState(null, '', location.pathname);
  const status = document.getElementById('bk-oauth-status');
  async function finish() {
    if (params.get('error') || !params.get('code')) throw new Error('Calendar connection was cancelled. Your sales calendar is available in the workspace.');
    await window.TinkyBooking.request('/api/sales', { action: 'booking-connected', state: params.get('state'), code: params.get('code') });
    location.replace('/sales#view=calendar&section=connections');
  }
  finish().catch(error => { status.textContent = error.message; });
})();
