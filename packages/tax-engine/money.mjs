const maximum=1_000_000_000_000_000n;
export function checkedMoney(value,name='Amount',{negative=false}={}){
  if(!Number.isSafeInteger(value)||Math.abs(value)>Number(maximum)||!negative&&value<0)throw new Error(`${name} must be an exact ${negative?'':'nonnegative '}integer-cent amount within the supported bounds.`);
  return value;
}
export function sumMoney(values){const value=values.reduce((sum,value)=>sum+BigInt(checkedMoney(value,'Recorded amount',{negative:true})),0n);if(value>maximum||value < -maximum)throw new Error('The combined amount exceeds the supported exact bounds.');return Number(value);}
export function ratio(value,numerator,denominator=10000){
  checkedMoney(value,'Calculation amount',{negative:true});
  if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||denominator<=0)throw new Error('Invalid exact calculation ratio.');
  const amount=BigInt(value)*BigInt(numerator),sign=amount<0n?-1n:1n,absolute=amount*sign,divisor=BigInt(denominator);
  const result=sign*((absolute+divisor/2n)/divisor);if(result>maximum||result < -maximum)throw new Error('The calculated amount exceeds the supported exact bounds.');return Number(result);
}
export const wholeDollars=value=>ratio(value,1,100)*100;
// Round the exact product once to a whole dollar, without an intermediate cent.
export const wholeRatio=(value,numerator,denominator=10000)=>ratio(value,numerator,denominator*100)*100;
export function parseMoney(value,{negative=false}={}){
  if(typeof value!=='string')throw new Error('Enter an amount as dollars and cents.');
  const text=value.trim();if(!text)return null;
  if(!(negative?/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/:/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/).test(text))throw new Error('Use dollars with at most two decimal places, without commas or exponents.');
  const [dollars,cents='']=text.replace('-','').split('.');return checkedMoney(Number((BigInt(dollars)*100n+BigInt(cents.padEnd(2,'0')))*(text.startsWith('-')?-1n:1n)),'Entered amount',{negative});
}
export function displayMoney(value){if(!Number.isSafeInteger(value))return 'Not calculated';const n=BigInt(value),abs=n<0n?-n:n;return `${n<0n?'-':''}${abs/100n}.${String(abs%100n).padStart(2,'0')}`;}
