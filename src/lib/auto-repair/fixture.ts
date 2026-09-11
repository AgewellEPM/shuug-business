/** Synthetic definitions shared by acceptance tests. Never installed as live rates. */
import type { PricingDefinition, EstimateInput } from "./model";
export const fixturePricing = (today: string): PricingDefinition => ({ name: "Fixture repair pricing", version: 1, currency: "USD", effectiveFrom: today, effectiveTo: null,
  labor: [{ category: "Mechanical", hourlyRate: 12345, minimumMinutes: 30, incrementMinutes: 15 }],
  parts: [{ category: "Standard", bands: [{ fromCost: 0, untilCost: 10000, markupBasisPoints: 5000 }, { fromCost: 10000, untilCost: null, markupBasisPoints: 2500 }] }],
});
export const fixtureEstimate = (bookId: string, vehicleId: string, today: string): EstimateInput => ({ bookId, vehicleId, title: "Fixture brake service", scope: "Replace pads and inspect brakes", exclusions: "Rotors and additional work require a new agreement", expires: today,
  labor: [{ category: "Mechanical", description: "Brake labor", minutes: 31 }], parts: [{ category: "Standard", description: "Brake pad set", unitCost: 101, quantity: 3 }], laborTaxBasisPoints: 0, partsTaxBasisPoints: 625, taxReviewed: true, taxReview: "PRIVATE fixture tax review evidence" });
