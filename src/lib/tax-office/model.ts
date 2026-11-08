import { z } from "zod";
export interface TaxWorkflow {
  id:string; revision:number; clientId:string; assignedAccountId?:string; stage:"documents"|"preparation"|"review"|"approved"|"external_submission";
  waived:{requestId:string;reason:string;actor:string;at:string}[];
  approval:null|{digest:string;returnDocumentId:string;authorizationDocumentId:string;reviewer:string;at:string;notes:string};
  authorizationBindings:{authorizationDocumentId:string;authorizationDigest:string;returnDocumentId:string;digest:string;reviewer:string;at:string}[];
  submissions:{id:string;attemptId?:string;digest:string;channel:string;reference:string;evidenceDocumentId:string;outcome:"sent"|"accepted"|"rejected";actor:string;at:string;notes:string;verification:"staff_recorded_external_evidence"}[];
  history:{action:string;actor:string;at:string;notes:string}[];
}
export const taxCommand=z.object({requestId:z.uuid(),action:z.enum(["engagement.create","engagement.assign","request.create","request.waive","workflow.stage","workflow.approve","submission.record"]),input:z.record(z.string(),z.unknown())}).strict();
export const taxSchemas={
  "engagement.create":z.object({clientId:z.uuid(),name:z.string().trim().min(1).max(160),taxYear:z.number().int().min(1900).max(9999),accountantId:z.string().min(1).max(100),due:z.union([z.iso.date(),z.literal("")]),shareWithClient:z.boolean(),reviewed:z.literal(true)}).strict(),
  "engagement.assign":z.object({id:z.uuid(),revision:z.number().int().nonnegative(),accountantId:z.string().min(1).max(100),notes:z.string().trim().min(3).max(2000),reviewed:z.literal(true)}).strict(),
  "request.create":z.object({id:z.uuid(),revision:z.number().int().nonnegative(),name:z.string().trim().min(1).max(160),purpose:z.enum(["Client records","Prepared return","Client authorization","Filing acknowledgment"]),due:z.union([z.iso.date(),z.literal("")]),shareWithClient:z.boolean(),reviewed:z.literal(true)}).strict(),
  "request.waive":z.object({id:z.uuid(),revision:z.number().int().nonnegative(),requestId:z.uuid(),reason:z.string().trim().min(3).max(2000),reviewed:z.literal(true)}).strict(),
  "workflow.stage":z.object({id:z.uuid(),revision:z.number().int().nonnegative(),stage:z.enum(["documents","preparation","review"]),notes:z.string().trim().min(3).max(2000),reviewed:z.literal(true)}).strict(),
  "workflow.approve":z.object({id:z.uuid(),revision:z.number().int().nonnegative(),returnDocumentId:z.uuid(),authorizationDocumentId:z.uuid(),notes:z.string().trim().min(3).max(2000),reviewed:z.literal(true)}).strict(),
  "submission.record":z.object({id:z.uuid(),revision:z.number().int().nonnegative(),attemptId:z.uuid().optional(),channel:z.string().trim().min(2).max(160),reference:z.string().trim().min(1).max(200),evidenceDocumentId:z.uuid(),outcome:z.enum(["sent","accepted","rejected"]),notes:z.string().trim().min(3).max(2000),reviewed:z.literal(true)}).strict(),
} as const;
