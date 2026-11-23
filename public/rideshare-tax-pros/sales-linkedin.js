(() => {
  'use strict';
  function searchURL(kind, keywords) {
    const category = kind === 'companies' ? 'companies' : 'people';
    const url = new URL(`https://www.linkedin.com/search/results/${category}/`);
    url.searchParams.set('keywords', keywords);
    return url.href;
  }

  const form = document.querySelector('#sales-linkedin-search');
  if (!form) return;
  const keywords = form.elements.keywords;
  keywords.addEventListener('input', () => keywords.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = keywords.value.trim();
    if (!query) {
      keywords.setCustomValidity('Enter a role, company, industry, or location.');
      keywords.reportValidity();
      return;
    }
    window.open(searchURL(event.submitter?.value, query), '_blank', 'noopener,noreferrer');
  });

  window.SdrLinkedIn = {
    office(office, links) {
      if (!links || !office.town) return;
      const query = [office.town, office.locality, office.state].filter(Boolean).join(' ').slice(0, 240);
      const anchor = document.createElement('a');
      anchor.href = searchURL('people', query);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = 'Find people on LinkedIn ↗';
      links.append(anchor);
    },
  };
})();
