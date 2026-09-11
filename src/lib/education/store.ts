/**
 * Childcare & education store — durable (education.json): students (children/pupils)
 * with guardians + authorized pickups, classes/lessons (daycare rooms, art class, swim
 * levels), enrollments, and attendance punches. Ships with a few classes so the room
 * isn't empty. Atomic write, globalThis cache.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import type { AgeGroup, AttendanceRecord } from "./model";

export type ClassKind = "daycare" | "art" | "swim" | "music" | "dance" | "tutoring" | "sports" | "other";

export interface Guardian { name: string; phone: string; relationship: string }
export interface Student {
  id: string;
  name: string;
  dobISO: string;
  guardians: Guardian[];
  authorizedPickups: string[];
  notes: string;
  createdAt: string;
}
export interface EdClass {
  id: string;
  name: string;
  kind: ClassKind;
  ageGroup: AgeGroup | null;
  capacity: number;
  schedule: string;   // "Mon/Wed 4:00pm"
  level: string;      // "Level 1", "Beginner"…
  priceCents: number; // tuition/fee per period
}
export interface Enrollment { id: string; studentId: string; classId: string; createdAt: string }

interface State { students: Student[]; classes: EdClass[]; enrollments: Enrollment[]; attendance: AttendanceRecord[] }
const holder = globalThis as unknown as { __education?: State };
const file = () => path.join(dataDirectory(), "education.json");

function seed(): State {
  const c = (name: string, kind: ClassKind, ageGroup: AgeGroup | null, capacity: number, schedule: string, level: string, priceCents: number): EdClass => ({ id: randomUUID(), name, kind, ageGroup, capacity, schedule, level, priceCents });
  return {
    students: [],
    classes: [
      c("Toddler Room", "daycare", "toddler", 12, "Mon–Fri all day", "", 90000),
      c("Preschool Room", "daycare", "preschool", 20, "Mon–Fri all day", "", 85000),
      c("Swim — Level 1", "swim", null, 6, "Sat 9:00am", "Level 1", 12000),
      c("Swim — Level 2", "swim", null, 6, "Sat 10:00am", "Level 2", 12000),
      c("Kids Art Class", "art", null, 12, "Wed 4:00pm", "", 8000),
    ],
    enrollments: [],
    attendance: [],
  };
}

function loadFromDisk(): State | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return v && Array.isArray(v.students) ? { students: v.students, classes: v.classes ?? [], enrollments: v.enrollments ?? [], attendance: v.attendance ?? [] } : null; } catch { return null; }
}
function persist(s: State) {
  holder.__education = s;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `education-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): State {
  if (holder.__education) return holder.__education;
  const disk = loadFromDisk();
  holder.__education = disk ?? seed();
  if (!disk) persist(holder.__education);
  return holder.__education;
}

export function listStudents(): Student[] { return state().students.map((s) => ({ ...s, guardians: s.guardians.map((g) => ({ ...g })), authorizedPickups: [...s.authorizedPickups] })); }
export function listClasses(): EdClass[] { return state().classes.map((c) => ({ ...c })); }
export function listEnrollments(): Enrollment[] { return state().enrollments.map((e) => ({ ...e })); }
export function listAttendance(): AttendanceRecord[] { return state().attendance.map((a) => ({ ...a })); }

export interface NewStudent { name: string; dobISO: string; guardians?: Guardian[]; authorizedPickups?: string[]; notes?: string }
export function addStudent(input: NewStudent): Student {
  const s = state();
  const student: Student = {
    id: randomUUID(), name: input.name.trim().slice(0, 120) || "Child",
    dobISO: /^\d{4}-\d{2}-\d{2}$/.test(input.dobISO) ? input.dobISO : "",
    guardians: (input.guardians ?? []).slice(0, 6).map((g) => ({ name: g.name.slice(0, 100), phone: g.phone.slice(0, 40), relationship: g.relationship.slice(0, 40) })),
    authorizedPickups: (input.authorizedPickups ?? []).slice(0, 12).map((p) => p.slice(0, 100)),
    notes: (input.notes ?? "").slice(0, 500), createdAt: new Date().toISOString(),
  };
  persist({ ...s, students: [...s.students, student] });
  return student;
}
export function removeStudent(id: string): void {
  const s = state();
  persist({ ...s, students: s.students.filter((x) => x.id !== id), enrollments: s.enrollments.filter((e) => e.studentId !== id) });
}

export interface NewClass { name: string; kind: ClassKind; ageGroup?: AgeGroup | null; capacity: number; schedule?: string; level?: string; priceCents?: number }
export function addClass(input: NewClass): EdClass {
  const s = state();
  const cls: EdClass = {
    id: randomUUID(), name: input.name.trim().slice(0, 120) || "Class", kind: input.kind,
    ageGroup: input.ageGroup ?? null, capacity: Math.max(1, Math.min(500, Math.round(input.capacity))),
    schedule: (input.schedule ?? "").slice(0, 120), level: (input.level ?? "").slice(0, 60), priceCents: Math.max(0, Math.round(input.priceCents ?? 0)),
  };
  persist({ ...s, classes: [...s.classes, cls] });
  return cls;
}
export function removeClass(id: string): void {
  const s = state();
  persist({ ...s, classes: s.classes.filter((c) => c.id !== id), enrollments: s.enrollments.filter((e) => e.classId !== id) });
}

export function enroll(studentId: string, classId: string): Enrollment {
  const s = state();
  if (s.enrollments.some((e) => e.studentId === studentId && e.classId === classId)) throw new Error("Already enrolled.");
  const cls = s.classes.find((c) => c.id === classId);
  if (!cls) throw new Error("Class not found.");
  if (s.enrollments.filter((e) => e.classId === classId).length >= cls.capacity) throw new Error(`${cls.name} is full.`);
  const en: Enrollment = { id: randomUUID(), studentId, classId, createdAt: new Date().toISOString() };
  persist({ ...s, enrollments: [...s.enrollments, en] });
  return en;
}
export function unenroll(id: string): void {
  const s = state();
  persist({ ...s, enrollments: s.enrollments.filter((e) => e.id !== id) });
}

export function checkIn(studentId: string, by: string, dateISO: string, nowMs = Date.now()): AttendanceRecord {
  const s = state();
  if (s.attendance.some((a) => a.studentId === studentId && a.dateISO === dateISO && a.checkOutMs === null)) throw new Error("Already checked in.");
  const rec: AttendanceRecord = { id: randomUUID(), studentId, dateISO, checkInMs: nowMs, checkOutMs: null, checkedInBy: by.slice(0, 100), checkedOutBy: "" };
  persist({ ...s, attendance: [...s.attendance, rec] });
  return rec;
}
export function checkOut(studentId: string, by: string, dateISO: string, nowMs = Date.now()): AttendanceRecord {
  const s = state();
  const open = s.attendance.find((a) => a.studentId === studentId && a.dateISO === dateISO && a.checkOutMs === null);
  if (!open) throw new Error("Not checked in.");
  const closed: AttendanceRecord = { ...open, checkOutMs: nowMs, checkedOutBy: by.slice(0, 100) };
  persist({ ...s, attendance: s.attendance.map((a) => (a.id === open.id ? closed : a)) });
  return closed;
}
