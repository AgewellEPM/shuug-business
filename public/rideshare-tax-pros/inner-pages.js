'use strict';
(() => {
  const destinations = { filing: ['Tax preparation', '/tax-preparation'], records: ['Mileage & expense records', '/mileage-and-expenses'], quarterly: ['Quarterly tax support', '/quarterly-taxes'], books: ['Year-round bookkeeping', '/bookkeeping'], unsure: ['Explore your service options', '/services'] };
  const platformNames = { uber: 'Uber / Uber Eats', lyft: 'Lyft', other: 'Other gig work' };
  const companyNames = window.gigTaxCompanies || {};
  const companyName = id => Object.hasOwn(companyNames, id || '') ? companyNames[id] : '';
  const yearName = value => ({ earlier: 'Earlier or multiple tax years', unsure: 'Tax year to discuss' })[value] || value;
  const planner = document.querySelector('[data-plan]');
  if (planner) {
    const params = new URLSearchParams(location.hash.slice(1, 300));
    const company = document.querySelector('#plan-company');
    const selectPlatform = () => {
      if (!companyName(company?.value)) return;
      const key = ['uber', 'uber-eats'].includes(company.value) ? 'uber' : company.value === 'lyft' ? 'lyft' : 'other';
      const input = [...document.querySelectorAll('input[name="platform"]')].find(item => item.value === key);
      if (input) input.checked = true;
    };
    if (company && companyName(params.get('company'))) { company.value = params.get('company'); selectPlatform(); }
    company?.addEventListener('change', selectPlatform);
    const need = [...document.querySelectorAll('input[name="need"]')].find(input => input.value === params.get('need'));
    if (need) need.checked = true;
  }
  if (planner) planner.addEventListener('click', () => {
    const year = document.querySelector('#plan-year');
    const error = document.querySelector('#planner-error');
    if (!year.value) { error.textContent = 'Choose a tax year, or select “I’m not sure yet.”'; error.hidden = false; year.setAttribute('aria-invalid', 'true'); year.focus(); return; }
    error.hidden = true; year.removeAttribute('aria-invalid');
    const need = document.querySelector('input[name="need"]:checked')?.value || 'unsure';
    const platforms = [...document.querySelectorAll('input[name="platform"]:checked')].map(input => input.value).filter(value => platformNames[value]);
    const selected = destinations[need] || destinations.unsure;
    const company = document.querySelector('#plan-company')?.value || '';
    const companyLabel = companyName(company);
    document.querySelector('#plan-result-title').textContent = selected[0];
    document.querySelector('#plan-summary').textContent = `${yearName(year.value)} · ${companyLabel ? companyLabel + ' · ' : ''}${platforms.length ? platforms.map(value => platformNames[value]).join(', ') : 'Platforms to discuss'}. Start with the record checklist, then confirm the actual service scope with your preparer.`;
    const fragment = new URLSearchParams({ year: year.value, need, platforms: platforms.join(',') });
    if (companyLabel) fragment.set('company', company);
    document.querySelector('#plan-checklist').href = `/document-checklist#${fragment}`;
    document.querySelector('#plan-service').href = selected[1];
    const result = document.querySelector('#plan-result'); result.hidden = false; result.focus();
  });

  const recordInputs = [...document.querySelectorAll('[data-record-item]')];
  if (recordInputs.length) {
    const params = new URLSearchParams(location.hash.slice(1, 300));
    const platforms = (params.get('platforms') || '').split(',').filter(value => platformNames[value]);
    const year = params.get('year') || '';
    const validYear = /^(20\d{2}|earlier|unsure)$/.test(year) ? yearName(year) : '';
    const need = params.get('need');
    const companyLabel = companyName(params.get('company'));
    for (const item of document.querySelectorAll('.record-item')) item.hidden = Boolean(platforms.length && item.dataset.platform !== 'all' && !platforms.includes(item.dataset.platform));
    if (validYear || platforms.length || companyLabel) document.querySelector('#checklist-context').textContent = `${validYear || 'Your preparation checklist'}${companyLabel ? ` · ${companyLabel}` : ''}${platforms.length ? ` · ${platforms.map(value => platformNames[value]).join(', ')}` : ''}${destinations[need] ? ` · ${destinations[need][0]}` : ''}. Mark the categories you have ready to discuss.`;
    const visible = () => recordInputs.filter(input => !input.closest('.record-item').hidden);
    const refresh = () => {
      const inputs = visible(); const checked = inputs.filter(input => input.checked).length;
      document.querySelector('#checklist-count').textContent = `${checked} of ${inputs.length} record items marked ready`;
      const progress = document.querySelector('#checklist-progress'); progress.max = Math.max(inputs.length, 1); progress.value = checked;
    };
    recordInputs.forEach(input => input.addEventListener('change', refresh)); refresh();
    document.querySelector('[data-reset]').addEventListener('click', () => { recordInputs.forEach(input => { input.checked = false; }); refresh(); });
    document.querySelector('[data-print]').addEventListener('click', () => window.print());
    document.querySelector('[data-download]').addEventListener('click', () => {
      const lines = ['GIG TAX PROS — PREPARATION CHECKLIST', document.querySelector('#checklist-context').textContent, '', ...visible().map(input => `${input.checked ? '[Ready]' : '[To review]'} ${input.closest('.record-item').querySelector('span').textContent}`), '', 'An organization aid, not a tax calculation or a submission to the firm.', `${location.origin}/document-checklist`];
      const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'gig-tax-pros-preparation-checklist.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  for (const library of document.querySelectorAll('[data-search-library]')) {
    const search = library.querySelector('[data-search-input]'); const category = library.querySelector('[data-search-category]');
    const entries = [...library.querySelectorAll('[data-search-card]')];
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'clear-search'; clear.dataset.clearSearch = '';
    clear.textContent = category ? 'Clear filters' : 'Clear search';
    library.querySelector('.search-controls').append(clear);
    const filter = () => {
      const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let count = 0;
      for (const entry of entries) {
        entry.hidden = !words.every(word => entry.dataset.searchText.toLowerCase().includes(word)) || Boolean(category && category.value !== 'all' && entry.dataset.category !== category.value);
        if (!entry.hidden) count++;
      }
      const noun = library.dataset.searchNoun || (category ? 'question' : 'resource');
      const plural = library.dataset.searchPlural || `${noun}s`;
      library.querySelector('[data-search-count]').textContent = `${count} ${count === 1 ? noun : plural} found`;
      library.querySelector('[data-search-empty]').hidden = count !== 0;
      clear.disabled = !search.value && (!category || category.value === 'all');
    };
    clear.addEventListener('click', () => { search.value = ''; if (category) category.value = 'all'; filter(); search.focus(); });
    search.addEventListener('input', filter); category?.addEventListener('change', filter); filter();
  }

  const portal = document.querySelector('#client-access-links');
  if (portal) Promise.resolve(window.rtpSiteConfig || {}).then(config => {
    const safe = window.rtpLinks.publicHttpsUrl;
    const workspace = safe(config.workspaceUrl); const external = safe(config.drakePortalUrl);
    for (const [label, href] of [['Open Shuug client workspace', workspace], ['External filing portal', external]]) {
      if (!href) continue;
      const link = document.createElement('a'); link.className = `button ${href === workspace ? 'primary' : 'secondary'}`; link.href = href; link.textContent = `${label} ↗`; portal.append(link);
    }
    if (workspace) {
      document.querySelector('#client-access-title').textContent = 'Open your client workspace.';
      document.querySelector('#client-access-description').textContent = 'Continue to the firm’s configured Shuug sign-in. Your account and permissions are managed there.';
    }
  });

  const ownerBrief = document.querySelector('[data-owner-brief]');
  if (ownerBrief) {
    const fields = [...ownerBrief.querySelectorAll('[data-owner-field]')];
    const result = ownerBrief.querySelector('#owner-brief-result');
    const error = ownerBrief.querySelector('#owner-brief-error');
    const preview = ownerBrief.querySelector('#owner-brief-preview');
    const interests = { pilot:'The 90-day founding pilot', workshops:'Free owner tax workshops', brand:'Shared brand & co-branding', tools:'Shuug & software support', methods:'Operations & staffing resources', advertising:'Pooled advertising', app:'Consumer app referral opportunity', community:'Ongoing owner support' };
    const stages = { existing:'Own an existing tax office', opening:'Preparing to open an office', exploring:'Exploring the idea' };
    let prepared = '';
    const clearPreview = () => { prepared=''; result.hidden=true; preview.textContent=''; ownerBrief.querySelector('#owner-brief-summary').textContent=''; };
    const invalid = (input,message) => { error.textContent=message;error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return null; };
    const collect = () => {
      error.hidden=true;fields.forEach(input=>input.removeAttribute('aria-invalid'));
      const value={};
      for(const input of fields){
        const clean=input.value.trim();
        if(input.required&&!clean)return invalid(input,'Add your name, office name and community before preparing your brief.');
        if(input.maxLength>0&&clean.length>input.maxLength)return invalid(input,'Shorten this field to the displayed limit.');
        if(input.type==='email'&&clean&&!input.validity.valid)return invalid(input,'Use a valid business email, or leave the optional email field blank.');
        if(input.dataset.ownerField!=='questions'&&/[\r\n\x00-\x1f\x7f]/.test(clean))return invalid(input,'Keep each office detail on one line.');
        if(input.dataset.ownerField==='questions'&&/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(clean))return invalid(input,'Remove control characters from your questions.');
        value[input.dataset.ownerField]=clean;
      }
      if(!Object.hasOwn(stages,value.stage))return invalid(ownerBrief.querySelector('#owner-stage'),'Choose the description that fits your office.');
      const selected=[...ownerBrief.querySelectorAll('[data-owner-interest]:checked')].map(input=>input.value).filter(key=>Object.hasOwn(interests,key)).map(key=>interests[key]);
      return {value,selected};
    };
    ownerBrief.querySelector('[data-owner-prepare]').addEventListener('click',()=>{
      clearPreview();const data=collect();if(!data)return;const {value,selected}=data;
      prepared=['GIG TAX PROS — OWNER INTEREST BRIEF','NEIGHBORHOOD PARTNER NETWORK — PROPOSED 90-DAY FOUNDING PILOT','Prepared locally for a conversation. Not submitted or approved.','',`Owner: ${value.name}`,`Office: ${value.office}`,`Community: ${value.community}`,`Office stage: ${stages[value.stage]}`,`Business email: ${value.email||'Not included'}`,'','SUPPORT TO EXPLORE',...(selected.length?selected:['To discuss']),'','QUESTIONS',value.questions||'To discuss','','PROGRAM POINTS TO CONFIRM','Keep your legal business, team, relationships and service revenue, with local decisions within agreed standards.','Owner tax workshops are free.','Confirm software products, licensing, included access and any costs.','The $200/month advertising contribution is illustrative, not a membership fee or agreed price.','Confirm advertising fund rules, proposed routing, contribution ledger and campaign reporting.','Review baseline/onboarding days 1–30, campaigns/training days 31–60, and actual outcomes days 61–90.','Confirm co-branding, client confidentiality, support and written responsibilities.','No fee, royalty, protected territory, leads or earnings are promised by this brief.','',`${location.origin}/join-the-family`,`${location.origin}/contact`].join('\n');
      preview.textContent=prepared;
      ownerBrief.querySelector('#owner-brief-summary').textContent=`${value.office} · ${value.community}. Review your local copy, then check contact availability when you are ready.`;
      result.hidden=false;result.focus();
    });
    for(const input of ownerBrief.querySelectorAll('input,select,textarea'))for(const event of ['input','change'])input.addEventListener(event,clearPreview);
    ownerBrief.querySelector('[data-owner-download]').addEventListener('click',()=>{
      if(!prepared)return;
      const url=URL.createObjectURL(new Blob([prepared],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='gig-tax-pros-owner-interest-brief.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    ownerBrief.querySelector('[data-owner-reset]').addEventListener('click',()=>{
      clearPreview();fields.forEach(input=>{input.value=input.tagName==='SELECT'?'existing':'';input.removeAttribute('aria-invalid');});ownerBrief.querySelectorAll('[data-owner-interest]').forEach(input=>{input.checked=false;});error.hidden=true;error.textContent='';ownerBrief.querySelector('#owner-name').focus();
    });
  }

  const adPool = document.querySelector('[data-ad-pool]');
  if (adPool) {
    const count=adPool.querySelector('[data-ad-count]'),contribution=adPool.querySelector('[data-ad-contribution]'),error=adPool.querySelector('#ad-pool-error');
    const section=adPool.closest('.owner-ad-section'),total=adPool.querySelector('[data-ad-total]'),equation=adPool.querySelector('[data-ad-equation]');
    const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:Number.isInteger(value)?0:2,maximumFractionDigits:2}).format(value);
    const integer=(input,min,max)=>/^\d+$/.test(input.value)&&Number.isSafeInteger(Number(input.value))&&Number(input.value)>=min&&Number(input.value)<=max;
    const update=()=>{
      const countValid=integer(count,1,1000),contributionValid=integer(contribution,0,10000);
      for(const [input,valid] of [[count,countValid],[contribution,contributionValid]])if(valid)input.removeAttribute('aria-invalid');else input.setAttribute('aria-invalid','true');
      error.hidden=countValid&&contributionValid;
      if(!countValid||!contributionValid){error.textContent=!countValid?'Use a whole office count from 1 to 1,000.':'Use a whole-dollar example contribution from $0 to $10,000.';total.textContent='—';equation.textContent='Choose valid inputs to see the illustrative pool.';section.querySelectorAll('[data-ad-allocation]').forEach(output=>{output.textContent='—';});return;}
      error.textContent='';const offices=Number(count.value),amount=Number(contribution.value),pool=offices*amount;
      total.textContent=money(pool);equation.textContent=`${offices} ${offices===1?'office':'offices'} × ${money(amount)} per month`;
      for(const [key,percent] of [['search',45],['maps',30],['social',15],['testing',10]])section.querySelector(`[data-ad-allocation="${key}"]`).textContent=money(pool*percent/100);
    };
    for(const input of [count,contribution])for(const event of ['input','change'])input.addEventListener(event,update);
    adPool.querySelectorAll('[data-ad-preset]').forEach(button=>button.addEventListener('click',()=>{count.value=button.dataset.adPreset;update();}));
    adPool.querySelector('[data-ad-reset]').addEventListener('click',()=>{count.value='10';contribution.value='200';update();});
    update();
    adPool.querySelectorAll('[data-ad-count],[data-ad-contribution],[data-ad-preset],[data-ad-reset]').forEach(control=>{control.disabled=false;});
  }
})();
