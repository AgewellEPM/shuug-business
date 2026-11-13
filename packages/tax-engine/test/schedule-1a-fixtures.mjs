import {newSchedule1A,newTipSource,newOvertimeSource,newVehicleLoan,newSeniorDeduction} from '../schedule-1a.mjs';
import {newTaxpayerIdentifiers} from '../taxpayer-identifiers.mjs';
import {eligibilityFixture} from './standard-deduction-fixtures.mjs';
export const reviewAll=value=>{for(const key of Object.keys(value.review))value.review[key]=true;return value;};
export const schedule1AFixture=()=>reviewAll(newSchedule1A());
export function identifiersFixture(){const value=newTaxpayerIdentifiers();for(const row of Object.values(value))Object.assign(row,{type:'ssn',issuedByDueDate:'yes',validForEmployment:'yes',source:'Synthetic SSA issue and employment evidence',reviewed:true});return value;}
export const tip=(amount=10000,overrides={})=>reviewAll({...newTipSource(),incomeId:'w2-taxpayer',payer:'Synthetic employer',occupationCode:'102',tipAmountCents:amount*100,sstbStatus:'transitionRelief',source:'Synthetic annual tip record',...overrides});
export const overtime=(amount=15000,method='timeAndHalfTotal',overrides={})=>reviewAll({...newOvertimeSource(),w2Id:'w2-taxpayer',payer:'Synthetic employer',amountCents:amount*100,method,source:'Synthetic FLSA payroll record',...overrides});
export const vehicle=(amount=5000,overrides={})=>reviewAll({...newVehicleLoan(),vin:'1HGCM82633A004352',description:'Synthetic new U.S.-assembled vehicle',vehicleType:'car',gvwrPounds:4500,purchaseDate:'2025-03-15',loanDate:'2025-03-15',interestCents:amount*100,source:'Synthetic purchase, assembly, lender and personal-use records',...overrides});
export const senior=(owner='taxpayer')=>({...newSeniorDeduction(),owner,source:'Synthetic senior qualification source',reviewed:true});
export const schedule1AContext=()=>({year:2025,filingStatus:'single',adjustedGrossIncomeCents:6500000,w2s:[{id:'w2-taxpayer',owner:'taxpayer',wagesCents:6500000}],eligibility:eligibilityFixture(),identifiers:identifiersFixture(),taxIds:{taxpayer:'000123456',spouse:'000987654'}});
