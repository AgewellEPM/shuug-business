import { readFileSync } from 'node:fs';

const { records, sources } = JSON.parse(readFileSync(new URL('./facility-leadership-data.json', import.meta.url)));

export function nationalFacilityAdministrator(row) {
  const record = row.cms?.id && records[row.cms.id];
  if (!record || record.state !== row.state || record.city.toLowerCase() !== row.city?.trim().toLowerCase()) return null;
  const source = sources[record.source];
  return { name: record.name, title: record.title, email: record.email || '', phone: row.phone,
    sourceURL: source.url, sourceName: source.name, checkedOn: source.date };
}
