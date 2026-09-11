import { requireIdentity } from "@/lib/auth/identity";
import type { Metadata } from "next";
import { getBranding } from "@/lib/branding/store";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { NotesRailMount } from "@/components/NotesRailMount";
import { NeedsAttentionBar } from "@/components/NeedsAttentionBar";
import { toolLinks } from "@/lib/features/store";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { getActiveRole } from "@/lib/permissions/active";
import { getMatrix } from "@/lib/permissions/store";
import { allowedSections } from "@/lib/permissions/model";
import { cookies } from "next/headers";
import type { SalesChannel } from "@/lib/data/channels";
import { activeWorkspace } from "@/lib/navigation/active-profile";
import type { CSSProperties } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBranding();
  return { title: `${brand.businessName} ${brand.tagline}`.trim(), description: "Your organization workspace", icons: { icon: "/api/workspace/icon" } };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await requireWorkspaceAccess();
  const user = await requireIdentity();
  const activeRole = await getActiveRole();
  const allowed = allowedSections(getMatrix(), activeRole).filter(section => user.isOwner || section !== "admin");
  const ch = (await cookies()).get("dd_channel")?.value;
  const initialChannel = (ch === "bulk" || ch === "stores" || ch === "online" ? ch : "all") as SalesChannel;
  const { branding, profile } = await activeWorkspace();
  const brandVars = { "--brand": branding.primaryColor, "--brand-accent": branding.accentColor, "--brand-bg": branding.backgroundColor, "--brand-sidebar": branding.sidebarColor, "--brand-header": branding.headerColor } as CSSProperties;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-slate-900" style={brandVars}>
        <WorkspaceShell user={user} tools={toolLinks()} allowedSections={allowed} activeRole={activeRole} initialChannel={initialChannel} initialProfile={profile} branding={branding}>
          {user.isOwner && <NeedsAttentionBar />}
          {children}
        </WorkspaceShell>
        <NotesRailMount />
      </body>
    </html>
  );
}
