import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, HttpError, officeIdentity, officeInput, text } from '../../sales/model.mjs';

export function profileAt(root) {
  const file = resolve(root, 'workspace.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const name = text(raw.name, 100, true);
  if (!['project', 'tax'].includes(raw.directory) || !['agreement', 'membership'].includes(raw.contracts)) {
    throw new Error('Choose project or tax for directory and agreement or membership for contracts in workspace.json.');
  }
  const publicSite = raw.publicSite ? new URL(raw.publicSite) : null;
  if (publicSite && (publicSite.protocol !== 'https:' || publicSite.username || publicSite.password)) {
    throw new Error('Set publicSite to an HTTPS website or leave it blank.');
  }
  return { name, publicSite: publicSite?.href || '', directory: raw.directory, contracts: raw.contracts };
}

export function httpsSetting(name, value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(name + ' must be an HTTPS URL without embedded credentials.');
  }
  return url;
}

export function projectCatalogue(root) {
  const file = resolve(root, 'business-directory.json');
  if (statSync(file).size > 16_000_000) throw new Error('The project directory exceeds 16 MB.');
  const source = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(source) || source.length > 50_000) throw new Error('Use up to 50,000 project directory records.');
  const records = new Map();
  for (const record of source) {
    const input = officeInput(record);
    if (!input.source) throw new Error('Each directory record needs its published business source URL.');
    const identity = officeIdentity(input.name, input.address, input.city, input.state);
    records.set(identity, { ...input, candidateId: digest(identity).slice(0, 24), zip: input.postalCode, sourceKind: 'project',
      url: input.source, sourceURL: input.source, title: input.name, snippet: [input.address, input.city, input.phone].filter(Boolean).join(' · '), contactRole: 'unverified' });
  }
  return (region, locality) => {
    const query = locality.toLowerCase().trim();
    return [...records.values()].filter(row => row.state === region && (row.city.toLowerCase().includes(query) || row.zip.startsWith(query)));
  };
}

export function projectAgreement(input) {
  const business = text(input.business, 180, true);
  const title = text(input.agreementTitle, 180, true);
  const body = text(input.agreementText, 10_000, true);
  if (body.length < 100) throw new HttpError(400, 'Enter the complete project agreement before publishing.');
  if (input.approved !== true) throw new HttpError(400, 'Review and approve the agreement before publishing.');
  const content = `${title}\n\nContracting business: ${business}\n\n${body}\n`;
  return { title, business, text: content, hash: digest(content), version: new Date().toISOString(), published: true, paymentRequired: false };
}

export function projectOutreach(name, office) {
  return {
    message: `Hi ${office.contact_name || 'there'}, I’m reaching out to ${office.town} on behalf of ${name}. Would you be open to a short introduction to see whether there’s a fit?`,
    callScript: `Hi, I’m calling on behalf of ${name}. Who is the best person to speak with about a potential business relationship with ${office.town}?`,
    pitch: `${office.town} · ${office.state}\nAsk about their priorities and agree on a next step. Confirm any commitments in writing.`,
  };
}
