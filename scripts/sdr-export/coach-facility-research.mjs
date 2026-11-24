import { STATES } from '../../sales/model.mjs';
import { REGISTRIES } from '../../sales/registry-catalog.mjs';

const regions = Object.entries(REGISTRIES).map(([code, { name }]) => ({ code, name }))
  .sort((left, right) => right.name.length - left.name.length);
const counts = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
const spokenNumber = /\b(one|two|three|four|five|six|seven|eight|nine) hundred(?: (?:and )?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten))?\b/gi;
const cmsSource = { title: 'CMS Care Compare provider data', href: 'https://data.cms.gov/provider-data/dataset/4pq5-n9py' };
const reply = (answer, navigation, sources = []) => ({ mode: 'workflow', answer, sources, draft: null, ...(navigation ? { navigation } : {}) });

function regionFrom(question, fallback) {
  for (const { name, code } of regions) {
    if (new RegExp('(?:\\b(?:in|for|across|state of) |,\\s*)' + name + '\\b', 'i').test(question)) return code;
  }
  const abbreviation = /(?:\b(?:in|across|state of) |,\s*)([A-Z]{2})\b/.exec(question)?.[1];
  return STATES.includes(abbreviation) ? abbreviation : STATES.includes(fallback) ? fallback : '';
}

function filtersFor(question) {
  const phrase = question.replace(spokenNumber, (_, hundreds, ones) => {
    const part = ones?.toLowerCase();
    return counts.indexOf(hundreds.toLowerCase()) * 100 + (Number(part) || Math.max(0, counts.indexOf(part)));
  });
  const number = '(\\d{1,4})';
  const range = new RegExp('\\b(?:between )?' + number + ' (?:to|and|through) ' + number + ' (?:certified )?beds?\\b', 'i').exec(phrase);
  const minimum = new RegExp('(?:at least |minimum(?: of)? |more than |over )' + number + ' (?:certified )?beds?|\\b' + number + '(?:\\s*\\+| beds? or more)', 'i').exec(phrase);
  const maximum = new RegExp('(?:at most |maximum(?: of)? |up to |fewer than |less than |under )' + number + ' (?:certified )?beds?|\\b' + number + ' beds? or fewer', 'i').exec(phrase);
  const exact = /\b(\d{1,4}) (?:certified )?beds?\b/i.exec(phrase)?.[1];
  const cms = /\bcms(?: overall)?(?: rating)?(?: of)?(?: (?:at most|up to|under))?\s*([1-5]|one|two|three|four|five)(?:[- ]star(?:s)?)?\b/i.exec(phrase);
  const maxCmsRating = cms ? (Number(cms[1]) || counts.indexOf(cms[1].toLowerCase())) - (/\bunder\b/i.test(cms[0]) ? 1 : 0) : undefined;
  const minBeds = range ? Number(range[1]) : minimum ? Number(minimum[1] || minimum[2]) + (/^(?:more than|over)/i.test(minimum[0]) ? 1 : 0) : !maximum && exact ? Number(exact) : undefined;
  const maxBeds = range ? Number(range[2]) : maximum ? Number(maximum[1] || maximum[2]) - (/^(?:fewer than|less than|under)/i.test(maximum[0]) ? 1 : 0) : !minimum && exact ? Number(exact) : undefined;
  return { minBeds, maxBeds, maxCmsRating };
}

function describe(row, includeRating = true) {
  const beds = row.certifiedBeds ?? row.cms?.beds;
  const rating = row.cmsRating ?? row.cms?.overallRating;
  const location = [row.name, row.city].filter(Boolean).join(', ');
  const figure = Number.isInteger(beds) ? beds + ' CMS-certified beds' : 'certified bed count unavailable';
  return location + ', ' + figure + (includeRating && Number.isInteger(rating) ? ', CMS overall ' + rating + ' out of 5' : '');
}

function toResults(params) {
  const query = new URLSearchParams({ view: 'prospects', facility: params.category, state: params.state.toLowerCase() });
  if (params.query) query.set('query', params.query);
  if (params.minBeds !== undefined) query.set('minbeds', params.minBeds);
  if (params.maxBeds !== undefined) query.set('maxbeds', params.maxBeds);
  if (params.maxCmsRating !== undefined) query.set('maxcms', params.maxCmsRating);
  return { title: 'facility research results', href: '#' + query };
}

export async function handleFacilityResearch(user, crm, question, screen) {
  if (!crm) return;
  const active = screen?.view === 'prospects' ? screen.facilityResearch : undefined;
  const selected = active?.selected;
  if (/^(?:please )?(?:open|show(?: me)?|check|pull up) (?:the )?google (?:maps )?reviews[.!?]*$/i.test(question)) {
    return selected ? reply('Opening Google reviews for this facility. The review panel has controls for lower-star reviews and searching the available sample.',
      { title: 'the facility’s Google reviews', href: '#view=prospects&review=google' })
      : reply('Open a facility profile in Prospects, then say “open Google reviews.”');
  }
  const lookup = /^(?:please )?(?:how many (?:certified )?beds (?:does|are at|are in)\s+(.+?)(?: (?:currently )?have(?: right now)?)?[.!?]*|(?:read|check|look up|what(?:['’]s| is)) (?:the )?(?:certified )?bed count(?: (?:for|at) (.+?))?[.!?]*)$/i.exec(question);
  const search = /^(?:please )?(?:(?:find|show me|list|search for|look up)\b.+\b(?:nursing homes?|skilled nursing (?:homes?|facilit(?:y|ies))|senior (?:community )?centers?)|(?:find|show me|list) facilities\b.+\b(?:beds?|cms|ratings?|reviews?))/i.test(question);
  if (!lookup && !search) return;
  const target = (lookup?.[1] || lookup?.[2] || '').trim();
  const useSelected = lookup && selected && (!target || /^(?:this|the (?:open|selected|current)) (?:facility|organization|nursing home|account|prospect)$/i.test(target));
  const state = regionFrom(question, useSelected ? selected.state : active?.state) || (user.states?.length === 1 ? user.states[0] : '');
  if (!state) return reply('Which state should I search? For example, say “find nursing homes in Alabama with at least 100 beds.”');
  const category = useSelected ? selected.category : /\bsenior (?:community )?centers?\b/i.test(question) ? 'senior-center' : 'nursing-home';
  const explicitName = /\b(?:named|called) (.+?)(?=\s+(?:in|with|having)\s|[.!?]*$)/i.exec(question)?.[1] || '';
  const name = (lookup ? target : explicitName).replace(/\s+in (?:the state of )?.+$/i, '').trim().slice(0, 100);
  if (lookup && !useSelected && (!name || /^(?:this|the)\b/i.test(name))) return reply('Open the facility profile or give me its name and state.');
  const params = useSelected ? { state, category, sourceURL: selected.sourceURL } : { state, category, query: name, ...filtersFor(question) };
  let report;
  try {
    report = await crm(user, 'territory-facilities', params);
  } catch (error) {
    if (error.status >= 400 && error.status < 500) return reply(error.message);
    return reply('The facility directory did not return results. Try again in a moment.');
  }
  if (lookup && report.total === 1 && report.results.length) {
    const row = report.results[0], date = row.cms?.processingDate;
    return reply(describe(row) + '.' + (date ? ' CMS processing date ' + date + '.' : '') +
      ' Certified beds are published capacity.', undefined, category === 'nursing-home' ? [cmsSource] : []);
  }
  if (lookup && report.total > 1) return reply('I found ' + report.total + ' matching facilities. Say the full name and city.');
  const stateName = REGISTRIES[state]?.name || state;
  const sample = report.results.slice(0, 3).map(row => describe(row)).join('. ');
  const wantsReviews = /\b(?:google|bad|negative|poor|low)[ -]+(?:google )?reviews?\b/i.test(question) ||
    params.maxCmsRating === undefined && /\b(?:ratings?|stars?)\b/i.test(question);
  const reviewHelp = wantsReviews
    ? ' Open an individual facility’s Google reviews to inspect the available customer feedback.' : '';
  const answer = (report.total ? report.total + ' ' + (report.total === 1 ? 'facility matches' : 'facilities match') + ' in ' + stateName + '. ' + sample + '.'
    : 'No facilities matched in ' + stateName + '.') + reviewHelp;
  return reply(answer, toResults(params), category === 'nursing-home' ? [cmsSource] : []);
}
