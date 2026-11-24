(() => {
  'use strict';

  const areaNames = {
    home: 'Training Home',
    catalog: 'Course Catalog',
    paths: 'Learning Paths',
    certificates: 'Certifications',
    live: 'Live Training',
    faqs: 'FAQs',
    plan: 'My Plan',
  };
  const categoryArt = {
    'sales-prospecting': 'sales',
    'product-training': 'product',
    'healthcare-sales': 'healthcare',
    'ada-compliance': 'ada',
    'crm-tools': 'crm',
  };
  const pathArt = {
    'new-sales-rep': 'path-new',
    'healthcare-senior-living': 'path-care',
    'ada-accessibility': 'path-ada',
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const arrow = '<span aria-hidden="true">›</span>';
  const art = name => name ? `<img src="/training-art/${name}.png" alt="" class="training-icon">` : '';
  const progressBar = (value, label) => `<progress max="100" value="${value}" aria-label="${escape(label)}"></progress>`;
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  const percent = (done, total) => total ? Math.round(done / total * 100) : 0;

  function formatTime(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const leftover = minutes % 60;
    return `${Math.floor(minutes / 60)}h${leftover ? ` ${leftover}m` : ''}`;
  }

  function registrationLink(value) {
    const url = typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
      ? new URL(value, location.origin) : URL.canParse(value) && new URL(value);
    return url && (url.origin === location.origin || url.protocol === 'https:') ? url.href : '';
  }

  function mount({ api }) {
    const root = document.querySelector('.sdr-training');
    if (!root) return;
    const find = selector => root.querySelector(selector);
    const feature = find('[data-training-feature]');
    const home = find('[data-training-home]');
    const content = find('[data-training-content]');
    const status = find('[data-training-status]');
    let catalog;
    let progress = { completed: {}, sections: {}, plan: [], currentCourseId: null };
    let view = { name: 'home' };
    let loading, updating;

    const courseFor = id => catalog.courses.find(course => course.id === id);
    const pathFor = id => catalog.paths.find(path => path.id === id);
    const categoryFor = id => catalog.categories.find(category => category.id === id);
    const completion = id => progress.completed[id];
    const inPlan = id => progress.plan.includes(id);
    const finishedInPath = path => path.courseIds.filter(completion).length;
    const earnedDate = certificate => {
      const path = pathFor(certificate.pathId);
      return path?.courseIds.length && finishedInPath(path) === path.courseIds.length
        ? path.courseIds.map(completion).sort().at(-1) : '';
    };

    function announce(message = '', { retry = false, error = false } = {}) {
      if (!status) return;
      status.hidden = !message;
      status.dataset.error = String(error);
      status.innerHTML = escape(message) + (retry ? ' <button type="button" class="training-link" data-training-retry>Try again</button>' : '');
    }

    function renderMetrics() {
      const completed = catalog.courses.filter(course => completion(course.id));
      const earned = catalog.certificates.filter(earnedDate);
      const milestone = catalog.certificates.find(certificate => !earnedDate(certificate));
      const completedPercent = percent(completed.length, catalog.courses.length);
      const values = {
        progress: `${completedPercent}%`,
        completed: completed.length,
        certificates: earned.length,
        time: formatTime(completed.reduce((total, course) => total + course.durationMinutes, 0)),
        milestone: milestone?.title || 'All paths complete',
      };
      for (const [key, value] of Object.entries(values)) {
        const metric = find(`[data-training-metric="${key}"]`);
        if (metric) metric.textContent = value;
      }
      const bar = find('[data-training-progress]');
      if (bar) bar.value = completedPercent;
      const duration = find('[data-training-metric="time"]');
      if (duration) duration.title = 'Estimated duration of completed courses';
    }

    function actionFor(course) {
      if (completion(course.id)) return 'Review Course';
      if (progress.sections[course.id]) return 'Continue Training';
      return 'Start Training';
    }

    function courseAction(course, style = '') {
      return `<button type="button" class="training-button ${style}" data-training-course="${escape(course.id)}">${actionFor(course)}</button>`;
    }

    function planAction(course) {
      return `<button type="button" class="training-button" data-training-plan="${escape(course.id)}" aria-pressed="${inPlan(course.id)}">${inPlan(course.id) ? 'Remove from My Plan' : 'Add to My Plan'}</button>`;
    }

    function renderFeature() {
      const course = courseFor(catalog.featuredCourseId);
      if (!course) {
        feature.innerHTML = '<p class="training-empty">Browse the catalog for a course to start.</p>';
        return;
      }
      feature.innerHTML = `<div class="training-feature-visual">
          <img src="/training-art/featured.png" alt="" class="training-feature-art">
          <div class="training-feature-visual-title" aria-hidden="true"><strong>${escape(course.title)}</strong><span>Self-paced course</span></div>
          <button type="button" class="training-play" data-training-course="${escape(course.id)}" aria-label="${escape(actionFor(course))}">
            <span aria-hidden="true">▶</span>
          </button>
        </div>
        <div class="training-feature-description">
          <span class="training-feature-label">Featured course</span>
          <h2>${escape(course.title)}</h2>
          <p>${escape(course.description)}</p>
          <div class="training-course-meta"><span>${plural(course.durationMinutes, 'minute')}</span><span>Self-paced</span><span>${plural(course.sections.length, 'lesson')}</span></div>
          <div class="training-actions">${courseAction(course, 'training-primary')}${planAction(course)}</div>
        </div>`;
    }

    function pathRow(path) {
      const done = finishedInPath(path);
      const value = percent(done, path.courseIds.length);
      return `<button type="button" class="training-path-row" data-training-path="${escape(path.id)}" data-training-tone="${escape(pathArt[path.id] || '')}">
        ${art(pathArt[path.id])}
        <span class="training-path-description"><strong>${escape(path.title)}</strong><small>${escape(path.description)}</small></span>
        <span class="training-path-progress">${progressBar(value, `${path.title} completion`)}<strong>${value}%</strong></span>
        ${arrow}
      </button>`;
    }

    function catalogTiles() {
      return `<div class="training-categories">${catalog.categories.map(category => {
        const count = catalog.courses.filter(course => course.category === category.id).length;
        return `<button type="button" class="training-category" data-training-category="${escape(category.id)}" data-training-tone="${escape(categoryArt[category.id] || '')}">
          ${art(categoryArt[category.id])}<strong>${escape(category.title)}</strong><span>${plural(count, 'course')}</span>
        </button>`;
      }).join('')}</div>`;
    }

    function certificateRows() {
      return catalog.certificates.map(certificate => {
        const earned = earnedDate(certificate);
        const path = pathFor(certificate.pathId);
        const done = path ? finishedInPath(path) : 0;
        const progressText = earned ? `Earned ${date.format(new Date(earned))}` : `${done} of ${path?.courseIds.length ?? 0} courses complete`;
        const attr = earned ? 'certificate' : 'path';
        const id = earned ? certificate.id : certificate.pathId;
        return `<div class="training-cert-row">
          <span class="training-cert-state" data-earned="${Boolean(earned)}" aria-hidden="true">${earned ? '✓' : ''}</span>
          <div><strong>${escape(certificate.title)}</strong><small>${escape(progressText)}</small></div>
          <button type="button" class="training-button" data-training-${attr}="${escape(id)}">${earned ? 'View' : done ? 'Continue' : 'View Path'}</button>
        </div>`;
      }).join('');
    }

    function liveSessions() {
      if (!catalog.sessions?.length) {
        return '<p class="training-empty">No live training sessions are scheduled.</p>';
      }
      return catalog.sessions.map(session => {
        const registration = registrationLink(session.registrationURL);
        return `<article class="training-live-row"><div><strong>${escape(session.title)}</strong>
          <p>${escape(session.description)}</p>
          <time datetime="${escape(session.startsAt)}">${dateTime.format(new Date(session.startsAt))}</time></div>
          ${registration ? `<a class="training-button" href="${escape(registration)}">Register</a>` : ''}</article>`;
      }).join('');
    }

    function renderHome() {
      renderFeature();
      const sections = {
        paths: catalog.paths.map(pathRow).join(''),
        live: liveSessions(),
        catalog: catalogTiles(),
        certificates: certificateRows(),
      };
      for (const [name, markup] of Object.entries(sections)) {
        const node = find(`[data-training-home-section="${name}"]`);
        if (node) node.innerHTML = markup;
      }
    }

    function courseTile(course) {
      const category = categoryFor(course.category);
      return `<article class="training-course">
        <p class="training-course-summary">${escape(category?.title)} <span>${plural(course.durationMinutes, 'minute')}${completion(course.id) ? ' · Complete' : ''}</span></p>
        <h3>${escape(course.title)}</h3>
        <p>${escape(course.description)}</p>
        <div class="training-actions">${courseAction(course, 'training-primary')}${planAction(course)}</div>
      </article>`;
    }

    function courseGrid(list) {
      return `<div class="training-course-grid">${list.map(courseTile).join('')}</div>`;
    }

    function renderCatalog() {
      const selected = view.category;
      const all = [{ id: '', title: 'All Courses' }, ...catalog.categories];
      const list = catalog.courses.filter(course => !selected || course.category === selected);
      return `<div class="training-category-filters" aria-label="Course categories">${all.map(category =>
        `<button type="button" class="training-button" data-training-category="${escape(category.id)}" aria-pressed="${(selected || '') === category.id}">${escape(category.title)}</button>`
      ).join('')}</div>${courseGrid(list)}`;
    }

    function renderPath(path) {
      const done = finishedInPath(path);
      return `<p class="training-pane-intro">${escape(path.description)}</p>
        <p class="training-path-summary">${done} of ${path.courseIds.length} courses complete ${progressBar(percent(done, path.courseIds.length), 'Learning path completion')}</p>
        ${courseGrid(path.courseIds.map(courseFor).filter(Boolean))}`;
    }

    function renderCourse(course) {
      const index = course.sections.findIndex(section => section.id === view.sectionId);
      const section = course.sections[index];
      const previous = course.sections[index - 1];
      const next = course.sections[index + 1];
      return `<p class="training-pane-intro">${escape(course.description)}</p>
        <p class="training-course-meta">${plural(course.durationMinutes, 'minute')} · ${completion(course.id) ? 'Course complete' : `Lesson ${index + 1} of ${course.sections.length}`}</p>
        <div class="training-lesson-layout">
          <nav class="training-lesson-nav" aria-label="Course lessons">${course.sections.map((item, position) =>
            `<button type="button" data-training-section="${escape(item.id)}"${section.id === item.id ? ' aria-current="step"' : ''}>${position + 1}. ${escape(item.title)}</button>`
          ).join('')}</nav>
          <article class="training-lesson">
            <h3 tabindex="-1" data-training-lesson-title>${escape(section.title)}</h3>
            <ol>${section.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>
            <div class="training-actions">
              ${previous ? `<button type="button" class="training-button" data-training-section="${escape(previous.id)}">Previous Lesson</button>` : ''}
              ${next ? `<button type="button" class="training-button training-primary" data-training-section="${escape(next.id)}">Next Lesson</button>` :
                completion(course.id) ? '<p class="training-completed-note" role="status">Course complete</p>' :
                  `<button type="button" class="training-button training-primary" data-training-complete="${escape(course.id)}">Complete Course</button>`}
            </div>
          </article>
        </div>`;
    }

    function renderCertificate(certificate) {
      const earned = earnedDate(certificate);
      return `<div class="training-certificate">
        ${art('certificate')}
        <h3>${escape(certificate.title)}</h3>
        <p>${escape(certificate.description)}</p>
        <strong>Earned ${date.format(new Date(earned))}</strong>
      </div>`;
    }

    function paneTitle() {
      if (view.name === 'path') return pathFor(view.pathId).title;
      if (view.name === 'course') return courseFor(view.courseId).title;
      if (view.name === 'certificate') return 'Certificate';
      return areaNames[view.name];
    }

    function paneBody() {
      if (view.name === 'catalog') return renderCatalog();
      if (view.name === 'paths') return catalog.paths.map(pathRow).join('');
      if (view.name === 'path') return renderPath(pathFor(view.pathId));
      if (view.name === 'course') return renderCourse(courseFor(view.courseId));
      if (view.name === 'certificates') return certificateRows();
      if (view.name === 'certificate') return renderCertificate(catalog.certificates.find(certificate => certificate.id === view.certificateId));
      if (view.name === 'live') return liveSessions();
      if (view.name === 'plan') return progress.plan.length ? courseGrid(progress.plan.map(courseFor).filter(Boolean)) :
        '<p class="training-empty">Add courses from the catalog to start your plan.</p><button class="training-button training-primary" type="button" data-training-open="catalog">Browse Courses</button>';
      return catalog.faqs.map(item => `<details class="training-faq"><summary>${escape(item.question)}</summary><p>${escape(item.answer)}</p></details>`).join('');
    }

    function render() {
      if (!catalog) return;
      const isHome = view.name === 'home';
      const area = view.area || view.name;
      for (const button of root.querySelectorAll('.training-hub [data-training-nav]')) {
        if (button.dataset.trainingNav === area) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      feature.hidden = !isHome;
      home.hidden = !isHome;
      content.hidden = isHome;
      renderMetrics();
      if (isHome) renderHome();
      else content.innerHTML = `${view.back ? '<button type="button" class="training-link training-back" data-training-back><span aria-hidden="true">← </span>Back</button>' : ''}
        <h2 tabindex="-1" data-training-pane-title>${escape(paneTitle())}</h2>${paneBody()}`;
    }

    function go(next, focus = true) {
      view = next;
      render();
      if (focus) (view.name === 'home' ? find('.training-hub [aria-current="page"]') : find('[data-training-pane-title]'))?.focus();
    }

    function load() {
      if (loading) return loading;
      if (!catalog) {
        root.setAttribute('aria-busy', 'true');
        announce('Loading training…');
      }
      loading = api('training-progress').then(result => {
        ({ catalog, progress } = result);
        render();
        announce();
      }).catch(() => {
        announce('Training could not be loaded.', { retry: true, error: true });
      }).finally(() => {
        loading = undefined;
        root.removeAttribute('aria-busy');
      });
      return loading;
    }

    function save(change, { notice = '', refresh = false, button, focus = false } = {}) {
      if (button) button.disabled = true;
      const original = view;
      const job = (updating || Promise.resolve()).then(async () => {
        try {
          ({ progress } = await api('training-update', change));
          if (refresh) render();
          if (view === original) {
            if (focus) find('[data-training-pane-title]')?.focus();
            else if (refresh && button?.dataset.trainingPlan) {
              const id = button.dataset.trainingPlan;
              [...root.querySelectorAll('[data-training-plan]')].find(item => item.dataset.trainingPlan === id)?.focus();
            }
          }
          announce(notice);
        } catch (error) {
          announce(error.message || 'Training progress could not be saved.', { error: true });
        } finally {
          if (updating === job) updating = undefined;
          if (button) button.disabled = false;
        }
      });
      updating = job;
      return job;
    }

    function openCourse(courseId) {
      const course = courseFor(courseId);
      if (!course) return;
      const section = course.sections.find(item => item.id === progress.sections[courseId]) || course.sections[0];
      go({ name: 'course', courseId, sectionId: section.id, area: view.area || view.name, back: view });
      if (progress.currentCourseId !== courseId || progress.sections[courseId] !== section.id || updating) {
        void save({ courseId, sectionId: section.id });
      }
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-training-retry')) {
        void load();
        return;
      }
      if (!catalog) return;
      const { trainingNav, trainingOpen, trainingCategory, trainingPath, trainingCourse, trainingSection, trainingPlan, trainingComplete, trainingCertificate } = button.dataset;
      const area = trainingNav || trainingOpen;
      if (Object.hasOwn(areaNames, area)) go({ name: area });
      else if (button.hasAttribute('data-training-back') && view.back) go(view.back);
      else if (trainingCategory !== undefined) go({ name: 'catalog', category: trainingCategory });
      else if (trainingPath && pathFor(trainingPath)) go({ name: 'path', pathId: trainingPath, area: 'paths', back: view });
      else if (trainingCourse) openCourse(trainingCourse);
      else if (trainingSection && view.name === 'course') {
        view = { ...view, sectionId: trainingSection };
        render();
        find('[data-training-lesson-title]')?.focus();
        void save({ courseId: view.courseId, sectionId: trainingSection });
      } else if (trainingPlan) {
        const remove = inPlan(trainingPlan);
        void save({ planChanges: { [remove ? 'remove' : 'add']: [trainingPlan] } },
          { notice: remove ? 'Removed from My Plan.' : 'Added to My Plan.', refresh: true, button });
      } else if (trainingComplete) {
        void save({ courseId: trainingComplete }, { notice: 'Course complete.', refresh: true, button, focus: true });
      } else if (trainingCertificate) {
        const certificate = catalog.certificates.find(item => item.id === trainingCertificate);
        if (certificate && earnedDate(certificate)) go({ name: 'certificate', certificateId: certificate.id, area: 'certificates', back: view });
      }
    });

    return {
      show(section) {
        if (Object.hasOwn(areaNames, section)) go({ name: section }, false);
        if (!catalog && !updating) return load();
      },
    };
  }

  window.SdrTraining = { mount };
})();
