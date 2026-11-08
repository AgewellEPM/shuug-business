import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { TaxOfficeWorkspace } from "./TaxOfficeWorkspace";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>>) => <a {...props}>{children}</a> }));

type Props = Parameters<typeof TaxOfficeWorkspace>[0];
const engagementId = "11111111-1111-4111-8111-111111111111", clientId = "22222222-2222-4222-8222-222222222222";
const firstStaff = "33333333-3333-4333-8333-333333333333", nextStaff = "44444444-4444-4444-8444-444444444444";
const evidenceId = "55555555-5555-4555-8555-555555555555", requestId = "66666666-6666-4666-8666-666666666666";
const selectedAttemptId = "77777777-7777-4777-8777-777777777777", closedAttemptId = "88888888-8888-4888-8888-888888888888";
const digest = "a".repeat(64), at = "2026-11-07T12:00:00Z";

function fixture(owner = false): Props {
  const event = { digest, channel: "Synthetic provider A", reference: "submission-A", evidenceDocumentId: evidenceId, actor: firstStaff, at, notes: "Synthetic external evidence", verification: "staff_recorded_external_evidence" as const };
  return {
    owner, canEdit: true, canMoney: true,
    clients: [{ id: clientId, name: "Synthetic client" }],
    employees: [{ id: firstStaff, name: "Original accountant" }, { id: nextStaff, name: "New accountant" }],
    cases: [{
      editable: true, client: { id: clientId, title: "Synthetic client" },
      engagement: { id: engagementId, values: { name: "Synthetic individual return", client_id: clientId, tax_year: 2026 }, archived: false, createdAt: at, updatedAt: at },
      book: null, readiness: [], approvalCurrent: true,
      requests: [{ id: requestId, values: { name: "External acknowledgment", purpose: "Filing acknowledgment" }, archived: false, createdAt: at, updatedAt: at, files: [{
        id: evidenceId, accountId: firstStaff, clientId, requestId, engagementId, name: "Synthetic reviewed acknowledgment.pdf", mime: "application/pdf", size: 100,
        digest: "b".repeat(64), createdAt: at, status: "reviewed", reviewedAt: at, reviewedBy: firstStaff,
      }] }],
      workflow: {
        id: engagementId, revision: 7, clientId, assignedAccountId: firstStaff, stage: "external_submission", waived: [], authorizationBindings: [], history: [],
        approval: { digest, returnDocumentId: "return-fixture", authorizationDocumentId: "authorization-fixture", reviewer: firstStaff, at, notes: "Synthetic reviewed package" },
        submissions: [
          { ...event, id: "open-attempt-A", outcome: "sent" },
          { ...event, id: selectedAttemptId, channel: "Synthetic provider B", reference: "submission-B", outcome: "sent" },
          { ...event, id: "old-package-attempt", digest: "c".repeat(64), reference: "obsolete-package", outcome: "sent" },
          { ...event, id: closedAttemptId, reference: "closed-submission", outcome: "sent" },
          { ...event, id: "closed-result", attemptId: closedAttemptId, reference: "closed-submission", outcome: "rejected" },
        ],
      },
    }],
  };
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ result: { id: engagementId } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

it.each(["accepted", "rejected"] as const)("records %s evidence against the selected sent attempt's provider, reference and package", async outcome => {
  render(<TaxOfficeWorkspace {...fixture()}/>);
  fireEvent.click(screen.getByText("Record external submission or acknowledgment"));
  const button = screen.getByRole("button", { name: "Record external filing evidence" }), form = button.closest("form")!;
  const fields = within(form);
  fireEvent.change(fields.getByLabelText("Outcome shown on the external evidence"), { target: { value: outcome } });
  const attempt = fields.getByLabelText(/Sent submission attempt/);
  expect(within(attempt).queryByRole("option", { name: /obsolete-package|closed-submission/ })).not.toBeInTheDocument();
  fireEvent.change(attempt, { target: { value: selectedAttemptId } });
  expect(fields.queryByLabelText("Filing channel / provider / authority")).not.toBeInTheDocument();
  expect(fields.queryByLabelText("Actual external submission reference")).not.toBeInTheDocument();
  fireEvent.change(fields.getByLabelText("Reviewed filing evidence"), { target: { value: evidenceId } });
  fireEvent.change(fields.getByLabelText("What you verified in the external evidence"), { target: { value: "Reviewed the synthetic acknowledgment against submission B." } });
  fireEvent.click(fields.getByLabelText("I reviewed these details."));
  fireEvent.click(button);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/tax-office");
  expect(JSON.parse(String(init?.body))).toMatchObject({ action: "submission.record", input: {
    id: engagementId, revision: 7, attemptId: selectedAttemptId, channel: "Synthetic provider B", reference: "submission-B", evidenceDocumentId: evidenceId,
    outcome, reviewed: true, notes: "Reviewed the synthetic acknowledgment against submission B.",
  } });
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});

it("lets the owner reassign the selected engagement and preserves its revision in the access change", async () => {
  render(<TaxOfficeWorkspace {...fixture(true)}/>);
  fireEvent.click(screen.getByText("Change assigned accountant"));
  const button = screen.getByRole("button", { name: "Save accountant assignment" }), form = button.closest("form")!, fields = within(form);
  expect(fields.getByLabelText("Assigned accountant")).toHaveValue(firstStaff);
  fireEvent.change(fields.getByLabelText("Assigned accountant"), { target: { value: nextStaff } });
  fireEvent.change(fields.getByLabelText("Reason for changing access"), { target: { value: "The owner assigned a different synthetic accountant." } });
  fireEvent.click(fields.getByLabelText("I reviewed these details."));
  fireEvent.click(button);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ action: "engagement.assign", input: {
    id: engagementId, revision: 7, accountantId: nextStaff, reviewed: true, notes: "The owner assigned a different synthetic accountant.",
  } });
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
});
