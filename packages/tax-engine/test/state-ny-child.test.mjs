import test from 'node:test';
import assert from 'node:assert/strict';
import {newNYEmpireChildCredit,newNYEmpireChild,validateNYEmpireChildCredit,calculateNYEmpireChildCredit} from '../state-ny-child-credit.mjs';
import {nyEmpireChildFixture,computeNYEmpireFixture} from './state-ny-child-fixtures.mjs';
import {investmentFixture} from './investment-fixtures.mjs';
import {newEnergyCredits} from '../energy-credits.mjs';
import {newNYEicChild} from '../state-ny-eic-model.mjs';
import {newEicCombatSource} from '../eic-model.mjs';
const D=x=>x*100,calc=f=>computeNYEmpireFixture(f).result,codes=r=>r.diagnostics.map(row=>row.code);
function birth(f,date){f.input.individual.dependents[0].dateOfBirth=date;if(f.state.dependents[0])f.state.dependents[0].dateOfBirth=date;}
function unclaim(f){f.input.individual.dependents[0].claim='no';f.state.dependents=[];}
function energy(costs){const value=newEnergyCredits();Object.assign(value.home,{street:'1 Synthetic Road',city:'Albany',state:'NY',zip:'12207'});for(const key of Object.keys(value.review))value.review[key]=true;value.items=costs.map(([category,amount],i)=>({id:'synthetic-energy-'+i,category,costCents:D(amount),qmid:'A1B2',source:'Synthetic original qualifying installation'}));return value;}

test('annual actual federal sources produce old-law330/248 and independent2025 330/247',()=>{
 for(const year of [2023,2024,2025])for(const [wages,expected] of [[30000,330],[80000,year===2025?247:248]]){const f=nyEmpireChildFixture({year,wages}),r=calc(f);assert.equal(r.known,true,JSON.stringify(r.diagnostics));assert.equal(r.amountCents,D(expected));assert.equal(r.children.length,1);assert.equal(r.forms[0].empireChildCredit.known,true);assert.equal(r.forms[0].form,'nyit213');}
});

test('old annual phaseout rounds commenced thousands up and retains the $100 income-limit floor',()=>{
 for(const year of [2023,2024])for(const [wages,expected]of [[75000,330],[75001,314],[76000,314],[76001,297],[94000,17],[94001,0]])assert.equal(calc(nyEmpireChildFixture({year,wages})).amountCents,D(expected),`${year}/${wages}`);
 for(const year of [2023,2024]){const f=nyEmpireChildFixture({year,wages:0});assert.equal(calc(f).amountCents,D(100));f.input.individual.taxableInterestCents=D(80000);f.input.individual.investmentIncome=investmentFixture(80000,0);assert.equal(calc(f).amountCents,D(248));}
});

test('published2025 FAGI rounding and line8 whole-dollar rounding precede subtraction',()=>{
 for(const [wages,rounded,reduction,amount]of [[35999,35000,0,330],[75999,75000,0,330],[76000,76000,17,313],[76999,76000,17,313],[77000,77000,33,297],[94999,94000,314,16],[95000,95000,330,0]]){const r=calc(nyEmpireChildFixture({wages}));assert.equal(r.lines['6'],D(rounded));assert.equal(r.lines['8'],D(reduction));assert.equal(r.amountCents,D(amount));}
});

test('2025 age3/4 and16/17 boundaries use actual December31 age with exact child counts',()=>{
 for(const [dob,amount,under4,older]of [['2022-01-01',1000,1,0],['2021-12-31',330,0,1],['2009-12-31',330,0,1],['2008-12-31',0,0,0]]){const f=nyEmpireChildFixture();birth(f,dob);const r=calc(f);assert.equal(r.amountCents,D(amount));if(amount){assert.equal(r.counts['1'],under4);assert.equal(r.counts['3'],older);}else assert.equal(r.forms.length,0);}
 const f=nyEmpireChildFixture({children:7});for(let i=0;i<3;i++){f.input.individual.dependents[i].dateOfBirth='2023-06-15';f.state.dependents[i].dateOfBirth='2023-06-15';}const r=calc(f);assert.equal(r.amountCents,D(4320));assert.equal(r.children.length,7);
});

test('2025 independent claim includes a retained unclaimed child without altering federal claims',()=>{
 const f=nyEmpireChildFixture();unclaim(f);const {federal,result}=computeNYEmpireFixture(f);assert.equal(federal.childCredits.nonrefundableCents,0);assert.equal(federal.childCredits.refundableCents,0);assert.equal(result.amountCents,D(330));assert.equal(f.input.individual.dependents[0].claim,'no');delete f.state.empireChildCredit;assert.equal(calc(f).amountCents,null);
 for(const year of [2023,2024]){const g=nyEmpireChildFixture({year});unclaim(g);assert.equal(calc(g).amountCents,0);}
});

test('2025 actual ITIN/citizenship disjunction ignores federal employment and due-date restrictions',()=>{
 for(const [citizenship,type,expected]of [['usResident','ssn',0],['usResident','itin',330],['unknown','itin',330],['usCitizen','ssn',330],['usNational','ssn',330],['other','ssn',0]]){const f=nyEmpireChildFixture();unclaim(f);const child=f.input.individual.dependents[0];child.citizenship=citizenship;child.identifier.type=type;child.identifier.issuedByDueDate='unknown';child.identifier.validForEmployment='unknown';f.input.individual.taxpayerIdentifiers.taxpayer.issuedByDueDate='unknown';f.input.individual.taxpayerIdentifiers.taxpayer.validForEmployment='unknown';assert.equal(calc(f).amountCents,D(expected),`${citizenship}/${type}`);}
});

test('timely ITIN federal ODC children enter old $1000 base rather than modern $500 ODC',()=>{
 for(const year of [2023,2024]){const f=nyEmpireChildFixture({year});const child=f.input.individual.dependents[0];child.citizenship='usResident';child.identifier.type='itin';const {federal,result}=computeNYEmpireFixture(f);assert.equal(federal.dependents.ctcCount,0);assert.equal(federal.childCredits.nonrefundableCents,D(500));assert.equal(result.worksheets.a.lines['1'],D(1000));assert.equal(result.amountCents,D(330));}
});

test('2023 late-child/filer identifiers allow only the income-tested floor;2024 late exception stays unresolved',()=>{
 let f=nyEmpireChildFixture({year:2023});f.input.individual.dependents[0].identifier.issuedByDueDate='no';let r=calc(f);assert.equal(r.counts['4'],0);assert.equal(r.counts['5'],1);assert.equal(r.counts['12'],1);assert.equal(r.amountCents,D(100));assert.equal(r.children[0].lateIdentifier,true);
 f=nyEmpireChildFixture({year:2023});f.input.individual.taxpayerIdentifiers.taxpayer.issuedByDueDate='no';r=calc(f);assert.equal(r.flags['2'],false);assert.equal(r.amountCents,D(100));
 for(const owner of ['child','filer']){f=nyEmpireChildFixture({year:2024});(owner==='child'?f.input.individual.dependents[0].identifier:f.input.individual.taxpayerIdentifiers.taxpayer).issuedByDueDate='no';r=calc(f);assert.equal(r.amountCents,null);assert(codes(r).includes('NY_EMPIRE_2024_LATE_IDENTIFIER'));}
});

test('2023 timely and late children keep separate33percent and$100-floor populations',()=>{
 const f=nyEmpireChildFixture({year:2023,children:2});f.input.individual.dependents[1].identifier.issuedByDueDate='no';const r=calc(f);assert.equal(r.counts['4'],1);assert.equal(r.counts['5'],1);assert.equal(r.worksheets.a.lines['1'],D(1000));assert.equal(r.lines['13'],D(200));assert.equal(r.amountCents,D(330));
});

test('three-child NY payroll alternative is reconstructed when current federal display optimized it away',()=>{
 const f=nyEmpireChildFixture({year:2024,children:3,wages:6000});f.input.individual.taxableInterestCents=D(24000);f.input.individual.investmentIncome=investmentFixture(24000,0);const {federal,result:r}=computeNYEmpireFixture(f);assert.equal(federal.forms.find(row=>row.form==='f1040').lines['18'],D(1619));assert.equal(federal.childCredits.form.lines['25'],undefined);assert.equal(federal.childCredits.refundableCents,D(525));assert.equal(r.worksheets.b.lines['6'],D(450));assert.equal(r.worksheets.b.lines['7'],D(459));assert.equal(r.amountCents,D(686));f.input.individual.childCredits.socialSecurityWithholding[0].reviewed=false;assert.equal(calc(f).amountCents,null);
});

test('New York old-law payroll includes three timely ITIN children when modern ACTC is inapplicable',()=>{
 const f=nyEmpireChildFixture({year:2024,children:3,wages:6000});for(const child of f.input.individual.dependents){child.identifier.type='itin';child.citizenship='usResident';}f.input.individual.taxableInterestCents=D(24000);f.input.individual.investmentIncome=investmentFixture(24000,0);const {federal,result:r}=computeNYEmpireFixture(f);assert.equal(federal.dependents.ctcCount,0);assert.equal(federal.dependents.odcCount,3);assert.equal(federal.childCredits.refundableCents,0);assert.equal(federal.childCredits.form.lines['25'],undefined);assert.equal(r.worksheets.a.lines['13'],D(1619));assert.equal(r.worksheets.b.lines['7'],D(459));assert.equal(r.amountCents,D(686));
});

test('ordinary old additional credit uses $3000 earned threshold',()=>{
 for(const year of [2023,2024]){const r=calc(nyEmpireChildFixture({year,wages:7000}));assert.equal(r.worksheets.a.lines['13'],0);assert.equal(r.worksheets.b.lines['6'],D(600));assert.equal(r.amountCents,D(198));}
});

test('old earned worksheet includes actual reconciled combat pay even with federal EIC exclude election',()=>{
 for(const year of [2023,2024]){const f=nyEmpireChildFixture({year,wages:7000}),eic=f.input.individual.earnedIncomeCredit;eic.nontaxableCombatPayCents=D(1000);Object.assign(f.input.individual.childCredits,{nontaxableCombatPayCents:D(1000),combatPaySource:'Synthetic original W-2 code Q'});eic.award.combatSources=[{...newEicCombatSource(f.input.individual.w2s[0].id),amountCents:D(1000),source:'Synthetic original W-2 code Q',reviewed:true}];eic.award.combatElections.taxpayer='exclude';f.state.wageRecords[0].box12=[{code:'Q',amountCents:D(1000)}];const {federal,result:r}=computeNYEmpireFixture(f);assert.equal(federal.earnedIncomeCredit.selectedCombatPayCents,0);assert.equal(r.worksheets.b.lines['4a'],D(8000));assert.equal(r.worksheets.b.lines['4b'],D(1000));assert.equal(r.worksheets.b.lines['6'],D(750));assert.equal(r.amountCents,D(248));}
});

test('actual clean and improvement credits follow old WorksheetA references without recomputing federal clean allowance',()=>{
 const f=nyEmpireChildFixture({year:2024,wages:30000});f.input.individual.energyCredits=energy([['solar',10000],['insulation',1000]]);const {federal,result:r}=computeNYEmpireFixture(f),schedule=federal.forms.find(row=>row.form==='f1040s3').lines;assert.equal(r.known,true,JSON.stringify(r.diagnostics));assert.equal(r.worksheets.a.lines['10'],schedule['5b']);assert.equal(r.worksheets.aLine11.lines['9'],schedule['5a']);assert.equal(r.worksheets.a.lines['11'],schedule['5a']+schedule['5b']);assert.equal(r.amountCents,D(330));
});

test('old ITIN/ODC-only energy branch imports zero when actual federal Credit Limit B is inapplicable',()=>{
 for(const year of [2023,2024]){const f=nyEmpireChildFixture({year,wages:6000}),child=f.input.individual.dependents[0];child.citizenship='usResident';child.identifier.type='itin';f.input.individual.taxableInterestCents=D(24000);f.input.individual.investmentIncome=investmentFixture(24000,0);f.input.individual.energyCredits=energy([['solar',10000]]);const {federal,result:r}=computeNYEmpireFixture(f);assert.equal(federal.dependents.ctcCount,0);assert.equal(federal.childCredits.nonrefundableCents,D(500));assert.equal(federal.childCredits.creditLimitWorksheetA['4'],0);assert(federal.summary.residentialCleanEnergyCreditCents>0);assert.equal(r.worksheets.aLine11.flags.federalBApplicable,false);assert.equal(r.worksheets.aLine11.lines['9'],0);assert.equal(r.amountCents,D(330));}
});

test('explicit unknown priority amounts and unsupported old-credit sources never turn into zero',()=>{
 const f=nyEmpireChildFixture({year:2024});f.input.individual.energyCredits=energy([['insulation',1000]]);const {federal}=computeNYEmpireFixture(f);federal.forms.find(row=>row.form==='f1040s3').lines['5b']=null;assert.equal(calculateNYEmpireChildCredit(f.input,f.state,federal).amountCents,null);
 for(const field of ['buildAmericaBondInterest','magiExclusions','otherCreditTreatments']){const g=nyEmpireChildFixture({year:2024});g.source[field]='other';assert.equal(calc(g).amountCents,null);}
});

test('no-child/adult/noncustodial ordinary negatives remain known without forcing a new source section',()=>{
 for(const year of [2023,2024,2025]){let f=nyEmpireChildFixture({year,children:0});delete f.state.empireChildCredit;assert.equal(calc(f).amountCents,0);f=nyEmpireChildFixture({year});birth(f,`${year-18}-06-15`);delete f.state.empireChildCredit;assert.equal(calc(f).amountCents,0);f=nyEmpireChildFixture({year});unclaim(f);f.input.individual.dependents[0].residencyDays=0;f.input.individual.dependents[0].usResidencyDays=0;delete f.state.empireChildCredit;assert.equal(calc(f).amountCents,0);}
});

test('source completeness, identity review, link validity and explicit special treatment remain blocking',()=>{
 for(const mutate of [f=>f.source.review.children=false,f=>f.source.children=[],f=>f.source.children[0].reviewed=false,f=>f.source.children[0].dependentId='missing',f=>f.input.individual.dependents[0].review.identity=false,f=>f.source.filingStatus='different',f=>f.state.unsupportedTreatments.push('childCredits')]){const f=nyEmpireChildFixture();mutate(f);assert.equal(calc(f).amountCents,null);}
 const f=nyEmpireChildFixture({children:0});f.state.unsupportedTreatments=['childCredits'];assert.equal(calc(f).amountCents,null);
});

test('claimed source choices and special competing/residence facts cannot silently discard a candidate',()=>{
 let f=nyEmpireChildFixture();f.source.children[0].claim='no';assert.equal(calc(f).amountCents,0);f.source.children[0].reviewed=false;assert.equal(calc(f).amountCents,null);
 for(const mutate of [f=>f.source.children[0].competingClaim='tieBreaker',f=>f.input.individual.dependents[0].competingClaim='custodialRelease',f=>f.input.individual.dependents[0].residencyException='bornOrDied']){f=nyEmpireChildFixture();mutate(f);assert.equal(calc(f).amountCents,null);}
});

test('retained NY identity/relationship and reciprocal NC residence conflicts precede every zero shortcut',()=>{
 for(const year of [2023,2024,2025])for(const mutate of [f=>f.input.individual.dependents[0].dateOfBirth=`${year-18}-06-15`,f=>f.input.individual.dependents[0].relationship='parent']){const f=nyEmpireChildFixture({year});mutate(f);assert(codes(calc(f)).includes('NY_EMPIRE_DEPENDENT_RECONCILIATION'));assert.equal(calc(f).amountCents,null);}
 for(const days of [0,182,365]){const f=nyEmpireChildFixture();f.input.individual.dependents[0].residencyDays=days;f.input.individual.dependents[0].usResidencyDays=days;f.state.earnedIncomeCredit.noncustodial.children=[{...newNYEicChild(f.input.individual.dependents[0].id),claimantRelationship:'biological',mainHome:days>182?'elsewhere':'withClaimant',source:'Synthetic contradictory household original',reviewed:true}];assert(codes(calc(f)).includes('NY_EMPIRE_RESIDENCE_CONFLICT'));assert.equal(calc(f).amountCents,null);}
 for(const year of [2023,2024,2025])for(const missing of ['federal','NY']){const f=nyEmpireChildFixture({year});if(missing==='federal')f.input.individual.dependents=[];else f.state.dependents=[];delete f.state.empireChildCredit;const r=calc(f);assert(codes(r).includes('NY_EMPIRE_DEPENDENT_RECONCILIATION'),`${year}/${missing}`);assert.equal(r.amountCents,null);}
});

test('strict optional source validation applies even to unsupported future annual packs',()=>{
 const f=nyEmpireChildFixture();f.input.year=2026;const {federal}=computeNYEmpireFixture(f);let r=calculateNYEmpireChildCredit(f.input,f.state,federal);assert.equal(r.known,false);assert.equal(r.forms.length,0);assert(codes(r).includes('NY_EMPIRE_YEAR'));f.source.unrecognized=true;assert.throws(()=>calculateNYEmpireChildCredit(f.input,f.state,federal));const value=newNYEmpireChildCredit();value.children=[{...newNYEmpireChild('same')},{...newNYEmpireChild('same')}];assert.throws(()=>validateNYEmpireChildCredit(value),/distinct/);
});
