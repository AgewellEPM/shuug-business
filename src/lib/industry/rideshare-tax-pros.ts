import { assembleIndustry } from "./model";
import { taxFirmModules } from "@/modules/tax-firm";

const setup = assembleIndustry({
  industryId: "tax-firm", answers: { rideshare: true }, addedPacks: [], removedPacks: [],
  templateName: "Rideshare Tax Pros — Shuug Tax Firm", revision: 1,
});

/** A consultant template: branding and module definitions only, never client records or secrets. */
export const rideshareTaxProsTemplate = {
  version: 2,
  name: "Rideshare Tax Pros — Shuug Tax Firm v1",
  requiredModules: taxFirmModules.map(module => ({ id: module.id, version: module.version })),
  branding: {
    businessName: "Rideshare Tax Pros", tagline: "Tax & Accounting", logoText: "RTP", logoImageUrl: null,
    primaryColor: "#9425e8", accentColor: "#f51eea", backgroundColor: "#faf8fd", sidebarColor: "#f3edfa", headerColor: "#140c24",
    hiddenSections: [], organizationTypes: setup.organizationTypes, serviceTypes: setup.serviceTypes,
    featureVisibility: {}, industrySetup: setup.setup,
  },
  tools: [], enabledFeatures: [],
};
