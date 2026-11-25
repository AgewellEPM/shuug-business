(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const button = (action, label, primary = false) => `<button type="button" class="training-button${primary ? ' training-primary' : ''}" data-sim-action="${action}">${escape(label)}</button>`;
  const date = stamp => new Date(stamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  function mount(root, api) {
    if (!root) return;
    const panel = root.querySelector('[data-sim-panel]'), status = root.querySelector('[data-sim-status]');
    const find = selector => root.querySelector(selector);
    let data, busy = false, loading, retry = false, draft = '', key, startKey, recording, audioUrl, speaking, offset = 0;
    let chosenCase, chosenFocus, technique = '', speechSample;
    const announce = message => { status.textContent = message; };
    const persona = id => data.cases.find(c => c.id === id)?.title || id;
    const skill = id => data.focusAreas.find(f => f.id === id)?.title || id;
    function stopAudio() {
      recording?.abort(); recording = null;
      if (speaking) { window.speechSynthesis?.cancel(); speaking = false; }
      if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = undefined; }
      const preview = find('audio');
      if (preview) { preview.pause(); preview.removeAttribute('src'); preview.hidden = true; }
      const mic = find('[data-sim-action="mic"]');
      if (mic) mic.textContent = 'Record my reply';
    }
    function options(items, current) {
      return items.map(i => `<option value="${escape(i.id)}"${i.id === current ? ' selected' : ''}>${escape(i.title)}</option>`).join('');
    }
    function startForm() {
      return `<form data-sim-start><label>Practice buyer<select name="scenario">${options(data.cases, chosenCase)}</select></label>
        <label>Skill to work on<select name="focus">${options(data.focusAreas, chosenFocus)}</select></label>
        <label>Technique to try (optional)<input name="technique" maxlength="180" placeholder="Ask one question, then pause" value="${escape(technique)}"></label>
        <button class="training-button training-primary" type="submit">Start rehearsal</button></form>`;
    }
    function versionCard(v, i, versions) {
      const change = i ? v.score - versions[i - 1].score : 0;
      return `<section class="sim-version"><strong>${i ? 'New phrasing ' + i : 'First phrasing'}</strong>
        <p><b>You</b> · ${escape(v.words)}</p>${v.speech ? `<p>Recorded sample · ${v.speech.seconds}s · about ${v.speech.wordsPerMinute} words/min including pauses</p>` : ''}<p><b>Buyer</b> · ${escape(v.buyer)}</p>
        <p><b>AI coach</b> · ${escape(v.coach)}</p><p><b>Try saying</b> · “${escape(v.suggestion)}”</p>
        <p><b>Speaking drill</b> · ${escape(v.delivery)}</p><p><b>Practice score</b> · ${v.score}/5${i ? ' (' + (change > 0 ? '+' : '') + change + ' vs. previous phrasing)' : ''}</p>
        ${v.scorecard ? '<ul aria-label="Score breakdown">' + v.scorecard.map(c => '<li>' + (c.met ? 'Demonstrated' : 'Practice next') + ' · ' + escape(c.criterion) + '</li>').join('') + '</ul>' : ''}</section>`;
    }
    function transcript(session) {
      if (!session.turns.length) return '';
      return `<h3>Conversation and coaching</h3>` + session.turns.map((turn, index) => `<details${index === session.turns.length - 1 ? ' open' : ''}>
        <summary>Exchange ${index+1} · ${escape(turn.prompt)}</summary>${turn.versions.map(versionCard).join('')}</details>`).join('');
    }
    function activePanel(session) {
      const last = session.turns.at(-1), retryable = last && last.versions.length < data.maxVersions;
      const canSend = retry || session.turns.length < data.maxExchanges;
      const prompt = retry ? last.prompt : last?.versions.at(-1).buyer || session.opening;
      return `<h3>${escape(persona(session.scenario))} · ${escape(skill(session.focus))}</h3>
        ${session.technique ? `<p>Technique · ${escape(session.technique)}</p>` : ''}
        <p class="sim-prompt"><strong>${retry ? 'Try the same buyer prompt again' : 'AI buyer'}</strong><br>${escape(prompt)}</p>
        ${button('hear','Hear the buyer')}
        ${canSend ? `<form data-sim-turn><label>Your reply<textarea name="words" rows="3" maxlength="1000" required placeholder="What would you say in the room?">${escape(draft)}</textarea></label>
          <div class="training-actions">${button('mic','Record my reply')}<button type="submit" class="training-button training-primary">${retry ? 'Compare this phrasing' : 'Say it to the buyer'}</button></div>
          <audio controls hidden aria-label="Listen to your recording"></audio></form>` : '<p>This rehearsal has reached its exchange limit. Review your replies and save the session.</p>'}
        <div class="training-actions">${retry ? button('cancel-retry','Return to conversation') : retryable ? button('rephrase','Rephrase my last reply') : ''}
          ${button('finish',session.turns.length ? 'Finish and save rehearsal' : 'End empty rehearsal')}</div>
        ${transcript(session)}`;
    }
    function history() {
      const selected = data.selected?.finished && data.selected;
      return `<h3>Your practice progress</h3>${data.totals.length ? `<ul>${data.totals.map(t => `<li><strong>${escape(skill(t.focus))}</strong> · ${t.sessions} finished · ${t.attempts} replies practiced · average ${t.average}/5${t.sessions > 1 ? ` · first rehearsal ${t.firstScore}/5 → latest ${t.latestScore}/5` : ''}</li>`).join('')}</ul>` : '<p>Your first finished conversation will appear here.</p>'}
        ${data.history.map(h => `<p><button type="button" class="training-link" data-sim-review="${escape(h.id)}">${escape(date(h.finished))} · ${escape(persona(h.scenario))} · ${escape(skill(h.focus))} · ${h.score}/5</button></p>`).join('')}
        <div class="training-actions">${offset ? button('previous','Newer sessions') : ''}${data.hasMore ? button('older','Older sessions') : ''}</div>
        ${selected ? `<article><h3>Saved rehearsal · ${escape(persona(selected.scenario))}</h3><p>${escape(skill(selected.focus))} · ${selected.attempts} replies practiced</p>${transcript(selected)}</article>` : ''}`;
    }
    function lock(value) {
      busy = value; root.setAttribute('aria-busy', String(value));
      for (const control of root.querySelectorAll('input, textarea, select, button')) control.disabled = value;
    }
    function render() {
      if (!data) return;
      stopAudio();
      panel.innerHTML = (data.active ? activePanel(data.active) : startForm()) + history() + button('reload','Refresh practice');
      lock(false);
    }
    async function refresh(body = {}) {
      if (busy || loading) return loading;
      lock(true); announce('Loading practice…');
      loading = api('simulation-read', { offset, ...body }).then(next => {
        if (data?.active?.id !== next.active?.id || data?.active?.revision !== next.active?.revision) { retry = false; key = undefined; speechSample = undefined; draft = ''; }
        data = next; render(); announce('');
      }).catch(e => { announce(e.message); if (!data) panel.innerHTML = button('reload','Try again'); })
        .finally(() => { lock(false); loading = undefined; });
      return loading;
    }
    async function change(action, body, message) {
      stopAudio(); lock(true); announce(action === 'simulation-turn' ? 'The buyer and coach are responding…' : 'Saving practice…');
      try {
        data = await api(action, body); offset = 0; retry = false; draft = ''; speechSample = undefined; key = startKey = undefined;
        render(); announce(message);
        if (!root.closest('[hidden]')) find('textarea, [name="scenario"]')?.focus();
      } catch (e) { announce(e.message + ' Your draft is still here.'); }
      finally { lock(false); }
    }
    async function dictate() {
      if (recording) { stopAudio(); announce('Recording canceled.'); return; }
      stopAudio();
      const controls = window.SdrCoachControls, form = find('[data-sim-turn]');
      if (!controls?.recordPhrase || !navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
        announce('Type your reply or use keyboard dictation on this device.'); form.elements.words.focus(); return;
      }
      const controller = new AbortController(); recording = controller;
      const mic = find('[data-sim-action="mic"]'); mic.textContent = 'Cancel recording';
      try {
        const wav = await controls.recordPhrase(controller.signal, announce, true);
        if (!wav || recording !== controller) return;
        announce('Transcribing your reply…');
        const res = await fetch('/api/sales/coach/voice', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'audio/wav'}, body:wav, signal:controller.signal });
        const result = await res.json();
        if (recording !== controller) return;
        if (!res.ok || !result.text) throw Error(result.error || 'Transcription unavailable.');
        const existing = form.elements.words.value.trim();
        draft = [existing, result.text].filter(Boolean).join(' ').slice(0,1000);
        form.elements.words.value = draft; key = undefined;
        const audio = form.querySelector('audio');
        audioUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
        audio.src = audioUrl; audio.hidden = false;
        const seconds = (wav.byteLength - 44) / 32000;
        const wordCount = result.text.trim().split(/\s+/).length;
        speechSample = { seconds: Math.max(0.1, Math.round(seconds * 10) / 10), wordCount };
        announce('Transcript ready. Listen back or edit before sending. Your last recording was ' + speechSample.seconds + ' seconds, about ' + Math.round(60 * wordCount / speechSample.seconds) + ' words per minute including pauses.');
        form.elements.words.focus();
      } catch (e) { if (recording === controller) announce(e.name === 'Error' ? e.message : controls.microphoneHelp(e.name)); }
      finally { if (recording === controller) { recording = undefined; mic.textContent = 'Record my reply'; } }
    }
    root.addEventListener('input', e => {
      if (e.target.name === 'words') { draft = e.target.value; key = undefined; if (!draft.trim()) speechSample = undefined; }
      if (e.target.closest('[data-sim-start]')) {
        const f = e.target.form.elements; chosenCase = f.scenario.value; chosenFocus = f.focus.value; technique = f.technique.value; startKey = undefined;
      }
    });
    root.addEventListener('submit', e => {
      e.preventDefault(); if (busy || !data) return;
      const form = e.target;
      if (form.matches('[data-sim-start]')) {
        const f = form.elements;
        void change('simulation-start', { id: startKey ||= crypto.randomUUID(), scenario:f.scenario.value, focus:f.focus.value, technique:f.technique.value }, 'The buyer is ready.');
      } else if (form.matches('[data-sim-turn]') && data.active) {
        const s = data.active; draft = form.elements.words.value;
        void change('simulation-turn', { id:s.id, revision:s.revision, requestId:key ||= crypto.randomUUID(), words:draft, retry, speech:speechSample }, 'Buyer reply and coaching saved.');
      }
    });
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || busy) return;
      if (b.dataset.simReview) { void refresh({id:b.dataset.simReview}); return; }
      const action = b.dataset.simAction, s = data?.active;
      if (action === 'reload') { void refresh(); return; }
      if (action === 'older' || action === 'previous') { offset = Math.max(0, offset + (action === 'older' ? 10 : -10)); void refresh(); return; }
      if (!s) return;
      if (action === 'finish') void change('simulation-finish', {id:s.id, revision:s.revision}, s.turns.length ? 'Rehearsal saved to your progress.' : 'Practice closed.');
      if (action === 'mic') void dictate();
      if (action === 'hear') {
        stopAudio();
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { announce('Buyer audio is unavailable. The buyer’s words are above.'); return; }
        const last = s.turns.at(-1);
        const voice = new SpeechSynthesisUtterance(retry ? last.prompt : last?.versions.at(-1).buyer || s.opening);
        speaking = true; voice.onend = voice.onerror = () => { speaking = false; }; speechSynthesis.speak(voice);
      }
      if (action === 'rephrase' || action === 'cancel-retry') {
        retry = action === 'rephrase'; key = undefined; speechSample = undefined; draft = retry ? s.turns.at(-1).versions.at(-1).words : '';
        render(); find('textarea')?.focus();
      }
    });
    const visibility = new MutationObserver(() => { if (root.closest('[hidden]')) stopAudio(); });
    for (let node = root; node; node = node.parentElement) visibility.observe(node, {attributes:true, attributeFilter:['hidden']});
    window.addEventListener('pagehide', stopAudio);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAudio(); });
    let sourceLink;
    return { show() {
      const params = new URLSearchParams(location.hash.slice(1));
      if (sourceLink !== location.hash && params.get('section') === 'simulator') {
        sourceLink = location.hash;
        chosenCase = params.get('buyer') || chosenCase; chosenFocus = params.get('skill') || chosenFocus;
        if (data && !data.active && !busy) render();
      }
      if (!data && !loading) void refresh();
    } };
  }
  window.SdrTrainingSimulator = { mount };
})();
