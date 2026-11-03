import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rideshareTaxProsTemplate } from "../src/lib/industry/rideshare-tax-pros";
import { businessTemplateSchema } from "../src/lib/branding/templates";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "deployments/rideshare-tax-pros/workspace-template.json");
writeFileSync(destination, `${JSON.stringify(businessTemplateSchema.parse(rideshareTaxProsTemplate), null, 2)}\n`);
console.log(`Reusable Shuug workspace template saved to ${destination}`);
