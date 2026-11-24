(() => {
  'use strict';
  function node(tag, value, className) {
    const result = document.createElement(tag);
    if (value) result.textContent = value;
    if (className) result.className = className;
    return result;
  }

  function external(url, label) {
    if (!url) return null;
    return window.SdrTerritoryFacilities.sourceLink(url, label);
  }

  function stars(value) {
    const rating = node('span', '', 'facility-review-stars');
    const star = node('span', '★');
    star.setAttribute('aria-hidden', 'true');
    rating.append(star, node('span', value + ' / 5'));
    rating.setAttribute('aria-label', value + ' out of 5 stars');
    return rating;
  }

  function reviewCard(review) {
    const card = node('li', '', 'facility-review-card');
    const header = node('div', '', 'facility-review-author');
    if (review.author.photo) {
      const photo = node('img');
      photo.src = review.author.photo;
      photo.alt = '';
      photo.loading = 'lazy';
      photo.referrerPolicy = 'no-referrer';
      photo.addEventListener('error', () => photo.remove(), { once: true });
      header.append(photo);
    }
    const identity = node('div');
    identity.append(external(review.author.url, review.author.name) || node('strong', review.author.name));
    if (review.relativeTime) identity.append(node('small', review.relativeTime));
    header.append(identity, stars(review.rating));
    card.append(header);
    if (review.text || review.originalText) card.append(node('p', review.text || review.originalText, 'facility-review-text'));
    if (review.text && review.originalText && review.text !== review.originalText) {
      const original = node('details', '', 'facility-review-original');
      original.append(node('summary', 'Translated by Google · Original text'), node('p', review.originalText, 'facility-review-text'));
      card.append(original);
    }
    const link = external(review.url, 'View review on Google Maps');
    if (link) card.append(link);
    return card;
  }

  function reviewColumn(title, range, reviews, tone) {
    const column = node('section', '', 'facility-review-column');
    column.dataset.tone = tone;
    const header = node('div', '', 'facility-review-column-head');
    header.append(node('h4', title), node('span', range + ' stars · ' + reviews.length));
    column.append(header);
    if (reviews.length) {
      const list = node('ul');
      list.append(...reviews.map(reviewCard));
      column.append(list);
    } else column.append(node('p', 'No matching reviews in this sample.'));
    return column;
  }

  const reviewGroups = [
    { key: 'positive', label: 'Positive', range: '4–5', includes: rating => rating >= 4 },
    { key: 'negative', label: 'Negative', range: '1–2', includes: rating => rating <= 2 },
    { key: 'mixed', label: 'Mixed', range: '3', includes: rating => rating === 3 },
  ];

  function reviewFilters(reviews, status) {
    const filters = node('div', '', 'facility-review-filters');
    const search = node('input');
    search.type = 'search';
    search.maxLength = 120;
    search.dataset.facilityReviewSearch = '';
    const rating = node('select');
    rating.dataset.facilityReviewStars = '';
    const searchLabel = node('label', 'Search review text');
    const ratingLabel = node('label', 'Review stars');
    searchLabel.append(search);
    ratingLabel.append(rating);
    filters.append(searchLabel, ratingLabel);
    rating.add(new Option('All stars', ''));
    for (const group of reviewGroups) rating.add(new Option(group.range + ' stars · ' + group.label, group.key));

    const results = node('div', '', 'facility-review-results');
    const searchable = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    function update() {
      const terms = searchable(search.value).trim().split(/\s+/).filter(Boolean);
      const rows = reviews.filter(review => {
        const text = searchable([review.text, review.originalText].filter(Boolean).join(' '));
        return terms.every(term => text.includes(term));
      });
      const group = reviewGroups.find(group => group.key === rating.value);
      if (group || terms.length) {
        const matches = group ? rows.filter(review => group.includes(review.rating)) : rows;
        status.textContent = `Showing ${matches.length} of ${reviews.length} reviews in Google’s relevance-ordered sample.`;
        if (group) {
          results.replaceChildren(reviewColumn(group.label, group.range, matches, group.key));
          return;
        }
      } else {
        status.textContent = 'Showing ' + reviews.length + (reviews.length === 1 ? ' review' : ' reviews') + ' from Google’s relevance-ordered sample, grouped by stars.';
      }
      const split = node('div', '', 'facility-review-split');
      const column = group => reviewColumn(group.label, group.range, rows.filter(review => group.includes(review.rating)), group.key);
      split.append(...reviewGroups.slice(0, 2).map(column));
      results.replaceChildren(split);
      const mixed = reviewGroups[2];
      if (rows.some(review => mixed.includes(review.rating))) results.append(column(mixed));
    }
    search.addEventListener('input', update);
    rating.addEventListener('change', update);
    update();
    return [filters, results];
  }

  function summaryCard(summary) {
    const card = node('section', '', 'facility-review-summary');
    const links = node('div', '', 'facility-review-source-links');
    links.append(...[
      external('https://support.google.com/local-listings/answer/9851099', 'About this summary'),
      external(summary.reportURL, 'Report summary'),
      external(summary.reviewsURL, 'See reviews'),
    ].filter(Boolean));
    card.append(node('h4', 'Review summary'), node('p', summary.text, 'facility-review-text'),
      node('small', summary.disclosure), links);
    return card;
  }

  function mapSearch(facility) {
    const url = new URL('https://www.google.com/maps/search/');
    const parts = [facility.name, facility.address, facility.city, facility.state, facility.zip].filter(Boolean);
    url.searchParams.set('api', '1');
    url.searchParams.set('query', parts.join(', '));
    return url.href;
  }

  function mount(dialog, api, draft) {
    const panel = dialog.querySelector('[data-facility-reviews]');
    const find = name => panel.querySelector('[data-facility-review-' + name + ']');
    const status = find('status'), rating = find('rating'), content = find('content');
    const maps = find('link'), retry = find('retry'), select = find('focus'), preview = find('preview');
    const draftButton = find('draft');
    let parameters, identity, active = 0, loaded = false, pending = false;

    function render(report) {
      if (report.url) maps.href = report.url;
      if (report.status !== 'ready') {
        const messages = {
          unconfigured: 'In-app reviews need a Google Places connection. You can open this facility in Google Maps.',
          unmatched: 'A Google Maps listing could not be matched to this location. Open Google Maps to check.',
          unavailable: 'Google reviews are temporarily unavailable for this location.',
        };
        status.textContent = messages[report.status] || messages.unavailable;
        retry.hidden = report.status !== 'unavailable';
        return;
      }
      if (report.rating !== null) rating.append(stars(report.rating.toFixed(1)));
      if (report.count !== null) rating.append(node('span', report.count.toLocaleString() + (report.count === 1 ? ' Google rating' : ' Google ratings')));
      if (report.rating === null && report.count === null) rating.textContent = 'No published rating';
      const { reviews } = report;
      if (!reviews.length) status.textContent = 'Google returned no individual reviews for this listing.';
      if (report.summary) content.append(summaryCard(report.summary));
      if (reviews.length) content.append(...reviewFilters(reviews, status));
      const attributions = node('div', '', 'facility-review-source-links');
      for (const provider of report.attributions) attributions.append(external(provider.url, provider.name) || node('span', provider.name));
      const policy = external('https://support.google.com/contributionpolicy/answer/7422880', 'Google Maps review policy');
      if (policy) attributions.append(policy);
      content.append(attributions);
    }

    async function load() {
      if (!parameters || loaded || pending) return;
      const current = active;
      pending = true;
      retry.hidden = true;
      status.textContent = 'Loading Google reviews…';
      try {
        const report = await api('facility-reviews', parameters);
        if (current !== active) return;
        render(report);
        loaded = report.status !== 'unavailable';
      } catch (error) {
        if (current !== active) return;
        status.textContent = error.message || 'Could not load Google reviews.';
        retry.hidden = false;
      } finally {
        if (current === active) pending = false;
      }
    }

    function reset() {
      active++;
      parameters = undefined;
      identity = undefined;
      loaded = pending = false;
      panel.open = false;
      status.textContent = '';
      rating.replaceChildren();
      content.replaceChildren();
      retry.hidden = true;
      select.value = '';
      preview.hidden = true;
    }

    select.onchange = () => {
      const option = select.selectedOptions[0];
      preview.hidden = !option?.value;
      find('example').textContent = option?.dataset.example || '';
      find('question').textContent = option?.dataset.question || '';
    };
    draftButton.onclick = () => { if (select.value) draft(select.value); };
    retry.onclick = () => void load();
    panel.addEventListener('toggle', event => { if (event.target === panel && panel.open) void load(); });

    return {
      target(facility, input) {
        const key = JSON.stringify(input);
        if (key !== identity) {
          reset();
          identity = key;
          parameters = input;
        }
        if (!loaded) maps.href = mapSearch(facility);
      },
      allowDraft(allowed, pendingDraft = false) {
        draftButton.hidden = !allowed;
        draftButton.disabled = pendingDraft;
      },
      focus() { return select.value; },
      show() {
        panel.open = true;
        panel.querySelector('summary').focus();
        void load();
      },
      reset,
    };
  }

  window.SdrFacilityReviews = { mount };
})();
