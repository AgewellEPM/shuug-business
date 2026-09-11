import { describe, it, expect } from "vitest";
import { evaluateGuardrail, validateTarget } from "./guardrail";

describe("evaluateGuardrail", () => {
  const target = { targetFraction: 0.4, floorFraction: 0.3 };

  it("above: margin meets target (Joe's 42.7% vs 40%)", () => {
    const v = evaluateGuardrail(0.427, target);
    expect(v.status).toBe("above");
    expect(v.gapFraction).toBeCloseTo(0.027, 6);
  });

  it("warn: below target but above floor", () => {
    const v = evaluateGuardrail(0.35, target);
    expect(v.status).toBe("warn");
    expect(v.gapFraction).toBeCloseTo(-0.05, 6);
  });

  it("critical: below floor", () => {
    const v = evaluateGuardrail(0.25, target);
    expect(v.status).toBe("critical");
  });

  it("exactly at target counts as above (inclusive)", () => {
    expect(evaluateGuardrail(0.4, target).status).toBe("above");
  });

  it("exactly at floor is warn, not critical (floor is inclusive on warn side)", () => {
    expect(evaluateGuardrail(0.3, target).status).toBe("warn");
  });

  it("no floor: anything below target is warn", () => {
    expect(evaluateGuardrail(0.1, { targetFraction: 0.4 }).status).toBe("warn");
  });

  it("null margin is critical", () => {
    const v = evaluateGuardrail(null, target);
    expect(v.status).toBe("critical");
    expect(v.gapFraction).toBeNull();
  });
});

describe("validateTarget", () => {
  it("rejects out-of-range fractions", () => {
    expect(() => validateTarget({ targetFraction: 1 })).toThrow();
    expect(() => validateTarget({ targetFraction: -0.1 })).toThrow();
  });
  it("rejects floor above target", () => {
    expect(() => validateTarget({ targetFraction: 0.3, floorFraction: 0.4 })).toThrow();
  });
});
