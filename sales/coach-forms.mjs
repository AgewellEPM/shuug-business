const entries = [
  ['contact', 'Contact', 'contacts', '#sales-add-rolodex-contact', '[data-rolodex-add]', 'officeId organization address city state name role title email phone mobile extension preference'],
  ['accountContact', 'Account contact', 'pipeline', '#sales-contact-form', '', 'name role title email phone mobile extension preference sourceURL sourceNote notes'],
  ['progress', 'Pipeline progress', 'pipeline', '#sales-progress-form', '', 'kind channel outcome note waitingOn nextAction nextDue'],
  ['campaign', 'Campaign', 'campaigns', '#sales-campaign-form', '', 'campaignName business offer nextStep keywords city state source limit interval postalAddress'],
  ['research', 'Business research', 'home', '#sdr-category-form', '', 'type locality state'],
  ['linkedIn', 'LinkedIn prospect', 'prospects', '#sales-save-prospect', '#sales-add-prospect', 'name company title sourceURL locality note'],
  ['facilitySearch', 'Facility search', 'facilities', 'form[data-facility-search]', '', 'state category query city'],
  ['profile', 'Sales profile', 'team', '#sales-team-profile', '[data-sdr-own-profile]', 'name bio'],
  ['support', 'Support request', 'support', 'form[data-support-form="create"]', '[data-support-action="create"]', 'subject category message'],
  ['agreement', 'Agreement email', 'contracts', '#sales-contract-compose', '', 'subject intro'],
  ['booking', 'Booking details', 'calendar', '#bk-intake', '', 'name email company phone answer notes'],
  ['inbox', 'Mailbox composer', 'email', 'form[data-email-compose-form]', '[data-email-compose]', 'to cc bcc subject body'],
];
export const coachForms = Object.fromEntries(entries.map(([key, title, view, selector, opener, fields]) =>
  [key, { title, view, selector, opener, fields: fields.split(' ') }]));

export function selectCoachForm(question, current) {
  if (!/\b(?:fill|complete|enter|put|populate|add|update|prepare|create|set)\b/i.test(question)) return;
  if (current && Object.hasOwn(coachForms, current) && /\b(?:this|current|open)\s+(?:(?:[a-z]+)\s+)?form\b/i.test(question)) return current;
  const named = Object.entries(coachForms).sort((a,b) => b[1].title.length - a[1].title.length).find(([, item]) => question.toLowerCase().includes(item.title.toLowerCase()));
  return named?.[0] || (current && Object.hasOwn(coachForms, current) && /\b(?:this|the|my) form\b/i.test(question) ? current : undefined);
}

export function statedFormFields(question, descriptor) {
  const names = new Map(descriptor.fields.map(key => [key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), key]));
  const pattern = new RegExp('\\b(' + [...names.keys()].sort((a,b) => b.length-a.length).join('|') + ')\\s*[:=]\\s*', 'gi');
  const matches = [...question.matchAll(pattern)];
  const fields = {};
  for (let n = 0; n < matches.length; n++) {
    const match = matches[n], stop = matches[n+1]?.index ?? question.length;
    const value = question.slice(match.index + match[0].length, stop).trim().replace(/[;,]$/, '').trim();
    if (value) fields[names.get(match[1].toLowerCase())] = value.slice(0, 2000);
  }
  return fields;
}
