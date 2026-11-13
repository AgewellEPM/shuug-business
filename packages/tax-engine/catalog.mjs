export const returnTypes=Object.freeze([
  Object.freeze({id:'1040',label:'Individual / self-employed',form:'1040',family:'individual',support:'Federal 2023–2025 income / Schedule C; partial 2026–2027 calculations'}),
  Object.freeze({id:'1065',label:'Partnership',form:'1065',family:'business',support:'Federal 2023–2025 ordinary business income and partner allocation workpapers'}),
  Object.freeze({id:'1120S',label:'S corporation',form:'1120-S',family:'business',support:'Federal 2023–2025 ordinary business income and shareholder allocation workpapers'}),
  Object.freeze({id:'1120',label:'C corporation',form:'1120',family:'business',support:'Federal 2023–2025 ordinary corporate income preparation'}),
]);
export const filingStatuses=Object.freeze([['single','Single'],['marriedJoint','Married filing jointly'],['marriedSeparate','Married filing separately'],['headOfHousehold','Head of household'],['survivingSpouse','Qualifying surviving spouse']].map(Object.freeze));
export const standardDeductions2025=Object.freeze({single:1575000,marriedJoint:3150000,marriedSeparate:1575000,headOfHousehold:2362500,survivingSpouse:3150000});
export const federalSources=Object.freeze({
  individual:'https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf',scheduleC:'https://www.irs.gov/pub/irs-prior/f1040sc--2025.pdf',
  scheduleSE:'https://www.irs.gov/pub/irs-prior/f1040sse--2025.pdf',qbi:'https://www.irs.gov/pub/irs-prior/i8995--2025.pdf',
  partnership:'https://www.irs.gov/pub/irs-prior/f1065--2025.pdf',sCorporation:'https://www.irs.gov/pub/irs-prior/f1120s--2025.pdf',corporation:'https://www.irs.gov/pub/irs-prior/i1120--2025.pdf',
});
export const scopeNotice='Limited 2023–2025 federal, Connecticut and New York resident preparation; partial 2026–2027 federal calculations, with 2026 Schedule C/SE/8812 templates and 2027 workpapers only. Both years accept encrypted entity source intake while annual entity calculations/forms remain unavailable. Other states and unimplemented treatments need additional coverage. Production filing requires agency approval and transmission; a calculated draft is not a filed return.';
