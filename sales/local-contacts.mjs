import { HttpError, digest, https, text } from './model.mjs';
import { researchOffice } from './research.mjs';
import { lookupBusinessPlaces } from './business-places.mjs';

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
export async function researchLocalContacts(candidate, body, { search = async () => [], researcher = researchOffice, placeLookup = lookupBusinessPlaces, now = Date.now } = {}) {
  const checkedAt = new Date(now()).toISOString(), known = publishedCandidateContacts(candidate, checkedAt);
  const context = { name:candidate.name, address:candidate.address, city:candidate.city, state:candidate.state, contact:candidate.contact || '', contactRole:candidate.contactRole || 'unverified' };
  let catalogue, catalogueIssues=[];
  try { catalogue=await placeLookup(candidate); }
  catch { catalogueIssues=[{message:'The published business-contact catalogue could not be checked. Its missing results do not establish that the office has no contacts.'}]; }
  const catalogueEvidence=(catalogue?.evidence || []).map(item=>({...item,checkedAt}));
  const catalogueSummary=catalogue?{status:catalogue.status,release:catalogue.release,sourceName:catalogue.sourceName,sourceURL:catalogue.sourceURL,attribution:catalogue.attribution,attributionURL:catalogue.attributionURL,matches:catalogue.matches,limits:catalogue.limits}:undefined;
  if (!body.website) {
    const query = [candidate.contact ? `"${candidate.contact}"` : '', `"${candidate.name}"`, candidate.city, candidate.state, 'tax accounting official business contact'].filter(Boolean).join(' ').slice(0,500);
    let found = catalogue?.candidates || [], issues = [...catalogueIssues], queries = [], unconfirmed=false;
    const searchQuery=async value=>{const reply=await search(value);if(reply?.status==='unconfirmed')unconfirmed=true;return Array.isArray(reply)?reply:Array.isArray(reply?.results)?reply.results:[];};
    try { if(!found.length) {
      queries.push(query);
      found = await searchQuery(query);
      if (!Array.isArray(found) || !found.length) {
        const simpler = [candidate.name,candidate.city,candidate.state].filter(Boolean).join(' ').slice(0,500);
        if(simpler!==query){queries.push(simpler);found=await searchQuery(simpler);}
      }
    } }
    catch { issues.push({ message:'Automatic web search could not confirm a result. Use the business search links or enter a confirmed business website. Published contact details remain available.' }); }
    if(!found.length && unconfirmed)issues.push({message:'The free web search returned no confirmed result; its provider does not distinguish an empty search from a failed search. Use the business search links or enter the official website.'});
    const candidates = [...new Map((Array.isArray(found) ? found : []).flatMap(item => {
      const url = businessURL(item.url); return url ? [[url,{ ...item, url, title:String(item.title || url).slice(0,240), snippet:String(item.snippet || '').slice(0,400) }]] : [];
    })).values()].slice(0,8);
    const google = new URL('https://www.google.com/search'); google.searchParams.set('q',query);
    const linkedin = new URL('https://www.linkedin.com/search/results/people/'); linkedin.searchParams.set('keywords',[candidate.contact,candidate.name,candidate.city,candidate.state].filter(Boolean).join(' '));
    return { context, checkedAt, evidence:[...known,...catalogueEvidence], catalogue:catalogueSummary, needsWebsiteSelection:true, candidates, websiteSearch:{status:candidates.length?'results':issues.length?'unavailable':'no_results',queries}, searchLinks:[{label:'Search business sources',url:google.href},{label:'Find professional profile',url:linkedin.href}], issues,
      message:candidates.length?'Confirm the business and person match before choosing the official website. Search results alone do not establish an affiliation.':'No automatic website suggestions were returned. Use the business search links or enter its official website. Published directory contacts remain available below.' };
  }
  if (body.websiteReviewed !== true) throw new HttpError(400,'Confirm that this is the business’s official website before reading its contact pages.');
  const website = businessURL(text(body.website,700,true));
  if (!website) throw new HttpError(400,'Choose a public business website. Personal lookup directories are not business contact sources.');
  const report = await researcher({ town:candidate.name, locality:candidate.city, state:candidate.state, contact_name:candidate.contact || '', notes:JSON.stringify({ address:candidate.address, website }) });
  const evidence = [...known,...(report.evidence || []).map(item => ({ ...item, scope:item.field === 'contact' ? 'listed_person' : 'business' })),...catalogueEvidence];
  return { context, checkedAt, website, catalogue:catalogueSummary, evidence:[...new Map(evidence.map(item => [`${item.field}:${item.value}:${item.sourceURL}`,item])).values()],
    pages:report.pages || [], issues:[...catalogueIssues,...(report.issues || [])], ownership:report.ownership, needsWebsiteSelection:false, requiresReview:true,
    message:'Website research complete. Check each published source before preparing a record; mailbox deliverability and the named person’s role remain unverified.' };
}
