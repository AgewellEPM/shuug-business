import {newCapitalIncome} from '../capital-income.mjs';
export function capitalFixture(){const value=newCapitalIncome();for(const key of Object.keys(value.review))value.review[key]=true;return value;}
export function capitalTrade(year=2025,category='A',gainDollars=4000,overrides={}){
  return {id:`trade-${category}`,description:`10 Synthetic ${category} Fund`,category,dateAcquired:`${category<'D'?year:year-2}-01-15`,dateSold:`${year}-06-15`,proceedsCents:(10000+Math.max(0,gainDollars))*100,basisCents:(10000+Math.max(0,-gainDollars))*100,adjustments:[],source:'Synthetic broker lot statement',...overrides};
}
