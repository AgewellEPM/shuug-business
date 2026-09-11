import { z } from "zod";
export const placeIdSchema=z.string().regex(/^[A-Za-z0-9_-]{5,200}$/);
export interface Place {
  id:string;name:string;address:string;phone:string|null;website:string|null;mapsUrl:string;
  lat:number;lng:number;businessStatus:string;hours:string[];types:string[];
}
export const prospectSchema=z.object({
  id:z.string().uuid(),placeId:placeIdSchema.nullable(),
  // Only merchant-entered details are persisted, alongside Google's stable Place ID.
  name:z.string().trim().max(160).default(""),address:z.string().trim().max(300).default(""),phone:z.string().trim().max(50).default(""),
  decisionMaker:z.string().trim().max(120).default(""),role:z.string().trim().max(120).default(""),email:z.union([z.email(),z.literal("")]).default(""),
  notes:z.string().trim().max(3000).default(""),status:z.enum(["new","to_visit","visited","follow_up","customer","not_a_fit"]).default("new"),
  nextVisit:z.string().max(40).default(""),createdAt:z.string(),updatedAt:z.string(),customerId:z.string().nullable().default(null),
});
export type Prospect=z.infer<typeof prospectSchema>;
export const visitListSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(120),prospectIds:z.array(z.string().uuid()).max(100),startAddress:z.string().trim().max(300),returnToStart:z.boolean(),updatedAt:z.string()});
export type VisitList=z.infer<typeof visitListSchema>;
export interface VisitState {prospects:Prospect[];lists:VisitList[];revision:number}
export interface RoutePlan {orderedIds:string[];distanceMeters:number;durationSeconds:number;legs:{durationSeconds:number;distanceMeters:number}[];polyline:string;source:"Google Routes"}
export const CATEGORIES=[{id:"deli",label:"Delis",query:"delis"},{id:"supermarket",label:"Supermarkets",query:"supermarkets"},{id:"independent",label:"Mom & pop",query:"independent grocery stores"},{id:"restaurant",label:"Restaurants",query:"restaurants"},{id:"specialty",label:"Specialty food",query:"specialty food stores"}] as const;
export const STATUS_LABELS={new:"New lead",to_visit:"To visit",visited:"Visited",follow_up:"Follow up",customer:"Customer",not_a_fit:"Not a fit"};
