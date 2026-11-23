(() => {
  'use strict';
  const element = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (className) node.className = className;
    return node;
  };
  function sourceLink(value, label) {
    let url;
    try { url = new URL(value); } catch { return document.createTextNode(label); }
    if (!['http:', 'https:'].includes(url.protocol)) return document.createTextNode(label);
    const anchor = element('a', label + ' ↗');
    anchor.href = url.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function leadCard(lead) {
    const card = element('article', '', 'sales-result');
    const states = { ready: 'Draft ready', needs_contact: 'Business email needed', accepted: 'Accepted by mail provider',
      delivered: 'Delivered', test_accepted: 'Accepted in test mode', sending: 'Dispatch pending', deferred: 'Deferred',
      rejected: 'Rejected by mail provider', uncertain: 'Delivery outcome uncertain', failed: 'Delivery failed',
      replied: 'Reply received', suppressed: 'Suppressed', opted_out: 'Opted out' };
    card.append(element('h3', lead.name), element('p', states[lead.status] || lead.status),
      element('p', lead.email || 'Published business email needed.'), sourceLink(lead.sourceURL, 'Prospect source'));
    if (lead.people?.length) {
      const people = element('ul');
      for (const person of lead.people) {
        const row = element('li', person.name + (person.role ? ' · ' + person.role : '') + ' ');
        row.append(sourceLink(person.sourceURL, 'Role source'));
        people.append(row);
      }
      card.append(element('h4', 'Listed people'), people);
    }
    if (lead.evidence?.length) {
      const facts = element('ul');
      for (const item of lead.evidence) {
        const row = element('li', item.value + ' ');
        row.append(sourceLink(item.sourceURL, 'Business contact source'));
        facts.append(row);
      }
      card.append(facts);
    }
    if (lead.draft) {
      const preview = element('details');
      preview.append(element('summary', 'Read personalized email'), element('pre', lead.draft.subject + '\n\n' + lead.draft.text, 'sales-terms'));
      card.append(preview);
    }
    if (lead.reply) card.append(element('h4', 'Latest reply'), element('p', lead.reply.text || 'Reply received.'));
    for (const warning of lead.warnings || []) card.append(element('p', warning));
    return card;
  }

  function mount({ api, status }) {
    const $ = id => document.getElementById(id);
    const form = $('sales-campaign-form');
    if (!form) return null;
    const picker = $('sales-campaign-picker'), results = $('sales-campaign-results');
    const run = $('sales-run-campaign'), pause = $('sales-pause-campaign'), submit = form.querySelector('button[type=submit]');
    let selected = '', revision = '', dirty = false, busy = false, sequence = 0;

    function buttons(active) {
      submit.disabled = active;
      run.disabled = active || dirty || !selected;
      pause.disabled = active || !selected || Number(form.elements.interval.value) === 0;
    }
    const option = (label, id) => {
      const node = element('option', label);
      node.value = id;
      return node;
    };

    async function refresh(updateForm = false) {
      const called = ++sequence;
      try {
        const data = await api('campaign-read', { id: selected });
        if (called !== sequence) return;
        const campaign = data.campaigns.find(item => item.id === selected);
        picker.replaceChildren(option('New campaign', ''), ...data.campaigns.map(item => option(item.campaignName, item.id)));
        picker.value = selected;
        const previousSender = form.elements.senderId.value;
        form.elements.senderId.replaceChildren(option('Choose a sender', ''), ...data.senders.map(item => option(item.name + ' · ' + item.email, item.id)));
        form.elements.senderId.value = previousSender;
        if (updateForm) {
          form.reset();
          if (campaign) for (const control of form.elements) {
            if (control.name && campaign[control.name] != null) control.value = campaign[control.name];
          }
          revision = campaign?.revision || '';
          dirty = false;
        }
        $('sales-campaign-connection').textContent = data.connection.configured
          ? 'Email provider mode: ' + data.connection.mode + '. Scheduled runs use the saved campaign settings.'
          : 'Connect Mailgun and approve a shared sender in Senders to deliver emails and collect replies.';
        results.replaceChildren(...data.leads.map(leadCard));
        if (!data.leads.length) results.append(element('p', 'Run the campaign to collect prospects here.'));
        if (campaign?.lastError) results.prepend(element('p', campaign.lastError));
        buttons(busy || campaign?.running);
      } catch (error) { if (called === sequence) status(error.message, true); }
    }

    async function command(label, task) {
      if (busy) return;
      busy = true;
      buttons(true);
      status(label);
      try { await task(); }
      catch (error) { status(error.message, true); }
      finally { busy = false; buttons(false); }
    }
    form.addEventListener('input', () => { dirty = true; buttons(busy); });
    picker.addEventListener('change', () => { selected = picker.value; void refresh(true); });
    $('sales-new-campaign').onclick = () => { selected = ''; void refresh(true); form.elements.campaignName.focus(); };
    form.addEventListener('submit', event => {
      event.preventDefault();
      void command('Saving campaign settings…', async () => {
        const input = Object.fromEntries(new FormData(form));
        const data = await api('campaign-save', { ...input, id: selected, revision });
        selected = data.campaign.id;
        await refresh(true);
        status('Campaign saved.');
      });
    });
    run.onclick = () => void command('Searching and researching prospects…', async () => {
      const data = await api('campaign-run', { id: selected });
      await refresh(true);
      status(`${data.saved} collected · ${data.submitted} submitted to email provider`);
    });
    pause.onclick = () => void command('Pausing scheduled runs…', async () => {
      await api('campaign-pause', { id: selected });
      await refresh(true);
      status('Campaign schedule paused.');
    });
    return { refresh: () => refresh(!dirty) };
  }

  window.SdrCampaigns = { mount };
})();
