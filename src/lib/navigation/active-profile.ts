import { cookies } from "next/headers";
import { getBranding } from "../branding/store";
import { profileConfig, type WorkspaceProfile } from "./catalog";
export async function activeWorkspace() {
  const branding = getBranding(), saved = (await cookies()).get("dd_workspace_profile")?.value;
  const profile: WorkspaceProfile = branding.organizationTypes.some(type => type === saved) ? saved as WorkspaceProfile : "all";
  return { branding, profile, config: profileConfig(branding, profile) };
}
