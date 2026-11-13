(() => {
  'use strict';
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const covers=(agent,state,key)=>agent.territory?.version===1?agent.territory.areas.some(area=>area.state===state&&(area.cities===null||area.cities.includes(key))):!agent.states?.length||agent.states.includes(state);
  window.GigTaxTerritories={mount({api,status,refresh,onSearch,onNavigate}){
    const host=document.querySelector('#sales-territory-cities');if(!host)return;
    let data,state='',agentId='',report,selected=new Set(),mode='selected',query='',offset=0,sequence=0,timer,saving=false;
    const agent=()=>data?.agents.find(row=>String(row.id)===agentId);
    const owner=()=>data?.user.role==='owner';
    function resetSelection(){
      const person=agent(),area=person?.territory?.areas.find(area=>area.state===state);
      selected=new Set(area?.cities || []);
      mode=area?.cities===null?'state':area?'selected':person?.territory?.version===1?'none':person?.states?.includes(state)?'state':'selected';
    }
    function controls(){
      const person=agent(),count=host.querySelector('[data-territory-selected]');
      if(count)count.textContent=mode==='state'?'Whole state selected':mode==='none'?'No coverage in this state':`${selected.size} towns / cities selected`;
      host.querySelectorAll('[data-territory-town]').forEach(box=>{box.disabled=saving||mode!=='selected';box.checked=mode==='state'||selected.has(box.value);});
      const save=host.querySelector('[data-territory-save]');if(save)save.disabled=saving||!person||mode==='selected'&&!selected.size;
    }
    function paint(){
      if(!data)return;
      const queryFocused=document.activeElement?.hasAttribute('data-territory-query'),caret=queryFocused?document.activeElement.selectionStart:null;
      if(!state){host.innerHTML='<div class="sdr-card"><h3>Assign towns and cities</h3><p>Choose any state on the map to browse its towns, cities and communities.</p></div>';return;}
      const person=agent(),own=owner();
      host.innerHTML=`<section class="sdr-card territory-drilldown"><div class="sdr-card-head"><div><h3>${e(state)} · Towns & cities</h3><p>${report?`${report.stateTotal.toLocaleString()} available · Census ${e(report.version)}`:'Loading the town catalog…'}</p></div><button type="button" class="button secondary" data-territory-back>All states</button></div>
        <p>Assignments follow the town or city recorded on an office’s address. Identically named localities within a state share coverage.</p>
        ${own?`<div class="territory-controls"><label>Salesperson<select data-territory-agent><option value="">Choose a salesperson</option>${data.agents.map(row=>`<option value="${e(row.id)}" ${String(row.id)===agentId?'selected':''}>${e(row.name)}</option>`).join('')}</select></label><label>Coverage in ${e(state)}<select data-territory-mode><option value="selected">Selected towns & cities</option><option value="state">Whole state</option><option value="none">No coverage</option></select></label></div>${!data.agents.length?'<p>Create a salesperson in Sales team, then assign their towns here. <button type="button" class="button secondary" data-territory-team>Open Sales team</button></p>':''}${person&&!person.territory&&!person.states?.length?'<p class="local-owner-note">This salesperson currently has nationwide access. Saving here starts a restricted territory with this state’s selection.</p>':''}<div class="sales-actions"><strong data-territory-selected></strong><button type="button" class="button primary" data-territory-save>Save territory</button></div>`:'<p>Your assigned towns and cities are listed below. Choose a town to find offices.</p>'}
        <label>Find a town or city<input type="search" data-territory-query placeholder="Search town or city name" value="${e(query)}"></label>
        <p data-territory-count role="status">${report?`${report.total} matching towns / cities`:'Loading…'}</p>
        ${own&&report?'<div class="sales-actions"><button type="button" class="button secondary" data-territory-select-page>Select this page</button><button type="button" class="button secondary" data-territory-clear-page>Clear this page</button></div>':''}
        <div class="territory-town-list">${(report?.results || []).map(row=>{const assigned=data.agents.filter(a=>covers(a,state,row.key));return `<div class="territory-town"><label>${own?`<input type="checkbox" value="${e(row.key)}" data-territory-town aria-label="Assign ${e(row.name)}">`:''}<span><strong>${e(row.name)}</strong><small>${e(row.kinds.join(' · '))}${assigned.length?` · Covered by ${e(assigned.map(a=>a.name).join(', '))}`:''}</small></span></label><button type="button" class="button secondary" data-territory-research="${e(row.name)}">Find offices</button></div>`;}).join('')}${report&&!report.results.length?'<p>No towns match this search.</p>':''}</div>
        <div class="sales-actions"><button type="button" class="button secondary" data-territory-prev ${!offset?'disabled':''}>Previous towns</button><span>${report?.total?`${offset+1}–${Math.min(offset+100,report.total)} of ${report.total}`:'0'}</span><button type="button" class="button secondary" data-territory-next ${!report?.hasMore?'disabled':''}>Next towns</button></div>
        <p class="local-map-coverage">Territory coverage controls discovery and which offices can be assigned to a salesperson. Existing offices keep their individual assignments. Review and save to change coverage.</p></section>`;
      const $=selector=>host.querySelector(selector);
      $('[data-territory-back]').onclick=()=>{state='';sequence++;paint();document.querySelector('#sales-territory-map')?.scrollIntoView?.({block:'start'});};
      if(own){
        $('[data-territory-agent]').onchange=event=>{agentId=event.target.value;resetSelection();paint();};
        $('[data-territory-mode]').value=mode;
        $('[data-territory-mode]').onchange=event=>{mode=event.target.value;controls();};
        if($('[data-territory-team]'))$('[data-territory-team]').onclick=()=>onNavigate('team');
        $('[data-territory-save]').onclick=save;
        host.querySelectorAll('[data-territory-town]').forEach(box=>box.onchange=()=>{if(box.checked)selected.add(box.value);else selected.delete(box.value);controls();});
        if(report)for(const [selector,add] of [['[data-territory-select-page]',true],['[data-territory-clear-page]',false]])$(selector).onclick=()=>{mode='selected';$('[data-territory-mode]').value=mode;for(const row of report.results){if(add)selected.add(row.key);else selected.delete(row.key);}controls();};
      }
      $('[data-territory-query]').oninput=event=>{query=event.target.value;sequence++;clearTimeout(timer);timer=setTimeout(()=>{offset=0;load();},250);};
      $('[data-territory-prev]').onclick=()=>{offset=Math.max(0,offset-100);load();};
      $('[data-territory-next]').onclick=()=>{offset+=100;load();};
      host.querySelectorAll('[data-territory-research]').forEach(button=>button.onclick=()=>onSearch({state,city:button.dataset.territoryResearch}));
      controls();
      if(queryFocused){$('[data-territory-query]').focus();$('[data-territory-query]').setSelectionRange(caret,caret);}
    }
    async function load(){
      const request=++sequence,current=state;
      try {const next=await api('territory-localities',{state:current,query,offset});if(request!==sequence||current!==state)return;report=next;paint();}
      catch(error){if(request===sequence){status(error.message,true);const count=host.querySelector('[data-territory-count]');if(count)count.textContent='The town catalog could not load. Select the state again to retry.';}}
    }
    async function save(){
      if(saving||!agent())return;
      const person=agent(),region=state;
      saving=true;host.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);
      try{await api('set-agent-territory',{id:person.id,state:region,mode,cityKeys:[...selected],expectedRevision:person.territoryRevision});await refresh();status(`Saved ${person.name}’s territory in ${region}.`);}
      catch(error){status(error.message,true);}
      finally{saving=false;paint();}
    }
    return {render(next){data=next;if(!data.agents.some(row=>String(row.id)===agentId))agentId=data.agents[0]?String(data.agents[0].id):'';resetSelection();paint();},
      selectState(region){state=region;query='';offset=0;report=undefined;resetSelection();paint();void load();host.scrollIntoView?.({block:'start',behavior:'smooth'});}};
  }};
})();
