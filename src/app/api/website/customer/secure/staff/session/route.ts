import { secureStaffSignIn, secureStaffSignOut } from "@/lib/secure-tax/staff-session";
import { secureOptions } from "@/lib/secure-tax/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = secureStaffSignIn;
export const DELETE = secureStaffSignOut;
export const OPTIONS = secureOptions;
