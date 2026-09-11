/**
 * XP & leveling — a WoW-style progression so the team can see their level and
 * have fun hitting goals. Each level costs a bit more XP than the last; titles
 * unlock as you climb. Pure and deterministic.
 */
export interface LevelInfo {
  level: number;
  title: string;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP needed to reach the next level from the start of this one. */
  xpForNext: number;
  /** 0..1 progress through the current level. */
  progress: number;
  totalXp: number;
}

/** XP required to go from `level` to `level+1`. Grows 50 per level. */
export function xpForLevelUp(level: number): number {
  return 100 + Math.max(0, level - 1) * 50;
}

export function titleForLevel(level: number): string {
  if (level >= 35) return "Legend";
  if (level >= 20) return "Veteran";
  if (level >= 10) return "Pro";
  if (level >= 5) return "Contributor";
  return "Rookie";
}

/** Resolve total XP into a level + progress. */
export function levelForXp(totalXp: number): LevelInfo {
  const total = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = total;
  while (remaining >= xpForLevelUp(level)) {
    remaining -= xpForLevelUp(level);
    level += 1;
  }
  const xpForNext = xpForLevelUp(level);
  return {
    level,
    title: titleForLevel(level),
    xpIntoLevel: remaining,
    xpForNext,
    progress: xpForNext === 0 ? 0 : remaining / xpForNext,
    totalXp: total,
  };
}

export type TaskPriority = "low" | "medium" | "high";

/** XP awarded for completing a task of a given priority. */
export function xpForPriority(priority: TaskPriority): number {
  return priority === "high" ? 50 : priority === "medium" ? 25 : 10;
}
