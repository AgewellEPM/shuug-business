/**
 * Assessments store — durable (assessments.json). Holds completed assessments with
 * their scored result snapshot, so history and pass-rates survive without recomputing.
 * Atomic write, globalThis cache.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDirectory } from "../connections/vault";
import { assessmentById } from "./catalog";
import { scoreAssessment, type Responses, type AssessmentResult } from "./model";

export interface CompletedAssessment {
  id: string;
  templateId: string;
  templateName: string;
  subject: string;
  assessor: string;
  responses: Responses;
  result: AssessmentResult;
  createdAt: string;
}

const holder = globalThis as unknown as { __assessments?: CompletedAssessment[] };
const file = () => path.join(dataDirectory(), "assessments.json");

function loadFromDisk(): CompletedAssessment[] | null {
  try { const v = JSON.parse(readFileSync(file(), "utf8")); return Array.isArray(v) ? v : null; } catch { return null; }
}
function persist(list: CompletedAssessment[]) {
  holder.__assessments = list;
  const dir = dataDirectory();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `assessments-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(list), { mode: 0o600 });
  renameSync(tmp, file());
}
function state(): CompletedAssessment[] {
  if (holder.__assessments) return holder.__assessments;
  holder.__assessments = loadFromDisk() ?? [];
  return holder.__assessments;
}

export function listCompleted(templateId?: string): CompletedAssessment[] {
  return state().filter((a) => !templateId || a.templateId === templateId)
    .slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => ({ ...a }));
}
export function getCompleted(id: string): CompletedAssessment | null {
  const a = state().find((x) => x.id === id);
  return a ? { ...a } : null;
}

export interface NewCompleted { templateId: string; subject: string; assessor: string; responses: Responses }
export function saveCompleted(input: NewCompleted): CompletedAssessment {
  const template = assessmentById(input.templateId);
  if (!template) throw new Error("Unknown assessment template.");
  const record: CompletedAssessment = {
    id: randomUUID(), templateId: template.id, templateName: template.name,
    subject: input.subject.trim().slice(0, 160) || template.subjectLabel,
    assessor: input.assessor.trim().slice(0, 120),
    responses: input.responses,
    result: scoreAssessment(template, input.responses),
    createdAt: new Date().toISOString(),
  };
  persist([...state(), record]);
  return record;
}

export function removeCompleted(id: string): void {
  persist(state().filter((a) => a.id !== id));
}
