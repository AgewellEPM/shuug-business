/**
 * White-label branding — make the whole app feel like the customer's brand:
 * business name, tagline, logo mark, and brand colors (applied app-wide via CSS
 * variables), plus org-level "permanently hidden" sections the owner can switch
 * off for everyone. Durable (branding.json). This is the dev-friendly config box:
 * open source, self-hostable, every surface the/ownable.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { z } from "zod";
import { industrySetupSchema, type IndustrySetup } from "../industry/model";
import { organizationTypes, serviceTypes, navigationGroups, type OrganizationType, type ServiceType } from "../navigation/catalog";

export interface Branding {
  businessName: string;
  tagline: string;
  /** short logo mark (1–3 chars / emoji) shown when no image is uploaded. */
  logoText: string;
  /** uploaded logo/icon as a data URL (small — capped ~64KB). null = use logoText. */
  logoImageUrl: string | null;
  /** primary brand color (buttons, accents) — any CSS hex. */
  primaryColor: string;
  /** accent color (logo tile, highlights). */
  accentColor: string;
  /** app background (main canvas) — any CSS hex. */
  backgroundColor: string;
  /** sidebar background — any CSS hex. */
  sidebarColor: string;
  /** top header bar background — any CSS hex. */
  headerColor: string;
  /** nav category labels the owner has permanently switched off for everyone. */
  hiddenSections: string[];
  organizationTypes: OrganizationType[];
  serviceTypes: ServiceType[];
  featureVisibility: Record<string, boolean>;
  industrySetup?: IndustrySetup | null;
}

export const DEFAULT_BRANDING: Branding = {
  businessName: "Shuug",
  tagline: "business",
  logoText: "s",
  logoImageUrl: null,
  primaryColor: "#2c4939",
  accentColor: "#c5edaa",
  backgroundColor: "#f5f5f4",
  sidebarColor: "#edeeeb",
  headerColor: "#202b28",
  hiddenSections: [],
  organizationTypes: ["product"],
  serviceTypes: [],
  featureVisibility: {},
  industrySetup: null,
};

const MAX_LOGO_BYTES = 64 * 1024;
/** Accept only a small image data URL; reject anything else (or clear with null). */
function cleanLogoImage(v: string | null | undefined, current: string | null): string | null {
  if (v === null) return null;
  if (v === undefined) return current;
  if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(v) && v.length <= MAX_LOGO_BYTES) return v;
  return current;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const file = () => path.join(dataDirectory(), "branding.json");
const visibilitySchema = z.record(z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/), z.boolean());
export const brandingPatchSchema = z.object({
  businessName: z.string().max(200).optional(), tagline: z.string().max(200).optional(), logoText: z.string().max(100).optional(),
  logoImageUrl: z.string().max(MAX_LOGO_BYTES).nullable().optional(), primaryColor: z.string().max(30).optional(), accentColor: z.string().max(30).optional(),
  backgroundColor: z.string().max(30).optional(), sidebarColor: z.string().max(30).optional(), headerColor: z.string().max(30).optional(),
  hiddenSections: z.array(z.string().refine(value => value === "Workspace" || navigationGroups.some(group => group.label === value))).max(11).optional(),
  organizationTypes: z.array(z.enum(organizationTypes)).min(1).max(3).optional(), serviceTypes: z.array(z.enum(serviceTypes)).max(4).optional(),
  featureVisibility: visibilitySchema.optional(),
  industrySetup: industrySetupSchema.nullable().optional(),
}).strict();

function loadFromDisk(): Branding | null {
  try {
    const v = JSON.parse(readFileSync(file(), "utf8"));
    if (!v || typeof v.businessName !== "string") return null;
    return { ...DEFAULT_BRANDING, ...v, hiddenSections: Array.isArray(v.hiddenSections) ? v.hiddenSections : [],
      organizationTypes: z.array(z.enum(organizationTypes)).min(1).max(3).parse(v.organizationTypes ?? ["product"]),
      serviceTypes: z.array(z.enum(serviceTypes)).max(4).parse(v.serviceTypes ?? []), featureVisibility: visibilitySchema.parse(v.featureVisibility ?? {}), industrySetup: industrySetupSchema.nullable().parse(v.industrySetup ?? null) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Saved branding could not be read. Restore branding.json before making changes.");
  }
}
function persist(b: Branding) {
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `branding-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(b), { mode: 0o600 });
  renameSync(tmp, file());
}

export function getBranding(): Branding {
  // Read the durable file so every Next worker sees the owner's latest settings.
  return loadFromDisk() ?? structuredClone(DEFAULT_BRANDING);
}

export interface BrandingPatch {
  businessName?: string;
  tagline?: string;
  logoText?: string;
  logoImageUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  sidebarColor?: string;
  headerColor?: string;
  hiddenSections?: string[];
  organizationTypes?: OrganizationType[];
  serviceTypes?: ServiceType[];
  featureVisibility?: Record<string, boolean>;
  industrySetup?: IndustrySetup | null;
}

/** Validate + save a branding change; ignores bad colors rather than crashing. */
export function saveBranding(patch: BrandingPatch): Branding {
  patch = brandingPatchSchema.parse(patch);
  const cur = getBranding();
  const next: Branding = {
    businessName: (patch.businessName ?? cur.businessName).slice(0, 40) || cur.businessName,
    tagline: (patch.tagline ?? cur.tagline).slice(0, 40),
    logoText: [...(patch.logoText ?? cur.logoText)].slice(0, 3).join("") || cur.logoText, // code-point aware so emoji survive
    logoImageUrl: cleanLogoImage(patch.logoImageUrl, cur.logoImageUrl),
    primaryColor: patch.primaryColor && HEX.test(patch.primaryColor) ? patch.primaryColor : cur.primaryColor,
    accentColor: patch.accentColor && HEX.test(patch.accentColor) ? patch.accentColor : cur.accentColor,
    backgroundColor: patch.backgroundColor && HEX.test(patch.backgroundColor) ? patch.backgroundColor : cur.backgroundColor,
    sidebarColor: patch.sidebarColor && HEX.test(patch.sidebarColor) ? patch.sidebarColor : cur.sidebarColor,
    headerColor: patch.headerColor && HEX.test(patch.headerColor) ? patch.headerColor : cur.headerColor,
    hiddenSections: patch.hiddenSections ?? cur.hiddenSections,
    organizationTypes: [...new Set(patch.organizationTypes ?? cur.organizationTypes)],
    serviceTypes: [...new Set(patch.serviceTypes ?? cur.serviceTypes)],
    featureVisibility: patch.featureVisibility ?? cur.featureVisibility,
    industrySetup: patch.industrySetup === undefined ? cur.industrySetup : patch.industrySetup,
  };
  persist(next);
  return next;
}

/** Readable text color for a given hex background (black or white). */
export function readableOn(hex: string): "#0f172a" | "#ffffff" {
  if (!HEX.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  // relative luminance
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#0f172a" : "#ffffff";
}
