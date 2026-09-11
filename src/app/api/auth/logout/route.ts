import { signOutEmployee } from "@/lib/auth/employees";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signOutOwner } from "@/lib/auth/owner-session";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { appBaseUrl } from "@/lib/connections/vault";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(appBaseUrl()).origin) return new Response("Origin not permitted", { status: 403 });
  const jar = await cookies(); signOutEmployee(jar.get(SESSION_COOKIE)?.value); jar.delete("dd_active_role"); signOutOwner(jar.get(SESSION_COOKIE)?.value); jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/api/auth/login", appBaseUrl()), 303);
}
