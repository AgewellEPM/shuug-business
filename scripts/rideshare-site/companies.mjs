import { z } from 'zod';
import { deliveryCompanies } from './companies-delivery.mjs';
import { serviceCompanies } from './companies-services.mjs';

const text = z.string().trim().min(1).max(1800);
const section = z.object({ title: text, text }).strict();
const companySchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: text, audience: text,
  category: z.enum(['Rideshare', 'Delivery & shopping', 'Local services', 'Freelance & shifts']),
  searchTerms: z.array(text).min(4).max(8),
  description: text, intro: text,
  documents: z.array(section).min(3), watchout: section,
  expenses: z.array(section).min(3),
  faqs: z.array(z.object({ question: text, answer: text }).strict()).min(3),
  sources: z.array(z.object({ label: text, url: z.string().url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }) }).strict()).min(1),
  related: z.array(text).max(4),
}).strict();

export const companies = z.array(companySchema).parse([...deliveryCompanies, ...serviceCompanies])
  .sort((a, b) => a.name.localeCompare(b.name));
export const companyCategories = ['Rideshare', 'Delivery & shopping', 'Local services', 'Freelance & shifts'];
const ids = new Set(companies.map(company => company.id));
if (ids.size !== companies.length) throw new Error('Duplicate gig-company IDs.');
for (const company of companies) {
  if (company.related.some(id => !ids.has(id) || id === company.id)) throw new Error(`Invalid related company for ${company.id}`);
}
export const companyRoute = company => `gig-companies/${typeof company === 'string' ? company : company.id}-taxes`;
export const companyNames = Object.fromEntries(companies.map(company => [company.id, company.name]));
