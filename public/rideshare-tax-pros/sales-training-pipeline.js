(() => {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

  function mount({ api }) {
    const root = document.querySelector('.sdr-training-pipeline');
    if (!root) return;
    const panel = root.querySelector('[data-training-pipeline-content]');
    const status = root.querySelector('[data-training-pipeline-status]');
    let catalog, saved = {}, active, loading, pending = false;

    function announce(message = '', retry = false) {
      status.hidden = !message;
      status.innerHTML = escape(message) + (retry ? ' <button type="button" class="training-link" data-pipeline-practice-retry>Try again</button>' : '');
    }

    function render(focus = false) {
      if (!catalog) return;
      if (!active) {
        panel.innerHTML = `<h2 id="training-pipeline-heading" tabindex="-1">Choose a facility scenario</h2>
          <p>Practice with a fictional prospect. Your score is saved in Training.</p>
          <div class="training-course-grid">${catalog.map(scenario => `<article class="training-course">
            <p class="training-course-summary">${escape(scenario.setting)}</p>
            <h3>${escape(scenario.title)}</h3><p>${escape(scenario.opening)}</p>
            ${saved[scenario.id] ? `<p>Best score ${saved[scenario.id].best.percent}%</p>` : ''}
            <button type="button" class="training-button training-primary" data-pipeline-practice-start="${escape(scenario.id)}">Start scenario</button>
          </article>`).join('')}</div>`;
      } else if (active.result) {
        const { result, scenario } = active;
        panel.innerHTML = `<h2 id="training-pipeline-heading" tabindex="-1">${escape(scenario.title)}</h2>
          <p class="training-pipeline-result" data-passed="${result.passed}" data-pipeline-practice-result>
            ${result.passed ? 'Practice passed' : 'Practice score'} · ${result.correct} of ${result.total} · ${result.percent}%
          </p>
          <ol class="training-pipeline-feedback">${result.feedback.map(item => {
            const stage = scenario.stages.find(stage => stage.id === item.stageId);
            return `<li><strong>${escape(stage.phase)} · ${item.correct ? 'Good choice' : 'Review this step'}</strong><p>${escape(item.feedback)}</p></li>`;
          }).join('')}</ol>
          <div class="training-actions"><button type="button" class="training-button training-primary" data-pipeline-practice-start="${escape(scenario.id)}">Try again</button>
            <button type="button" class="training-button" data-pipeline-practice-exit>Choose another case</button></div>`;
      } else {
        const { scenario, step, answers } = active;
        const stage = scenario.stages[step];
        const lastStep = step === scenario.stages.length - 1;
        panel.innerHTML = `<p class="training-course-summary">${escape(scenario.title)} · Step ${step + 1} of ${scenario.stages.length}</p>
          <h2 id="training-pipeline-heading" tabindex="-1">${escape(stage.title)}</h2>
          <ol class="training-pipeline-stages" aria-label="Sales stages">${scenario.stages.map((item, index) =>
            `<li${index === step ? ' aria-current="step"' : ''}>${escape(item.phase)}</li>`).join('')}</ol>
          <form data-pipeline-practice-stage>
            <fieldset><legend>${escape(stage.prompt)}</legend>
              ${stage.options.map((option, index) => `<label><input type="radio" name="choice" value="${index}" required${answers[stage.id] === index ? ' checked' : ''}><span>${escape(option.label)}</span></label>`).join('')}
            </fieldset>
            <div class="training-actions">
              ${step ? '<button type="button" class="training-button" data-pipeline-practice-back>Previous stage</button>' : ''}
              <button type="submit" class="training-button training-primary">${lastStep ? 'Get feedback' : 'Next stage'}</button>
              <button type="button" class="training-link" data-pipeline-practice-exit>Exit scenario</button>
            </div>
          </form>`;
      }
      if (focus) panel.querySelector('#training-pipeline-heading')?.focus();
    }

    function load() {
      if (loading) return loading;
      announce('Loading practice cases…');
      loading = api('training-progress').then(({ catalog: data, progress }) => {
        catalog = data.scenarios;
        saved = progress.scenarios || {};
        announce();
        render();
      }).catch(() => announce('Practice cases could not be loaded.', true)).finally(() => { loading = undefined; });
      return loading;
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || pending) return;
      announce();
      const scenario = catalog?.find(item => item.id === button.dataset.pipelinePracticeStart);
      if (scenario) {
        active = { scenario, step: 0, answers: {} };
        render(true);
      } else if (button.hasAttribute('data-pipeline-practice-back')) {
        const form = button.form;
        if (form?.elements.choice.value) active.answers[active.scenario.stages[active.step].id] = Number(form.elements.choice.value);
        active.step--;
        render(true);
      } else if (button.hasAttribute('data-pipeline-practice-exit')) {
        active = undefined;
        render(true);
      } else if (button.hasAttribute('data-pipeline-practice-retry')) void load();
    });

    root.addEventListener('submit', async event => {
      if (!event.target.matches('[data-pipeline-practice-stage]')) return;
      event.preventDefault();
      const selected = event.target.elements.choice.value;
      if (!active || pending || selected === '') return;
      const { scenario, step, answers } = active;
      answers[scenario.stages[step].id] = Number(selected);
      announce();
      if (step + 1 < scenario.stages.length) {
        active.step++;
        render(true);
        return;
      }
      const submit = event.target.querySelector('[type="submit"]');
      submit.disabled = true;
      pending = true;
      try {
        const { progress, scenarioResult } = await api('training-update', { scenarioAttempt: { scenarioId: scenario.id, answers } });
        saved = progress.scenarios;
        active.result = scenarioResult;
        render(true);
      } catch (error) {
        announce(error.message || 'The practice result could not be saved.');
      } finally {
        pending = false;
        submit.disabled = false;
      }
    });

    return { show: () => { if (!catalog) void load(); } };
  }

  window.SdrTrainingPipeline = { mount };
})();
