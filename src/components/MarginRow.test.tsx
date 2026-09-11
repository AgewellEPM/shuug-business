import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarginRow } from "./MarginRow";
import type { Sku } from "@/lib/data/model";

const ORIGINAL: Sku = {
  id: "shuug-amba",
  name: "Amba Hot Sauce",
  unitsPerCase: 12,
  retailPriceCents: 1199,
  costPerCaseCents: 2520,
  standardPriceCents: 4800,
};

function renderRow(sellCents: number) {
  render(
    <MarginRow
      sku={ORIGINAL}
      sellCents={sellCents}
      targetFraction={0.4}
      floorFraction={0.3}
      minCents={2000}
      maxCents={5520}
      onChange={vi.fn()}
    />,
  );
}

describe("MarginRow", () => {
  it("shows Joe's example numbers at $44.00 and a passing (above) status", () => {
    renderRow(4400);
    expect(screen.getByText("Amba Hot Sauce")).toBeInTheDocument();
    expect(screen.getByText("$18.80")).toBeInTheDocument(); // gross profit
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Margin status: above");
    expect(screen.getByText(/meets target/)).toBeInTheDocument();
  });

  it("warns when margin falls below target but above floor", () => {
    // sell 4000 -> margin (4000-2520)/4000 = 37.0% (< 40% target, > 30% floor)
    renderRow(4000);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Margin status: warn");
    expect(screen.getByText(/under target/)).toBeInTheDocument();
  });

  it("goes critical below the floor", () => {
    // sell 2600 -> margin ~3.1% (< 30% floor)
    renderRow(2600);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Margin status: critical");
    expect(screen.getByText(/BELOW the 30.0% floor/)).toBeInTheDocument();
  });
});
