import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
export const STAGES = ['new', 'researching', 'contacted', 'meeting', 'interested', 'invited', 'active', 'not_interested', 'do_not_contact'];
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const digest = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function text(value, max = 200, required = false) {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, 'Check the text fields and their length.');
  const clean = value.trim();
  if (required && !clean) throw new HttpError(400, 'Complete all required fields.');
  return clean;
}
export function email(value) { const v = text(value, 240, true).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, 'Enter a business email address.'); return v; }
export function state(value) { if (!STATES.includes(value)) throw new HttpError(400, 'Choose a US state or DC.'); return value; }
export function https(value) {
  if (!value) return '';
  const u = new URL(text(value, 1200));
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) throw new HttpError(400, 'Use a public business website.');
  return u.href;
}
export function seal(value, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
export function unseal(token, key) {
  try {
    const b = Buffer.from(token, 'base64url'), c = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), b.subarray(0, 12));
    c.setAuthTag(b.subarray(-16)); const value = JSON.parse(Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString());
    return value.exp > Date.now() ? value : null;
  } catch { return null; }
}
export function visible(user, lead) { return user.role === 'owner' || ((!user.states.length || user.states.includes(lead.state)) && String(lead.assigned_to) === String(user.id)); }
export function metadata(row) { try { return JSON.parse(row.notes || '{}'); } catch { throw new HttpError(502, 'A saved record needs repair. No changes were made.'); } }
export function officeInput(b) {
  return { name: text(b.name, 180, true), address: text(b.address, 300, true), city: text(b.city, 100, true), state: state(b.state), website: https(b.website || ''), email: b.email ? email(b.email) : '', phone: text(b.phone || '', 60), contact: text(b.contact || '', 140), source: https(b.source || ''), independence: ['unverified', 'independent', 'chain'].includes(b.independence) ? b.independence : 'unverified' };
}
export function termsValid(terms) { return terms?.published === true && typeof terms.text === 'string' && terms.text.length >= 100 && /^[a-f0-9]{64}$/.test(terms.hash) && digest(terms.text) === terms.hash; }
export function outreach(lead) {
  const name = lead.contact_name || 'there', office = lead.town;
  return {
    message: `Hi ${name}, I’m reaching out to ${office} about Gig Tax Pros’ independent office network. The idea is to keep your local ownership and client relationships while exploring shared branding, coordinated advertising and practical tools. Would you be open to a short conversation about whether the founding pilot fits your office?`,
    callScript: `Hi, may I speak with the owner of ${office}? I’m calling about Gig Tax Pros. We’re bringing independent tax offices together while keeping local ownership. How do you currently bring in new clients? Would a short discussion about the founding pilot be useful? Confirm scope, costs and written terms before promising benefits.`,
    pitch: `${office} · ${lead.state}\nKeep local ownership and client relationships. Explore shared resources and free owner workshops. Ask for a short fit conversation. Verify independent ownership; confirm every commercial commitment in writing.`,
  };
}
