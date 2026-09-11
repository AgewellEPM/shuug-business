import { z } from "zod";
import { requireIdentity } from "@/lib/auth/identity";
import { authPage, escapeHtml } from "@/lib/auth/forms";
import { submissionForUser } from "@/lib/getting-started/store";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireIdentity(), { id } = await context.params; z.uuid().parse(id);
    const request = submissionForUser(id, user.memberId, user.isOwner);
    if (!request) return authPage("Request unavailable", "<p>This request is not assigned to you.</p>", 404);
    return authPage(request.formTitle, `<p><strong>${escapeHtml(request.name)}</strong></p><p>${escapeHtml(request.email)}</p><p style="white-space:pre-wrap">${escapeHtml(request.message)}</p><p>Received ${escapeHtml(request.createdAt)}</p><p><a href="/me">Back to my work</a></p>`);
  } catch { return authPage("Sign in", '<p><a href="/api/auth/login">Sign in to view your assigned request.</a></p>', 401); }
}
