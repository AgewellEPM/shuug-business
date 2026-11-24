(() => {
  'use strict';

  function mount() {
    const root = document.querySelector('.sdr-mission');
    if (!root) return;
    const form = root.querySelector('[data-mission-search]');
    const input = form.elements.query;
    const clear = form.querySelector('button');
    const results = root.querySelector('[data-mission-results]');
    const status = results.querySelector('[data-mission-result-status]');
    const links = results.querySelector('[data-mission-result-links]');
    const topics = new Map([...root.querySelectorAll('[data-mission-topic]')].map(section => [
      section.dataset.missionTopic,
      { title: section.querySelector('h2'), text: section.textContent.toLocaleLowerCase() },
    ]));

    function search() {
      const words = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      results.hidden = clear.hidden = words.length === 0;
      links.replaceChildren();
      if (results.hidden) return;

      for (const [id, topic] of topics) {
        if (!words.every(word => topic.text.includes(word))) continue;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#view=mission&section=' + id;
        link.textContent = topic.title.textContent;
        item.append(link);
        links.append(item);
      }
      const count = links.childElementCount;
      status.textContent = count ? count + ' matching ' + (count === 1 ? 'section' : 'sections') : 'No matching sections.';
    }

    input.addEventListener('input', search);
    form.addEventListener('submit', event => { event.preventDefault(); search(); });
    clear.addEventListener('click', () => { input.value = ''; search(); input.focus(); });

    function show(section) {
      const topic = topics.get(section);
      if (!topic) return;
      input.value = '';
      search();
      topic.title.focus({ preventScroll: true });
      topic.title.scrollIntoView?.({ block: 'start' });
    }

    links.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link?.hash === location.hash) {
        event.preventDefault();
        show(new URLSearchParams(link.hash.slice(1)).get('section'));
      }
    });
    return { show };
  }

  window.SdrMission = { mount };
})();
