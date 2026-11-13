import {checkedMoney,wholeDollars as R} from './money.mjs';
import {eicTable2023,eicTerminal2023} from './data/2023-eic-table.mjs';
import {eicTable2024,eicTerminal2024} from './data/2024-eic-table.mjs';
import {eicTable2025,eicTerminal2025} from './data/2025-eic-table.mjs';

export const eicTableYears=Object.freeze([2023,2024,2025]);
const tablePacks={2023:[eicTable2023,eicTerminal2023],2024:[eicTable2024,eicTerminal2024],2025:[eicTable2025,eicTerminal2025]};
export const eicWorksheetAnnual=Object.freeze(Object.fromEntries(Object.entries({
 2023:{investmentLimitCents:1100000,agiComparisonThresholds:[980000,1637000,2156000,2812000]},
 2024:{investmentLimitCents:1160000,agiComparisonThresholds:[1033000,1725000,2272000,2964000]},
 2025:{investmentLimitCents:1195000,agiComparisonThresholds:[1062000,1773000,2335000,3047000]},
}).map(([year,value])=>[year,Object.freeze({...value,agiComparisonThresholds:Object.freeze(value.agiComparisonThresholds)})])));

/** Exact published table lookup after return-dollar rounding. A terminal star
 * is a column-specific partial interval, never a formula or an assumed zero.
 * Only MFJ uses joint EIC columns; a qualifying surviving spouse does not. */
export function eicTableLookup(incomeCents,{year,filingStatus,qualifyingChildren}){
 checkedMoney(incomeCents,'EIC table income',{negative:true});
 if(!eicTableYears.includes(year))throw new Error('No final IRS EIC award table is installed for this tax year.');
 if(!['single','marriedJoint','marriedSeparate','headOfHousehold','survivingSpouse'].includes(filingStatus))throw new Error('Choose a supported EIC filing status.');
 if(!Number.isSafeInteger(qualifyingChildren)||qualifyingChildren<0||qualifyingChildren>100)throw new Error('EIC amount children must be an exact supported count.');
 const [rows,terminals]=tablePacks[year],count=Math.min(3,qualifyingChildren),column=(filingStatus==='marriedJoint'?4:0)+count;
 const terminal=terminals.find(row=>row[0]===column),income=R(incomeCents),cutoffCents=terminal[2]*100;
 const result=(creditCents,interval,terminalFootnote=false)=>({creditCents,incomeCents:income,interval,column,qualifyingChildren:count,cutoffCents,terminalFootnote,method:`official-${year}-eic-table`});
 if(income<=0)return result(0,[null,100]);
 if(income>=cutoffCents)return result(0,[cutoffCents,null]);
 if(income>=terminal[1]*100)return result(terminal[3]*100,[terminal[1]*100,cutoffCents],true);
 let low=0,high=rows.length-1;
 while(low<=high){const middle=(low+high)>>1,row=rows[middle];if(income<row[0]*100)high=middle-1;else if(income>=row[1]*100)low=middle+1;else{const credit=row[column+2];if(!Number.isSafeInteger(credit)||credit<0)throw new Error('The reviewed EIC table contains an unresolved footnote.');return result(credit*100,[row[0]*100,row[1]*100]);}}
 throw new Error('The reviewed EIC table has no matching interval.');
}
