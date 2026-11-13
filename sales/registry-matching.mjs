// Shared matching for official state records. Names, service addresses and agents
// are evidence for review, never an ownership finding.
export const normalizedBusiness = value => String(value || '').toUpperCase().replace(/&/g, ' AND ').replace(/\b(?:L\.?L\.?C\.?|INCORPORATED|INC|CORPORATION|CORP|LLP|LP|PC)\b\.?/g, '').replace(/[^A-Z0-9]/g, '');
const street = value => String(value || '').toUpperCase().replace(/\b(?:STREET|ROAD|AVENUE|BOULEVARD|DRIVE|LANE|COURT|PLACE|SUITE)\b/g, word => ({ STREET:'ST', ROAD:'RD', AVENUE:'AVE', BOULEVARD:'BLVD', DRIVE:'DR', LANE:'LN', COURT:'CT', PLACE:'PL', SUITE:'STE' })[word]).replace(/\b(?:STE|UNIT|APT|FLOOR|FL)\b.*$/, '').replace(/[^A-Z0-9]/g, '');
const anchors = value => String(value || '').toUpperCase().match(/[A-Z0-9]+/g)?.filter(word => word.length > 2 && !['LLC','INC','CORP','AND','THE','TAX','TAXES','ACCOUNTING','SERVICES','SERVICE','SOLUTION','SOLUTIONS','COMPANY'].includes(word)) || [];
export const isTaxBusiness = row => /\b(?:tax|taxes|taxation|accounting|accountant|accountants|bookkeeping|bookkeeper)\b/i.test(row.name || '') || /54121[139]/.test(`${row.industry || ''} ${row.naics_code || ''} ${row.naics_sub_code || ''}`);
export function matchBusiness(candidate, record) {
  const name = normalizedBusiness(candidate.name), sameName = Boolean(name) && normalizedBusiness(record.name) === name;
  const sameCity = String(record.city || '').trim().toUpperCase() === String(candidate.city || '').trim().toUpperCase();
  const sameAddress = Boolean(street(candidate.address)) && street(record.address) === street(candidate.address) && sameCity && record.state === candidate.state;
  const words = new Set(anchors(record.name)), significant = anchors(candidate.name);
  const relatedName = sameCity && record.state === candidate.state && isTaxBusiness(record) && significant.length > 0 && significant.every(word => words.has(word));
  const sameId = Boolean(candidate.registryId) && candidate.registryId === record.registryId && (!candidate.registryState || candidate.registryState === record.registryState);
  const match = sameId ? 'registry_record' : sameName && sameAddress ? 'name_and_address' : sameName ? 'name_only' : relatedName ? 'related_name' : sameAddress && isTaxBusiness(record) ? 'address_only' : null;
  return match ? { ...record, match, score:({registry_record:6,name_and_address:5,name_only:4,related_name:3,address_only:2})[match] } : null;
}
