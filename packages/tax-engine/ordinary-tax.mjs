import { taxTable2025 } from './data/2025-tax-table.mjs';
import {taxTable2023,taxComputation2023} from './data/2023-tax-table.mjs';
import {taxTable2024,taxComputation2024} from './data/2024-tax-table.mjs';
import { checkedMoney, wholeDollars, ratio } from './money.mjs';
import {ordinaryTax2026} from './annual-2026.mjs';

// Exact 2025 line-16 Tax Computation Worksheet multiplication/subtraction rows.
// The official table, rather than a bracket approximation, applies below 100,000.
const worksheets=Object.freeze({
  single:[[103350,22,508600],[197300,24,715300],[250525,32,2293700],[626350,35,3045275],[Infinity,37,4297975]],
  marriedJoint:[[206700,22,1017200],[394600,24,1430600],[501050,32,4587400],[751600,35,6090550],[Infinity,37,7593750]],
  marriedSeparate:[[103350,22,508600],[197300,24,715300],[250525,32,2293700],[375800,35,3045275],[Infinity,37,3796875]],
  headOfHousehold:[[103350,22,682500],[197300,24,889200],[250500,32,2467600],[626350,35,3219100],[Infinity,37,4471800]],
});
const tables=Object.freeze({2023:taxTable2023,2024:taxTable2024,2025:taxTable2025}),annualWorksheets=Object.freeze({2023:taxComputation2023,2024:taxComputation2024,2025:worksheets});
export const ordinaryTax2025=(taxableCents,status)=>ordinaryTax(taxableCents,status,2025);
export function ordinaryTax(taxableCents,status,year=2025){
  if(year===2026)return ordinaryTax2026(taxableCents,status);
  if(!Number.isInteger(year)||!Object.hasOwn(tables,year))throw new Error('No official tax table is installed for this tax year.');
  const table=tables[year],worksheet=annualWorksheets[year];
  checkedMoney(taxableCents,'Taxable income');const key=status==='survivingSpouse'?'marriedJoint':status;
  if(!Object.hasOwn(worksheet,key))throw new Error('Choose a supported filing status.');
  const rounded=wholeDollars(taxableCents),dollars=rounded/100;
  if(dollars<100000){let low=0,high=table.length-1;while(low<=high){const middle=(low+high)>>1,row=table[middle];if(dollars<row[0])high=middle-1;else if(dollars>=row[1])low=middle+1;else return {taxCents:row[{single:2,marriedJoint:3,marriedSeparate:4,headOfHousehold:5}[key]]*100,method:`official-${year}-tax-table`,interval:[row[0],row[1]]};}throw new Error('The official tax table has no matching interval.');}
  const [ceiling,rate,subtract]=worksheet[key].find(([ceiling])=>ceiling===null||dollars<=ceiling);
  return {taxCents:wholeDollars(ratio(rounded,rate,100)-subtract),method:`official-${year}-tax-computation-worksheet`,rate,ceiling:Number.isFinite(ceiling)?ceiling:null};
}
