import { describe, it, expect } from "vitest";
import { microsToCents, centsToMicros, mapKeywordIdea, mapKeywordIdeas } from "./google-ads-map";

describe("micros conversions", () => {
  it("converts micros to cents", () => {
    expect(microsToCents(2_400_000)).toBe(240); // $2.40
    expect(microsToCents(0)).toBe(0);
    expect(microsToCents(-5)).toBe(0);
  });
  it("converts cents to micros", () => {
    expect(centsToMicros(240)).toBe(2_400_000);
  });
});

describe("mapKeywordIdea", () => {
  it("uses the midpoint of low/high top-of-page bids and string metrics", () => {
    const k = mapKeywordIdea({
      text: "wholesale hot sauce",
      keywordIdeaMetrics: {
        avgMonthlySearches: "1900",
        lowTopOfPageBidMicros: "1500000", // $1.50
        highTopOfPageBidMicros: "3300000", // $3.30
      },
    });
    expect(k.keyword).toBe("wholesale hot sauce");
    expect(k.monthlySearches).toBe(1900);
    // midpoint = 2,400,000 micros = $2.40 = 240 cents
    expect(k.cpcCents).toBe(240);
  });

  it("falls back to whichever bid is present, and unknown metrics when missing", () => {
    expect(mapKeywordIdea({ text: "x", keywordIdeaMetrics: { highTopOfPageBidMicros: 2_000_000 } }).cpcCents).toBe(200);
    const bare = mapKeywordIdea({ text: "y" });
    expect(bare.cpcCents).toBeNull();
    expect(bare.monthlySearches).toBeNull();
  });

  it("drops empty keywords in the list mapper", () => {
    expect(mapKeywordIdeas([{ text: "" }, { text: "real" }])).toHaveLength(1);
  });
});
