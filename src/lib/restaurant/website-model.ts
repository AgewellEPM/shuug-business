import { restaurantOrderLineInput } from "./modifier-model";
import { z } from "zod";
import { specialCodeInput } from "./special-model";
import type { RestaurantBusiness } from "./business-model";
export interface RestaurantWebsite { enabled: boolean; origins: string[]; instructions: string; revision: number; slots: { id: string; at: string; capacity: number; enabled: boolean; revision: number }[]; orders: { orderId: string; requestId: string; request: string; slotId: string; phone: string; email: string }[] }
export function restaurantWebsite(b: RestaurantBusiness): RestaurantWebsite { return b.website ??= { enabled: false, origins: [], instructions: "Collect your order at the restaurant and pay at pickup.", revision: 1, slots: [], orders: [] }; }
export const restaurantWebsiteInput = z.object({ revision: z.number().int().positive(), enabled: z.boolean(), origins: z.array(z.string().max(250)).max(8), instructions: z.string().trim().min(10).max(1000) }).strict();
export const pickupSlotInput = z.object({ id: z.uuid().optional(), revision: z.number().int().positive().optional(), at: z.iso.datetime({ offset: true }), capacity: z.number().int().min(1).max(100), enabled: z.boolean() }).strict();
export const pickupRequestInput = z.object({ specialCode: specialCodeInput.optional(), slotId: z.uuid(), name: z.string().trim().min(1).max(100), phone: z.string().trim().min(5).max(40), email: z.union([z.email().max(160), z.literal("")]), note: z.string().trim().max(200), consent: z.literal(true), lines: z.array(restaurantOrderLineInput.extend({ qty: z.number().int().min(1).max(20) })).min(1).max(20) }).strict();
