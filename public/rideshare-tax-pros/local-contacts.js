(() => {
  'use strict';
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const safe = value => { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password ? u.href : ''; } catch { return ''; } };
  const link = (url,label) => safe(url) ? `<a href="${e(safe(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : '';
  const labels = {contact:'Listed person',email:'Business email',phone:'Business phone'};
  window.GigTaxLocalContacts = {
    mount({host,candidate,api,status,onPrepare}) {
      let generation=0,report;
      host.innerHTML=`<h4>Find business contacts</h4><p data-local-contact-context></p><p>Find published business email, phone and professional roles. Review the sources before preparing a contact record.</p><button type="button" class="button secondary" data-local-contact-search>Find contact sources</button><form class="sales-form" data-local-contact-form><label>Official business website<input type="url" name="website" maxlength="700" placeholder="https://business.example" required></label><label class="sales-check"><input type="checkbox" name="reviewed" required>I checked that this website belongs to this business.</label><button class="button secondary">Read business contact pages</button></form><p data-local-contact-status role="status" aria-live="polite"></p><div data-local-contact-results></div>`;
      const form=host.querySelector('form'),results=host.querySelector('[data-local-contact-results]'),message=host.querySelector('[data-local-contact-status]');
      const announce=(value,error=false)=>{message.textContent=value;status(value,error);};
      const busy=value=>host.querySelectorAll('button').forEach(button=>button.disabled=value);
      function evidenceRows(evidence) {
        return evidence.filter(item=>labels[item.field]).map((item,index)=>`<label class="local-contact-choice"><input type="checkbox" data-local-contact-evidence="${index}"><span><strong>${e(labels[item.field])}: ${e(item.value)}</strong>${item.role?`<small>${e(item.role)}</small>`:''}<small>${e(item.excerpt || '')}</small>${link(item.sourceURL,'Check source')}<small>${e(item.checkedAt || report.checkedAt)} · ${e(item.scope==='business'?'Business channel · person association unverified':'Listed person · role needs review')}</small></span></label>`).join('');
      }
      function render(payload) {
        report=payload;
        const evidence=(report.evidence || []).filter(item=>labels[item.field]);
        report.evidence=evidence;
        results.innerHTML=`<p>${e(report.message)}</p>${(report.searchLinks || []).map(item=>link(item.url,item.label)).join(' · ')}${(report.candidates || []).map((item,index)=>`<article class="local-contact-source"><strong>${e(item.title)}</strong><p>${e(item.snippet)}</p>${link(item.url,'Open possible business website')}<button type="button" class="button secondary" data-local-contact-website="${index}">Choose website for review</button></article>`).join('')}${report.needsWebsiteSelection&&!report.candidates?.length?'<p>No candidate websites returned. Use the search links or enter the official business website above.</p>':''}${evidence.length?`<h5>Published contact details</h5><p>Select one value per field. A business inbox or office phone is not necessarily the named person’s direct contact.</p>${evidenceRows(evidence)}<label class="sales-check"><input type="checkbox" data-local-contact-reviewed>I checked the selected sources and business/person connection.</label><button type="button" class="button secondary" data-local-contact-prepare>Prepare selected contact details</button>`:'<p>No published contact details found on the checked pages. Missing details remain unknown.</p>'}${(report.issues || []).map(item=>`<p>${e(item.message)}</p>`).join('')}${report.pages?.length?`<details><summary>Pages checked (${report.pages.length})</summary>${report.pages.map(page=>`<p>${link(page.url,page.url)} · ${e(page.status)}</p>`).join('')}</details>`:''}<button type="button" class="button secondary" data-local-contact-download>Download research and sources</button>`;
        results.querySelectorAll('[data-local-contact-website]').forEach(button=>button.onclick=()=>{form.elements.website.value=report.candidates[Number(button.dataset.localContactWebsite)].url;form.elements.reviewed.checked=false;form.elements.website.focus();announce('Website selected. Check the business match, then read its contact pages.');});
        results.querySelectorAll('[data-local-contact-evidence]').forEach(input=>input.onchange=()=>{if(input.checked)results.querySelectorAll('[data-local-contact-evidence]').forEach(other=>{if(other!==input&&evidence[Number(other.dataset.localContactEvidence)].field===evidence[Number(input.dataset.localContactEvidence)].field)other.checked=false;});});
        const prepare=results.querySelector('[data-local-contact-prepare]');
        if(prepare)prepare.onclick=()=>{
          const selected=[...results.querySelectorAll('[data-local-contact-evidence]:checked')].map(input=>evidence[Number(input.dataset.localContactEvidence)]);
          if(!selected.length||!results.querySelector('[data-local-contact-reviewed]').checked)return announce('Select the details and confirm their source/business match first.',true);
          const values=Object.fromEntries(selected.map(item=>[item.field,item.value]));
          onPrepare({...candidate,contact:'',email:'',phone:'',...values,website:report.website || '',sourceURL:selected.find(item=>item.field==='email')?.sourceURL || selected[0].sourceURL});
        };
        results.querySelector('[data-local-contact-download]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='business-contact-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
      }
      async function run(input={}) {
        const current=++generation;busy(true);announce(input.website?'Reading published business contact pages…':'Finding business contact sources…');
        try {const payload=await api('research-local-contacts',{candidateToken:candidate.researchToken || candidate.candidateToken,...input});if(current!==generation||!host.isConnected)return;render(payload);announce('Research ready. Review sources before preparing a record.');}
        catch(error){if(current===generation&&host.isConnected)announce(error.message,true);}
        finally{if(current===generation&&host.isConnected)busy(false);}
      }
      host.querySelector('[data-local-contact-search]').onclick=()=>run();
      form.onsubmit=event=>{event.preventDefault();if(!form.elements.reviewed.checked)return announce('Confirm the official business website first.',true);return run({website:form.elements.website.value,websiteReviewed:true});};
      host.querySelector('[data-local-contact-context]').textContent=[candidate.contact,candidate.name,candidate.city,candidate.state].filter(Boolean).join(' · ')+(candidate.researchContextNote?'. '+candidate.researchContextNote:'');
    },
  };
})();
