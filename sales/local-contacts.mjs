import { HttpError, digest, https, text } from './model.mjs';
import { researchOffice } from './research.mjs';

const privateDirectory = /(^|\.)(?:whitepages|spokeo|beenverified|truepeoplesearch|fastpeoplesearch|thatsthem|peoplefinders|intelius|radaris)\./i;
function businessURL(value) {
  try { const url = new URL(https(value)); return privateDirectory.test(url.hostname) ? null : url.href; } catch { return null; }
}
export function publishedCandidateContacts(candidate, checkedAt) {
  const sourceURL = candidate.sourceURL || candidate.url;
  if (!sourceURL) return [];
  return ['contact','phone','email'].flatMap(field => {
    const value = candidate[field]; if (!value) return [];
    return [{ id:digest(`${field}:${value}:${sourceURL}`).slice(0,20), field, value, sourceURL:field === 'contact' ? candidate.contactSourceURL || sourceURL : sourceURL,
      checkedAt, confidence:'published', scope:field === 'contact' ? 'listed_person' : 'business', role:field === 'contact' ? candidate.contactRole || 'unverified' : undefined,
      excerpt:field === 'contact' ? 'Listed contact or principal; role and connection need review.' : 'Published business contact channel; not automatically a direct line to the named person.' }];
  });
}
export async function researchLocalContacts(candidate, body, { search = async () => [], researcher = researchOffice, now = Date.now } = {}) {
  const checkedAt = new Date(now()).toISOString(), known = publishedCandidateContacts(candidate, checkedAt);
  const context = { name:candidate.name, address:candidate.address, city:candidate.city, state:candidate.state, contact:candidate.contact || '', contactRole:candidate.contactRole || 'unverified' };
  if (!body.website) {
    const query = [candidate.contact ? `"${candidate.contact}"` : '', `"${candidate.name}"`, candidate.city, candidate.state, 'tax accounting official business contact'].filter(Boolean).join(' ').slice(0,500);
    let found = [], issues = [];
    try { found = await search(query); }
    catch { issues = [{ message:'Website search is unavailable. Enter a confirmed business website to continue.' }]; }
    const candidates = [...new Map((Array.isArray(found) ? found : []).flatMap(item => {
      const url = businessURL(item.url); return url ? [[url,{ url, title:String(item.title || url).slice(0,240), snippet:String(item.snippet || '').slice(0,400) }]] : [];
    })).values()].slice(0,8);
    const google = new URL('https://www.google.com/search'); google.searchParams.set('q',query);
    const linkedin = new URL('https://www.linkedin.com/search/results/people/'); linkedin.searchParams.set('keywords',[candidate.contact,candidate.name,candidate.city,candidate.state].filter(Boolean).join(' '));
    return { context, checkedAt, evidence:known, needsWebsiteSelection:true, candidates, searchLinks:[{label:'Search business sources',url:google.href},{label:'Find professional profile',url:linkedin.href}], issues,
      message:'Confirm the business and person match before choosing the official website. Search results alone do not establish an affiliation.' };
  }
  if (body.websiteReviewed !== true) throw new HttpError(400,'Confirm that this is the business’s official website before reading its contact pages.');
  const website = businessURL(text(body.website,700,true));
  if (!website) throw new HttpError(400,'Choose a public business website. Personal lookup directories are not business contact sources.');
  const report = await researcher({ town:candidate.name, locality:candidate.city, state:candidate.state, contact_name:candidate.contact || '', notes:JSON.stringify({ address:candidate.address, website }) });
  const evidence = [...known, ...(report.evidence || []).map(item => ({ ...item, scope:item.field === 'contact' ? 'listed_person' : 'business' }))];
  return { context, checkedAt, website, evidence:[...new Map(evidence.map(item => [`${item.field}:${item.value}:${item.sourceURL}`,item])).values()],
    pages:report.pages || [], issues:report.issues || [], ownership:report.ownership, needsWebsiteSelection:false, requiresReview:true,
    message:'Website research complete. Check each published source before preparing a record; mailbox deliverability and the named person’s role remain unverified.' };
}
