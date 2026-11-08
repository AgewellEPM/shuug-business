(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const metadata = office => { try { return JSON.parse(office.notes || '{}'); } catch { return {}; } };
  const labels = { email: 'Business email', phone: 'Business phone', contact: 'Public contact name' };
  const currentValue = (office, field) => ({ email: office.contact_email, phone: office.contact_phone, contact: office.contact_name })[field] || '';
  const date = value => { const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? 'Date not supplied' : parsed.toLocaleString(); };
  function website(value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || /(?:^localhost$|\.(?:localhost|local|internal)$|^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.))/.test(url.hostname)) return '';
      return url.href;
    } catch { return ''; }
  }
  const sourceLink = (url, title = 'Open source') => {
    const safe = website(url);
    return safe ? `<a href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${escape(title)} ↗</a>` : '<span>Source unavailable</span>';
  };
  function section() {
    let host = document.querySelector('#sales-research');
    if (!host) {
      const parent = document.querySelector('#sales-detail');
      if (!parent) return null;
      host = document.createElement('section'); host.id = 'sales-research'; parent.append(host);
    }
    host.className = 'sales-research-panel';
    return host;
  }

  window.GigTaxResearch = {
    mount({ office, api, status = () => {}, refresh = async () => {} }) {
      const host = section(); if (!host) return;
      const info = metadata(office);
      if (['do_not_contact', 'not_interested'].includes(office.status)) {
        host.innerHTML = '<h3>Research published business contacts</h3><p>Research is paused while this office is marked not interested or do not contact. Review its status before starting new research.</p>';
        return;
      }
      let report = null;
      host.innerHTML = '<h3>Research published business contacts</h3><p>Read the office’s own website for contact details and ownership evidence. Findings remain proposals until you review and save them. Names from a directory do not establish the person’s role.</p>' +
        `<form class="sales-form" id="sales-research-form"><label>Official office website<input type="url" name="website" maxlength="1200" placeholder="https://office.example" value="${escape(info.website || '')}"></label><p class="field-hint">Confirm this is the office’s own site. Leave blank to look for possible websites first.</p><button type="submit" class="button secondary">Research public contacts</button></form>` +
        '<p class="sales-research-status" role="status" aria-live="polite"></p><div class="sales-research-results"></div>';
      const form = host.querySelector('form'), results = host.querySelector('.sales-research-results'), localStatus = host.querySelector('.sales-research-status');
      const announce = (message, error = false) => { localStatus.textContent = message; localStatus.dataset.error = String(error); status(message, error); };
      const busy = value => { host.querySelectorAll('button').forEach(button => { if (value) { button.dataset.researchPriorDisabled = String(button.disabled); button.disabled = true; } else { button.disabled = button.dataset.researchPriorDisabled === 'true'; delete button.dataset.researchPriorDisabled; } }); host.setAttribute('aria-busy', String(value)); };

      function renderCandidates(payload) {
        report = null;
        const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
        results.innerHTML = '<h4>Choose the office’s official website</h4><p>Search results are possible matches. Check the business name, location and source before choosing one.</p>' +
          candidates.map((candidate, index) => `<article class="sales-research-candidate"><h5>${escape(candidate.title || candidate.url || 'Possible website')}</h5><p>${escape(candidate.snippet || '')}</p>${sourceLink(candidate.url, candidate.url || 'Open possible website')}${website(candidate.url) ? `<button type="button" class="button secondary" data-research-website="${index}">Use this website</button>` : ''}</article>`).join('') +
          (candidates.length ? '' : '<p>No candidate websites were returned. Enter a confirmed office website above and try again.</p>');
        results.querySelectorAll('[data-research-website]').forEach(button => button.addEventListener('click', () => {
          form.elements.website.value = website(candidates[Number(button.dataset.researchWebsite)].url);
          form.elements.website.focus();
          announce('Website selected. Confirm the address above, then run public contact research.');
        }));
      }

      function renderReport(payload) {
        report = payload.research || payload.report || payload;
        const choices = [...new Map((Array.isArray(report.evidence) ? report.evidence : []).filter(item => labels[item.field] && typeof item.id === 'string' && typeof item.value === 'string' && item.value.trim()).map(item => [item.id, item])).values()];
        const pages = Array.isArray(report.pages) ? report.pages : [];
        const issues = Array.isArray(report.issues) ? report.issues : [];
        const ownership = report.ownership || {};
        const ownershipEvidence = Array.isArray(ownership.evidence) ? ownership.evidence : [];
        const finding = { independent: 'Possible independent-ownership statement', chain: 'Possible chain or franchise connection', unverified: 'Independent ownership is unverified' }[ownership.suggestedFinding] || 'Independent ownership is unverified';
        results.innerHTML = `<div class="sales-research-summary"><h4>Public-source findings</h4><p>Checked ${escape(date(report.checkedAt))}. Choose at most one value per field. Existing details are kept unless you select a reviewed replacement.</p></div>` +
          (choices.length ? `<form class="sales-form sales-research-review"><div class="sales-research-options">${choices.map(item => `<label class="sales-research-option"><input type="checkbox" name="selected" value="${escape(item.id)}" data-research-field="${escape(item.field)}"><span><strong>${escape(labels[item.field])}: ${escape(item.value)}</strong><small>Currently saved: ${escape(currentValue(office, item.field) || 'Not supplied')}</small>${item.role ? `<small>Published role: ${escape(item.role)}</small>` : ''}<span class="sales-research-source">${sourceLink(item.sourceURL || item.sourceUrl)}</span><span class="sales-research-excerpt">${escape(item.excerpt || 'No excerpt returned.')}</span><small>Evidence confidence: ${escape(item.confidence || 'Not supplied')} · ${escape(date(item.checkedAt || report.checkedAt))}</small></span></label>`).join('')}</div><label class="sales-check"><input type="checkbox" name="reviewed" required>I checked the selected details against their sources and want to save these contact changes.</label><button class="button primary" type="submit" ${!report.reportId || !report.token ? 'disabled data-research-prior-disabled="true"' : ''}>Save reviewed contact details</button></form>` : '<p>No saveable public email, phone or contact-name evidence was found. This does not establish that the office has none.</p>') +
          `<section class="sales-ownership-evidence"><h4>${escape(finding)}</h4><p>Research does not change the saved ownership finding. Confirm the office and person’s role using the sources, then record your finding in the office form.</p>${ownershipEvidence.map(item => `<article><p>${escape(item.excerpt || item.value || '')}</p>${sourceLink(item.sourceURL || item.sourceUrl)}</article>`).join('')}</section>` +
          (issues.length ? `<details class="sales-research-issues" open><summary>Research limits and unread pages (${issues.length})</summary><ul>${issues.map(issue => `<li>${escape(issue.message || issue.code || 'Page was not read.')}${issue.url ? ` ${sourceLink(issue.url)}` : ''}</li>`).join('')}</ul></details>` : '') +
          `<details><summary>Pages checked (${pages.length})</summary><ul>${pages.map(page => `<li>${sourceLink(page.url, page.title || page.url || 'Page')} <span>${escape(page.status || '')}</span></li>`).join('')}</ul></details>`;
        const review = results.querySelector('.sales-research-review');
        if (!review) return;
        review.querySelectorAll('[data-research-field]').forEach(input => input.addEventListener('change', () => {
          if (!input.checked) return;
          review.querySelectorAll('[data-research-field]').forEach(other => { if (other !== input && other.dataset.researchField === input.dataset.researchField) other.checked = false; });
        }));
        review.addEventListener('submit', async event => {
          event.preventDefault();
          const selected = [...review.querySelectorAll('input[name="selected"]:checked')].map(input => input.value);
          if (!selected.length) { announce('Select at least one sourced detail to save.', true); return; }
          if (!review.elements.reviewed.checked) { announce('Review the sources and confirm the contact changes first.', true); review.elements.reviewed.focus(); return; }
          if (!report.reportId || !report.token) { announce('This report cannot be saved. Run fresh research before applying changes.', true); return; }
          busy(true);
          try {
            await api('apply-research', { id: office.id, reportId: report.reportId, token: report.token, selected, reviewed: true });
            await refresh();
            announce('Reviewed contact details saved. The ownership finding was not changed.');
          } catch (error) { announce(error.message || 'The contact changes were not confirmed.', true); }
          finally { if (host.isConnected) busy(false); }
        });
      }

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const supplied = form.elements.website.value.trim();
        if (supplied && !website(supplied)) { announce('Enter the office’s public HTTP or HTTPS website without embedded credentials.', true); form.elements.website.focus(); return; }
        busy(true); results.replaceChildren();
        announce(supplied ? 'Reading the office’s public website…' : 'Looking for possible official websites…');
        try {
          const payload = await api('research-office', { id: office.id, ...(supplied ? { website: supplied } : {}) });
          if (!host.isConnected) return;
          if (payload.needsWebsiteSelection) { renderCandidates(payload); announce(payload.message || 'Choose and confirm the office’s official website.'); }
          else { renderReport(payload); announce('Research returned. Review each source before saving changes.'); }
        } catch (error) { announce(error.message || 'The public-source research did not finish.', true); }
        finally { if (host.isConnected) busy(false); }
      });
    },
  };
})();
