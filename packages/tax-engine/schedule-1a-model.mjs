export const schedule1AReviews=Object.freeze([
 ['magi','Federal AGI is complete; no Puerto Rico, foreign earned/housing or American Samoa exclusion/add-back applies'],
 ['coverage','All Schedule 1-A sources and eligibility reviewed; no unrepresented foreign, treaty, allocation or other adjustment remains'],
].map(Object.freeze));
export const tipReviews=Object.freeze([
 ['voluntaryCash','Only voluntary customer-determined cash/charged tips; no mandatory service charge, noncash item, negotiated payment or employer payment'],
 ['lawful','The tipped services are lawful; no misdemeanor/felony services, prostitution or pornographic activity'],
 ['occupation','The actual services match the selected IRS tipped occupation, including its description'],
 ['reporting','Tips reconcile to the indicated annual reporting method and are included once in the linked federal income'],
 ['netIncome','For business tips: all allocable expenses and SE-tax adjustments are represented; no omitted health-insurance or retirement-plan deduction'],
].map(Object.freeze));
export const overtimeReviews=Object.freeze([
 ['flsa','Employee is eligible for mandatory overtime under FLSA section 7; amount excludes state-only/contractual overtime and holiday/weekend premiums'],
 ['regularRate','Payroll regular rate and eligible hours/premium are documented; discretionary/non-discretionary bonuses and special work periods reconciled'],
 ['reporting','The annual wage source includes this compensation once; no unrepresented deferred compensation, Form 8919 or employment classification issue'],
].map(Object.freeze));
export const vehicleReviews=Object.freeze([
 ['originalUse','Vehicle is new and original use began with this borrower; purchase and loan were after December 31, 2024'],
 ['assembly','Final assembly was in the United States, verified from the vehicle label or NHTSA VIN record'],
 ['loan','Borrower originated this first-lien purchase loan; no lease, cash-out, refinancing, inherited obligation or replacement vehicle'],
 ['personal','At loan origination, more than 50% expected use was personal by the borrower or qualifying household/family'],
 ['interest','Interest and purchase financing reconcile to lender records; no negative equity, nonvehicle insurance, trailer or other ineligible debt'],
 ['noDuplicate','Interest deducted elsewhere is represented once on the linked Schedule C; no joint-obligor or separate-return allocation remains'],
].map(Object.freeze));
const reviews=items=>Object.fromEntries(items.map(([key])=>[key,false]));
export const newSchedule1A=()=>({tips:[],overtime:[],vehicles:[],seniors:[],review:reviews(schedule1AReviews)});
export const newTipSource=()=>({id:crypto.randomUUID(),owner:'taxpayer',kind:'employee',incomeId:'',payer:'',occupationCode:'',reporting:'w2Box7',reportedGrossCents:0,tipAmountCents:0,sstbStatus:'unknown',source:'',review:reviews(tipReviews)});
export const newOvertimeSource=()=>({id:crypto.randomUUID(),owner:'taxpayer',w2Id:'',payer:'',method:'premiumStatement',amountCents:0,regularRateCents:0,overtimeHoursHundredths:0,source:'',review:reviews(overtimeReviews)});
export const newVehicleLoan=()=>({id:crypto.randomUUID(),owner:'taxpayer',vin:'',description:'',vehicleType:'car',gvwrPounds:0,purchaseDate:'',loanDate:'',interestCents:0,deductedElsewhereCents:0,businessId:'',source:'',review:reviews(vehicleReviews)});
export const newSeniorDeduction=()=>({owner:'taxpayer',source:'',reviewed:false});
export const tipReportingMethods=Object.freeze([['w2Box7','2025 W-2 box 7'],['form4070','2025 Forms 4070 / employer tip reports'],['employerStatement','2025 employer tips statement'],['w2TP','2026 W-2 box 12 TP / box 14b occupation'],['1099NEC','1099-NEC'],['1099MISC','1099-MISC'],['1099K','1099-K'],['form4137','Unreported tips / Form 4137 — additional income and tax work required']].map(Object.freeze));
export const overtimeMethods=Object.freeze([['premiumStatement','2025 separately stated FLSA half-time premium'],['timeAndHalfTotal','2025 total time-and-a-half pay (divide by 3)'],['doubleTimeTotal','2025 total double-time pay (divide by 4)'],['doubleTimePremium','2025 separately stated double-time premium (divide by 2)'],['hoursRate','2025 eligible hours × regular rate × 0.5'],['w2TT','2026 W-2 box 12 TT'],['other','Other source / classification — additional work required']].map(Object.freeze));
