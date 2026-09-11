import type { BusinessProfile } from "./trace";
import { persistentState } from "../workspace/state";
const legacy = globalThis as unknown as { __onboarding?: { profile?: BusinessProfile } };
const durable = persistentState<{ profile: BusinessProfile | null }>("onboarding", () => ({ profile: legacy.__onboarding?.profile ?? null }));
export function saveProfile(profile: BusinessProfile): void { durable.change(state => { state.profile = profile; }); }
export function getProfile(): BusinessProfile | null { return durable.read().profile; }
