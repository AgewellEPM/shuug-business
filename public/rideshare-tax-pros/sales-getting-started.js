(() => {
  'use strict';

  function mount({ api, navigate }) {
    const dialog = document.querySelector('#sdr-tour'), launcher = document.querySelector('[data-sdr-tour-open]');
    if (!dialog || !launcher) return;
    const find = selector => dialog.querySelector(selector);
    const card = find('.sdr-tour-card'), title = find('h2'), meter = find('[data-tour-progress]');
    const next = find('[data-tour-next]'), back = find('[data-tour-back]'), pause = [...dialog.querySelectorAll('[data-tour-pause]')];
    const status = find('[data-tour-status]'), practice = find('[data-tour-practice]'), fields = find('[data-tour-fields]');
    const feedback = find('[data-tour-feedback]');
    let person, steps = [], progress, index = 0, busy = false, replay, frame, focusTimer, target, started = false;

    const existing = selector => [...document.querySelectorAll(selector)].find(el =>
      !el.closest('[hidden], dialog:not([open])') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    function keepIn(lo, value, hi) { return Math.max(lo, Math.min(value, hi)); }
    function locate() {
      if (!dialog.open) return;
      const pad = 12, gutter = 18, width = dialog.clientWidth || innerWidth, height = dialog.clientHeight || innerHeight;
      const w = card.offsetWidth, viewportLimit = height - pad * 2;
      const h = Math.min(viewportLimit, card.scrollHeight + card.offsetHeight - card.clientHeight);
      let heightLimit = viewportLimit;
      const centered = [(width - w) / 2, (height - h) / 2];
      const box = target?.getBoundingClientRect();
      const seen = box && box.width && box.height && box.right > 0 && box.bottom > 0 && box.left < width && box.top < height;
      dialog.classList.toggle('sdr-tour-spot', Boolean(seen));
      let [left, top] = centered;
      if (seen) {
        const x = Math.max(4, box.left - 5), y = Math.max(4, box.top - 5);
        const right = Math.min(width - 4, box.right + 5), bottom = Math.min(height - 4, box.bottom + 5);
        const sides = [
          { room: width - right, size: w, x: right + gutter, y: y },
          { room: height - bottom, size: h, x: (x + right - w) / 2, y: bottom + gutter },
          { room: y, size: h, x: (x + right - w) / 2, y: y - h - gutter },
          { room: x, size: w, x: x - w - gutter, y },
        ];
        const fits = sides.find(side => side.room >= side.size + gutter + pad);
        if (fits) [left, top] = [fits.x, fits.y];
        else {
          const above = y - gutter - pad, below = height - bottom - gutter - pad;
          heightLimit = Math.max(above, below);
          // A target can fill most of a short landscape viewport. Keep the guide usable there.
          heightLimit = Math.min(viewportLimit, Math.max(120, heightLimit));
          left = (width - w) / 2;
          top = above >= below ? pad : height - Math.min(h, heightLimit) - pad;
        }
        for (const [key, n] of Object.entries({ x, y, w: right - x, h: bottom - y })) dialog.style.setProperty('--spot-' + key, n + 'px');
      }
      card.style.maxHeight = heightLimit + 'px';
      card.style.left = keepIn(pad, left, width - w - pad) + 'px';
      card.style.top = keepIn(pad, top, height - card.offsetHeight - pad) + 'px';
    }
    function schedule() {
      clearTimeout(frame); frame = setTimeout(locate, 16);
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    const resize = window.ResizeObserver && new ResizeObserver(schedule);
    resize?.observe(card);

    function spotlight(step) {
      clearTimeout(focusTimer);
      target = step.target && existing(step.target);
      if (step.view && !target) {
        target = existing('[data-tab-panel="' + step.view + '"] h1, [data-tab-panel="' + step.view + '"] h2') ||
          existing('.sdr-nav [data-tab="' + step.view + '"]');
        if (step.target) focusTimer = setTimeout(() => {
          const loaded = existing(step.target);
          if (dialog.open && loaded && loaded !== target) { target = loaded; scrollToTarget(); schedule(); }
        }, 430);
      }
      scrollToTarget(); locate();
    }
    function scrollToTarget() {
      const box = target?.getBoundingClientRect();
      if (box && (box.top < 8 || box.bottom > innerHeight - 10)) {
        target.scrollIntoView?.({ block: innerWidth < 680 ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
      }
    }

    function setupExercise(exercise) {
      practice.hidden = !exercise; fields.replaceChildren(); feedback.textContent = ''; feedback.removeAttribute('data-correct');
      if (!exercise) return;
      find('legend').textContent = exercise.prompt;
      practice.querySelector('button').textContent = exercise.submit || 'Check my answer';
      if (exercise.choices) {
        for (const [value, option] of exercise.choices.entries()) {
          const label = document.createElement('label'), input = document.createElement('input');
          label.className = 'sdr-tour-choice'; input.type = 'radio'; input.name = 'answer'; input.value = String(value); input.required = true;
          label.append(input, document.createTextNode(option)); fields.append(label);
        }
        return;
      }
      for (const field of exercise.fields) {
        const label = document.createElement('label'), input = document.createElement(field.long ? 'textarea' : 'input');
        if (field.long) input.rows = 2;
        else input.type = field.type || 'text';
        input.name = field.name; input.required = true; input.maxLength = 600;
        if (field.placeholder) input.placeholder = field.placeholder;
        label.append(document.createTextNode(field.label), input); fields.append(label);
      }
    }
    practice.onsubmit = event => {
      event.preventDefault();
      const exercise = steps[index]?.practice;
      if (!exercise) return;
      const data = new FormData(practice);
      const correct = exercise.choices ? data.get('answer') === String(exercise.answer) :
        exercise.fields.every(field => data.get(field.name)?.trim()) && (!exercise.match || exercise.match.test(data.get('command')));
      feedback.dataset.correct = String(correct);
      feedback.textContent = correct ? exercise.result : 'Try again using the highlighted tool and the instructions above.';
      schedule();
    };
    const chapterArt = {
      'Start your day': 'time',
      'Set up your account': 'path-new',
      'Find prospects': 'crm',
      'Start outreach': 'sales',
      'Work the pipeline': 'crm',
      'Book and present': 'product',
      'Close the deal': 'certificate',
      'Work with your team': 'healthcare',
      'Keep learning': 'cap',
    };
    function render() {
      const step = steps[index];
      const mode = ['welcome', 'finish'].includes(step.id) ? step.id : 'lesson';
      dialog.dataset.tourMode = mode;
      dialog.dataset.tourStep = step.id;
      find('[data-tour-section]').textContent = mode === 'welcome' ? 'Agent orientation' : mode === 'finish' ? 'Walkthrough complete' : step.group;
      const emblem = find('[data-tour-emblem]');
      emblem.hidden = mode !== 'lesson';
      if (!emblem.hidden) emblem.src = '/training-art/' + (chapterArt[step.group] || 'cap') + '.png';
      find('[data-tour-route]').hidden = mode !== 'welcome';
      card.scrollTop = 0;
      title.textContent = step.title; find('#sdr-tour-copy').textContent = step.copy;
      const hint = find('[data-tour-instruction]'); hint.hidden = !step.instruction; hint.textContent = step.instruction || '';
      meter.hidden = index === 0 || index === steps.length - 1;
      meter.querySelector('progress').max = steps.length - 2; meter.querySelector('progress').value = index;
      meter.querySelector('span').textContent = 'Stop ' + index + ' of ' + (steps.length - 2);
      setupExercise(step.practice);
      back.hidden = index === 0;
      next.textContent = index === 0 ? 'Start walkthrough' : index === steps.length - 1 ? 'Finish walkthrough' : 'Next';
      status.textContent = ''; title.focus({ preventScroll: true }); spotlight(step);
    }
    async function save(state, step) {
      if (replay) return;
      try {
        ({ progress } = await api('getting-started-save', { step, state, revision: progress?.revision ?? 0 }));
        if (progress.state === 'complete') replay = true;
      } catch (error) {
        if (error.status === 409) ({ progress } = await api('getting-started-read'));
        throw error;
      }
    }
    function controls(disabled) {
      busy = disabled;
      for (const button of [next, back, ...pause]) button.disabled = disabled;
      dialog.setAttribute('aria-busy', String(disabled));
    }
    function page(step) {
      const params = new URLSearchParams({ view: step.view });
      if (step.section) params.set('section', step.section);
      return '#' + params;
    }
    async function move(to) {
      if (busy) return;
      const step = steps[to];
      controls(true);
      try {
        if (step.view) await navigate(page(step));
      } catch (e) {
        status.textContent = e.message;
        controls(false); return;
      }
      try {
        await save('active', step.id);
        index = to; render();
      } catch (e) { status.textContent = e.message || 'Try again to save your place.'; }
      finally { controls(false); }
    }
    function updateLauncher() {
      launcher.textContent = progress && progress.state !== 'complete' ? 'Resume walkthrough' : 'Getting started';
    }
    async function leave(complete) {
      if (busy) return;
      controls(true);
      try {
        await save(complete ? 'complete' : 'paused', steps[index].id);
        clearTimeout(focusTimer); target = null; dialog.close(); updateLauncher(); launcher.focus({ preventScroll: true });
      } catch (e) {
        if (!complete) {
          clearTimeout(focusTimer); target = null; dialog.close(); updateLauncher(); launcher.focus({ preventScroll: true });
        } else status.textContent = e.message || 'Try again to save your place.';
      }
      finally { controls(false); }
    }
    async function open() {
      if (dialog.open || !person || document.querySelector('dialog[open]')) return;
      const workspace = document.querySelector('#sales-workspace');
      if (!workspace || workspace.hidden) return;
      replay = progress?.state === 'complete';
      steps = window.SdrTourSteps.filter(step => {
        if (!step.view) return true;
        const panel = workspace.querySelector('[data-tab-panel="' + step.view + '"]');
        return panel && (person.role === 'owner' || !panel.hasAttribute('data-owner-only'));
      });
      index = replay ? 0 : Math.max(steps.findIndex(step => step.id === progress?.step), 0);
      dialog.showModal(); render();
      if (steps[index].view) {
        controls(true);
        try { await navigate(page(steps[index])); spotlight(steps[index]); }
        catch (e) { status.textContent = e.message; }
        finally { controls(false); }
      }
    }
    next.onclick = () => index === steps.length - 1 ? leave(true) : move(index + 1);
    back.onclick = () => move(index - 1);
    pause.forEach(button => button.onclick = () => leave(false));
    dialog.addEventListener('cancel', event => { event.preventDefault(); void leave(false); });
    launcher.onclick = () => open();
    function view(user) {
      if (!['owner', 'agent'].includes(user?.role) || person?.id === user.id) return;
      person = user; progress = undefined;
      const member = user.id;
      void api('getting-started-read').then(result => {
        if (person?.id !== member) return;
        progress = result.progress;
        updateLauncher(); launcher.hidden = false;
        const url = new URL(location.href), requested = url.searchParams.get('walkthrough') === '1';
        if (requested) { url.searchParams.delete('walkthrough'); history.replaceState(null, '', url); }
        if (requested || (user.role === 'agent' && !started && (!progress || progress.state === 'active'))) {
          started = true;
          setTimeout(() => { if (person?.id === member) void open(); }, 0);
        }
      }).catch(() => { if (person?.id === member) launcher.hidden = false; });
    }
    return { view };
  }
  window.SdrGettingStarted = { mount };
})();
