import { describe, it, expect } from "vitest";
import { levelForXp, xpForLevelUp, titleForLevel, xpForPriority } from "./xp";

describe("levelForXp", () => {
  it("starts at level 1 with 0 XP", () => {
    const l = levelForXp(0);
    expect(l.level).toBe(1);
    expect(l.title).toBe("Rookie");
    expect(l.xpForNext).toBe(100);
    expect(l.progress).toBe(0);
  });

  it("levels up on the growing curve (100, 150, 200…)", () => {
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2); // 100 to reach L2
    expect(levelForXp(249).level).toBe(2);
    expect(levelForXp(250).level).toBe(3); // 100 + 150
    expect(levelForXp(450).level).toBe(4); // +200
  });

  it("reports progress inside the current level", () => {
    const l = levelForXp(175); // L2 start at 100, needs 150 -> 75 into level
    expect(l.level).toBe(2);
    expect(l.xpIntoLevel).toBe(75);
    expect(l.xpForNext).toBe(150);
    expect(l.progress).toBeCloseTo(0.5, 6);
  });

  it("unlocks titles as you climb", () => {
    expect(titleForLevel(1)).toBe("Rookie");
    expect(titleForLevel(5)).toBe("Contributor");
    expect(titleForLevel(10)).toBe("Pro");
    expect(titleForLevel(20)).toBe("Veteran");
    expect(titleForLevel(35)).toBe("Legend");
  });

  it("clamps negatives", () => {
    expect(levelForXp(-50).level).toBe(1);
    expect(levelForXp(-50).totalXp).toBe(0);
  });
});

describe("xpForPriority / xpForLevelUp", () => {
  it("rewards harder tasks more", () => {
    expect(xpForPriority("low")).toBe(10);
    expect(xpForPriority("medium")).toBe(25);
    expect(xpForPriority("high")).toBe(50);
  });
  it("level-up cost grows by 50", () => {
    expect(xpForLevelUp(1)).toBe(100);
    expect(xpForLevelUp(2)).toBe(150);
    expect(xpForLevelUp(3)).toBe(200);
  });
});
