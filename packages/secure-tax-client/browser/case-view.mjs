import { caseSnapshot } from '../case-model.mjs';
const node=(document,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
const actions={'case.create':'Case created','request.add':'Document requested','document.review':'Document decision recorded','draft.link':'Draft linked'};

/** Only controller-verified case bodies enter this projection. Historical firm
 * decisions remain visible, but current dependency freshness controls readiness. */
export function renderCase(document,record,records){
  const section=node(document,'section');section.className='certified-tax-case';
  if(!record?.verifiedCase){section.append(node(document,'p','This case’s firm review could not be verified. Refresh its current shared revision before relying on its status.'));return section;}
  const body=record.verifiedCase,snapshot=caseSnapshot(body,records);section.dataset.caseReady=String(snapshot.ready);section.append(node(document,'h4',`${body.title} · ${body.year} Form ${body.kind}`),node(document,'p','Firm-reviewed case decisions, verified locally from this client’s encrypted records.'));
  section.append(node(document,'p',snapshot.ready?'All requested documents match reviewed revisions and the linked draft is current. Tax coverage, client authorization and filing still need their own review.':'Requested documents or the linked draft need review. This status does not authorize filing.'));
  const requests=node(document,'div');requests.className='case-requests';requests.append(node(document,'h4','Requested records'));
  for(const request of snapshot.requests){
    const row=node(document,'article');row.dataset.freshness=request.freshness;row.className='case-request';row.append(node(document,'h5',request.title));
    const status=request.freshness==='unreviewed'?'Awaiting document review':request.freshness==='unavailable'?'Referenced document unavailable — review is not current':request.freshness==='stale'?'Changed since review — needs review again':request.review.decision==='reviewed'?'Reviewed — current exact revision':'Replacement requested — current reviewed revision';
    row.append(node(document,'p',status));if(request.due)row.append(node(document,'p',`Staff target date: ${request.due}`));if(request.notes)row.append(node(document,'p',`Client-visible request note: ${request.notes}`));
    if(request.review){row.append(node(document,'small',`Recorded decision: ${request.review.at} · revision ${request.review.document.revision}`));if(request.review.notes)row.append(node(document,'p',`Historical review note: ${request.review.notes}`));}requests.append(row);
  }
  if(!snapshot.requests.length)requests.append(node(document,'p','No document requests have been approved for this case.'));section.append(requests);
  const draft=node(document,'p',!snapshot.draft?'No draft is linked':snapshot.draft.freshness==='current'?`Linked draft is current — exact revision ${snapshot.draft.reference.revision}`:snapshot.draft.freshness==='stale'?'Linked draft changed — link the current draft again':'Linked draft is unavailable');draft.className='case-draft';draft.dataset.freshness=snapshot.draft?.freshness??'unlinked';section.append(draft);
  const history=node(document,'details');history.append(node(document,'summary','Verified firm review history'));for(const event of body.history.slice(-100))history.append(node(document,'p',`${event.at} · ${actions[event.type]} · ${event.actor}${event.notes?` · ${event.notes}`:''}`));if(body.history.length>100)history.append(node(document,'p','The latest 100 verified events are shown. Earlier events remain in the encrypted case.'));section.append(history);return section;
}
