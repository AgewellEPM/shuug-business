import { it, expect, afterEach } from "vitest";
import { cleanup, render, fireEvent, screen } from "@testing-library/react";
import { QbdManualCoverage } from "./QbdManualCoverage";
afterEach(cleanup);
it("filters the full manual by chapter, status and feature text without implying readiness", () => {
  render(<QbdManualCoverage />);
  expect(screen.queryByText(/% ready/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Manual chapter"), { target: { value: "7" } });
  expect(screen.getByText("Document fields and layout", { exact: false })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Implementation status"), { target: { value: "missing" } });
  expect(screen.getByRole("status")).toHaveTextContent("1 matching requirements");
  expect(screen.getByRole("link", { name: "Manual PDF page 82" })).toHaveAttribute("href", expect.stringContaining("#page=82"));
  fireEvent.change(screen.getByLabelText("Find a manual feature"), { target: { value: "does not exist" } });
  expect(screen.getByText("No requirements match these filters.")).toBeInTheDocument();
});
