// Original 2023, 2024 and 2025 IRS PDFs share these line fields.
export const scheduleBMap=Object.freeze({'2':'1/31','3':'1/32','4':'1/33','6':'1/64'});
export const investmentTaxMap=Object.freeze(Object.fromEntries(['1','2','3','4a','4b','4c','5a','5b','5c','5d','6','7','8','9a','9b','9c','9d','10','11','12','13','14','15','16','17'].map((line,index)=>[line,`1/${index+3}`])));
