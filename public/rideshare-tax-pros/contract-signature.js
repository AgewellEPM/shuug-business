(() => {
  'use strict';
  window.GigTaxSignature = {
    mount() {
      const $ = selector => document.querySelector(selector), form = $('#signup-form');
      if (!form) return;
      const params = new URLSearchParams(location.hash.slice(1)), invitation = { id: params.get('id'), token: params.get('token') };
      history.replaceState(null, '', location.pathname);
      let view, receipt;
      const status = (message, error = false) => { $('#signup-message').textContent = message; $('#signup-message').dataset.error = String(error); };
      async function api(action, body = {}) {
        const response = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...body, action }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The contract request was not confirmed.'); return result;
      }
      function signed(result) {
        receipt = result; form.hidden = true; $('#signup-receipt').hidden = false; $('#signup-pending').hidden = result.active;
        $('#signup-receipt h3').textContent = result.active ? 'Your office membership is active' : 'Your agreement is signed';
        $('#signup-receipt-text').textContent = `${result.office} · Signed by ${result.signature} · ${new Date(result.acceptedAt).toLocaleString()} · Receipt ${result.receipt}`;
        $('#signup-pending h3').textContent = 'Membership activation';
        $('#signup-pending p').textContent = view.paymentsConfigured ? 'Your agreement is recorded. The $500 initial payment must be verified before membership activates.' : 'Your agreement is recorded. Payments remain pending; no charge was made and membership has not activated.';
        $('#signup-start-checkout').disabled = !view.paymentsConfigured;
        $('#signup-check-payment').hidden = !view.checkoutPending && params.get('payment') !== 'return';
        $('#signup-check-payment').disabled = !view.paymentsConfigured;
        form.elements.signature.value = result.signature;
        status(result.active ? 'Paid membership is active.' : 'Agreement signed. Download your copy below. Payment and membership activation remain separate.');
      }
      const run = work => async event => { event?.preventDefault(); const buttons = [...document.querySelectorAll('button')].map(button => ({ button, disabled: button.disabled })); buttons.forEach(({ button }) => button.disabled = true); try { await work(); } catch (error) { status(error.message, true); } finally { buttons.forEach(({ button, disabled }) => button.disabled = disabled); if (receipt) { $('#signup-start-checkout').disabled = !view.paymentsConfigured; $('#signup-check-payment').disabled = !view.paymentsConfigured; } } };
      form.onsubmit = run(async () => {
        const input = Object.fromEntries(new FormData(form));
        signed(await api('signup-sign', { ...invitation, ...input, accepted: form.elements.accepted.checked, authorized: form.elements.authorized.checked, independent: form.elements.independent.checked, electronicConsent: form.elements.electronicConsent.checked, termsHash: view.terms.hash }));
      });
      $('#signup-start-checkout').onclick = run(async () => {
        if (!receipt?.signed || !view.paymentsConfigured) throw new Error('Your signed agreement is saved. Payment setup remains pending.');
        const result = await api('signup-accept', { ...invitation, email: view.email, signature: receipt.signature, accepted: true, authorized: true, independent: true, termsHash: view.terms.hash });
        if (result.active) signed({ ...receipt, ...result });
        else if (result.checkoutUrl) { const url = new URL(result.checkoutUrl); if (url.origin !== 'https://checkout.stripe.com') throw new Error('Unexpected payment address.'); location.assign(url.href); }
        else throw new Error('Checkout was not confirmed. Your signed agreement remains saved.');
      });
      $('#signup-check-payment').onclick = run(async () => { const result = await api('signup-confirm', invitation); signed({ ...receipt, ...result }); });
      $('#signup-download').onclick = () => {
        if (!receipt) return;
        const text = `${view.terms.title}\n\nOffice: ${receipt.office}\nSigned by: ${receipt.signature}\nBusiness email: ${view.email}\nAccepted: ${receipt.acceptedAt}\nReceipt: ${receipt.receipt}\nTerms SHA-256: ${receipt.termsHash}\nMembership: ${receipt.active ? 'Active after payment verification' : 'Payment/activation pending'}\n\n${view.terms.text}`;
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), anchor = document.createElement('a');
        anchor.href = url; anchor.download = `gig-tax-pros-signed-agreement-${receipt.receipt}.txt`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      (async () => {
        try {
          if (!invitation.id || !invitation.token) throw new Error('Open the private contract link supplied by your sales agent.');
          view = await api('signup-view', invitation);
          $('#signup-record').hidden = false; $('#signup-office').textContent = view.office; $('#signup-address').textContent = view.address;
          $('#signup-contact').textContent = `Invited owner: ${view.ownerName} · ${view.email}`;
          $('#signup-terms-title').textContent = view.terms.title; $('#signup-terms').textContent = view.terms.text;
          $('#signup-version').textContent = `Terms version ${view.terms.version} · SHA-256 ${view.terms.hash}`;
          form.elements.email.value = view.email; form.elements.signature.value = view.ownerName;
          if (view.signed) signed(await api('signup-receipt', invitation));
          else { $('#signup-pending').hidden = true; $('#signup-receipt').hidden = true; form.querySelector('button').disabled = false; status('Review the agreement, confirm your authority and sign. Signing does not charge you or activate membership.'); }
          if (params.get('payment') === 'return' && view.paymentsConfigured) $('#signup-check-payment').hidden = false;
        } catch (error) { status(error.message, true); }
      })();
    },
  };
})();
