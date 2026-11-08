import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const script = readFileSync('public/rideshare-tax-pros/sales-console.js','utf8');
const stages = ['new','researching','contacted','meeting','interested','invited','active','not_interested','do_not_contact'];
const owner = { id:'owner', name:'Workspace owner', role:'owner', states:[] };
const office = (id, extra = {}) => ({ id, town:`Office ${id}`, locality:'Hartford', state:'CT', status:'new', assigned_to:'owner', contact_name:'', contact_email:'', meeting_date:null, notes:'{}', ...extra });
function fixture({ svg = false, callbacks = {} } = {}) {
  const dom = new JSDOM(`<div id="sales-dashboard"></div><input id="sales-filter"><select id="sales-stage-filter"><option value="">All stages</option>${stages.map(s=>`<option>${s}</option>`).join('')}</select><div id="sales-stage-strip"></div><button data-pipeline-view="board">Board</button><button data-pipeline-view="list">List</button><div id="sales-board"></div><div id="sales-pipeline-list"><div id="sales-offices"></div></div><div id="sales-territory-map">${svg?'<svg data-sales-state-map viewBox="0 0 1000 650"><path data-state="CT" d="M10 10L20 10L20 20Z"><title>Connecticut</title></path><path data-state="MA" d="M20 10L30 10L30 20Z"><title>Massachusetts</title></path></svg>':''}</div><div id="sales-territory-cards"></div><div id="sales-territory-cities"></div><form id="sales-discover"><input name="city"><select name="state"><option>CT</option><option>MA</option><option>AK</option><option>HI</option><option>DC</option></select></form>`,{url:'https://gigtax.pro/sales',runScripts:'outside-only'});
  const w=dom.window, calls={navigate:[],select:[],search:[],status:[],api:[]};
  w.fetch=()=>{throw new Error('Presentation must not make network requests.');};
  w.eval(script);
  const view=w.GigTaxConsole.mount({api:(...args)=>{calls.api.push(args);throw new Error('Presentation must not mutate offices.');},status:(...args)=>calls.status.push(args),onNavigate:name=>calls.navigate.push(name),onSelect:id=>calls.select.push(id),onSearch:query=>calls.search.push(query),...callbacks});
  return {w,view,calls,$:s=>w.document.querySelector(s),$$:s=>[...w.document.querySelectorAll(s)],render:(offices=[],user=owner)=>view.render({offices,user,agents:[],stages,terms:null,paymentsConfigured:false}),close:()=>w.close()};
}

test('empty dashboard uses actual zero counts and a complete labelled state tile fallback without invented activity',()=>{
  const f=fixture();try{
    f.render();assert.deepEqual(f.$$('.sdr-stat-value').map(e=>e.textContent),['0','0','0','0']);
    const tiles=f.$$('.sdr-map-tile');assert.equal(tiles.length,51);assert.equal(new Set(tiles.map(b=>b.dataset.state)).size,51);
    for(const state of ['AK','HI','DC'])assert(f.$(`.sdr-map-tile[data-state="${state}"]`));
    assert.match(f.$('.sdr-map-caption').textContent,/tile map|insets/);assert.equal(f.$$('.sdr-state-card').length,51);
    assert(!/emails this week|replies this week|guaranteed|\$\d/i.test(f.$('#sales-dashboard').textContent));
    assert.equal(f.calls.api.length,0);assert.equal(f.$('[data-pipeline-view="board"]').getAttribute('aria-pressed'),'true');
  }finally{f.close();}
});

test('dashboard counts paid active memberships only and derives follow-ups from saved dates',()=>{
  const f=fixture();try{
    f.render([office('1',{meeting_date:'2000-01-01'}),office('2',{status:'interested'}),office('3',{status:'active',membership:{eligible:true,status:'active'}}),office('4',{status:'active',membership:{eligible:false,status:'past_due',reason:'Paid period ended.'}})]);
    assert.deepEqual(f.$$('.sdr-stat-value').map(e=>e.textContent),['4','1','1','1']);
    assert.match(f.$('.sdr-work-list').textContent,/Paid period ended/);
    f.$('.sdr-work-item').click();assert.equal(f.calls.navigate.at(-1),'pipeline');assert.equal(f.calls.select.at(-1),'4');
  }finally{f.close();}
});

test('pipeline cards open existing detail callbacks and user-provided names are rendered as text',()=>{
  const f=fixture();try{
    const name='<img src=x onerror="alert(1)">';f.render([office('1',{town:name})]);
    const card=f.$('[data-console-office="1"]');assert.equal(card.querySelector('strong').textContent,name);assert.equal(card.querySelector('img'),null);
    card.click();assert.deepEqual(f.calls.select,['1']);assert.deepEqual(f.calls.navigate,['pipeline']);
    assert.equal(f.$('[style]'),null);assert.equal(f.$('[onclick]'),null);assert.equal(f.calls.api.length,0);
  }finally{f.close();}
});

test('stage chips and search filters agree with existing stage control and board/list switch preserves their state',()=>{
  const f=fixture();try{
    f.render([office('1',{town:'Alpha Office'}),office('2',{town:'Beta Office',status:'interested'}),office('3',{town:'Alpha Two',status:'interested'})]);
    let stageChanges=0;f.$('#sales-stage-filter').addEventListener('change',()=>stageChanges++);
    f.$('[data-console-stage="interested"]').click();assert.equal(stageChanges,1);assert.equal(f.$('#sales-stage-filter').value,'interested');assert.equal(f.$$('.sdr-office-card').length,2);
    f.$('#sales-filter').value='Alpha';f.$('#sales-filter').dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.deepEqual(f.$$('.sdr-office-card').map(c=>c.dataset.consoleOffice),['3']);
    f.$('[data-pipeline-view="list"]').click();assert.equal(f.$('#sales-board').hidden,true);assert.equal(f.$('#sales-pipeline-list').hidden,false);
    f.render([office('1',{town:'Alpha Office'}),office('3',{town:'Alpha Two',status:'interested'})]);assert.equal(f.$('#sales-board').hidden,true);assert.equal(f.$('#sales-stage-filter').value,'interested');
    f.$('[data-pipeline-view="board"]').click();assert.equal(f.$('#sales-board').hidden,false);assert.equal(f.$('#sales-pipeline-list').hidden,true);
  }finally{f.close();}
});

test('agent territory and assignments constrain displayed data and research controls',()=>{
  const f=fixture(),agent={id:'agent-1',name:'Agent One',role:'agent',states:['CT']};try{
    f.render([office('1',{assigned_to:'agent-1'}),office('2',{state:'MA',assigned_to:'agent-1'}),office('3',{assigned_to:'agent-2'})],agent);
    assert.equal(f.$('.sdr-stat-value').textContent,'1');assert.deepEqual(f.$$('.sdr-office-card').map(c=>c.dataset.consoleOffice),['1']);
    assert.equal(f.$('.sdr-map-tile[data-state="MA"]').disabled,true);assert.equal(f.$('.sdr-state-card[data-territory-state="MA"]').disabled,true);
    f.$('.sdr-map-tile[data-state="MA"]').click();assert.equal(f.calls.navigate.length,0);
    f.$('.sdr-map-tile[data-state="CT"]').click();assert.equal(f.$('#sales-discover').elements.state.value,'CT');assert.deepEqual(f.calls.navigate,['discover']);
  }finally{f.close();}
});

test('genuine inline state paths are preserved and keyboard actions bind once across repeated renders',()=>{
  const f=fixture({svg:true}),agent={id:'agent-1',name:'Agent One',role:'agent',states:['CT']};try{
    const svg=f.$('svg[data-sales-state-map]'),path=f.$('path[data-state="CT"]'),geometry=path.getAttribute('d');
    f.render([office('1',{assigned_to:'agent-1'})],agent);f.render([office('1',{assigned_to:'agent-1'})],agent);
    assert.equal(f.$('svg[data-sales-state-map]'),svg);assert.equal(f.$('path[data-state="CT"]'),path);assert.equal(path.getAttribute('d'),geometry);assert.equal(f.$('.sdr-map-grid'),null);
    assert.match(path.getAttribute('aria-label'),/Connecticut: 1 office/);assert.equal(path.getAttribute('tabindex'),'0');
    path.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.deepEqual(f.calls.navigate,['discover']);
    const blocked=f.$('path[data-state="MA"]');assert.equal(blocked.getAttribute('aria-disabled'),'true');assert.equal(blocked.getAttribute('tabindex'),'-1');
    blocked.dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));assert.deepEqual(f.calls.navigate,['discover']);
  }finally{f.close();}
});

test('city groups contain real saved counts and call existing discovery with the selected state and city',()=>{
  const f=fixture();try{
    f.render([office('1'),office('2'),office('3',{state:'MA',locality:'Boston'})]);
    const city=f.$$('.sdr-city-button').find(b=>b.textContent.includes('Hartford'));assert(city);assert.match(city.textContent,/2 offices/);city.click();
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.search)),[{state:'CT',city:'Hartford'}]);assert.equal(f.$('#sales-discover').elements.state.value,'CT');assert.equal(f.$('#sales-discover').elements.city.value,'Hartford');assert.equal(f.calls.navigate.at(-1),'discover');
    f.view.navigate('territories');assert.equal(f.calls.navigate.length,1,'Parent view synchronization must not recurse into its navigation callback.');
  }finally{f.close();}
});
