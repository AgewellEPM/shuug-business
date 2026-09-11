/** Wall-clock form values in the workspace timezone, independent of the server
 * and employee device. Ambiguous autumn times use the first occurrence; the
 * saved draft displays its offset before publication. Spring gaps are rejected. */
export function localDateTime(value: number | string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function instantsForLocal(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time.");
  const wall = Date.parse(`${value}:00Z`); if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) throw new Error("Enter a valid calendar date and time.");
  const offsets = new Set([-36, -24, -12, 0, 12, 24, 36].map(hours => { const probe = wall + hours * 3600000; return Date.parse(`${localDateTime(probe, timeZone)}:00Z`) - probe; }));
  const candidates = [...offsets].map(offset => wall - offset).filter(candidate => localDateTime(candidate, timeZone) === value).sort((a, b) => a - b);
  if (!candidates.length) throw new Error("That local time does not exist because the clocks move forward. Choose a valid time.");
  return candidates.map(candidate => new Date(candidate).toISOString());
}
export function instantForLocal(value: string, timeZone: string) { return instantsForLocal(value, timeZone)[0]; }
