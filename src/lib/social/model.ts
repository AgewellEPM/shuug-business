import { z } from "zod";
import { dateOnly } from "../expenses/model";
export const PLATFORMS=["instagram","facebook","tiktok","youtube","linkedin","pinterest","x","threads","bluesky","other"] as const;
export type Platform=typeof PLATFORMS[number];
export const PLATFORM_NAMES:Record<Platform,string>={instagram:"Instagram",facebook:"Facebook",tiktok:"TikTok",youtube:"YouTube",linkedin:"LinkedIn",pinterest:"Pinterest",x:"X",threads:"Threads",bluesky:"Bluesky",other:"Other platform"};
export const webUrl=z.string().max(2000).refine(s=>{if(!s)return true;try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port;}catch{return false;}},"Use a public HTTPS URL.");
export const brandSchema=z.object({name:z.string().trim().min(1).max(100),website:webUrl,audience:z.string().trim().max(1500),voice:z.string().trim().max(1000),description:z.string().trim().max(2500),approvedClaims:z.string().trim().max(2000),avoid:z.string().trim().max(2000),colors:z.string().trim().max(150),timezone:z.string().max(80).refine(s=>{try{new Intl.DateTimeFormat("en-US",{timeZone:s});return true;}catch{return false;}},"Choose a valid business timezone."),postsPerWeek:z.number().int().min(1).max(14),platforms:z.array(z.enum(PLATFORMS)).min(1).max(10),referenceAssetIds:z.array(z.uuid()).max(4)});
export type Brand=z.infer<typeof brandSchema>;
export const defaultBrand=():Brand=>({name:"Shuug",website:"",audience:"Home cooks, grocery buyers and food-service businesses",voice:"Warm, practical, confident. Show the product in everyday use.",description:"",approvedClaims:"",avoid:"Unverified health claims, invented testimonials, fake discounts or retailer relationships.",colors:"Forest green, warm cream",timezone:"America/New_York",postsPerWeek:3,platforms:["instagram","facebook"],referenceAssetIds:[]});
export const accountSchema=z.object({id:z.uuid(),platform:z.enum(PLATFORMS),label:z.string().trim().min(1).max(120),handle:z.string().trim().min(1).max(200),role:z.enum(["brand","competitor"]),method:z.enum(["api","import"]),profileUrl:webUrl,revision:z.number().int().positive(),disabled:z.boolean(),createdAt:z.string()});
export type SocialAccount=z.infer<typeof accountSchema>;
export const metric=z.number().finite().nullable();
export const metricSchema=z.object({views:metric,impressions:metric,reach:metric,likes:metric,comments:metric,shares:metric,saves:metric,clicks:metric});
export type SocialMetrics=z.infer<typeof metricSchema>;
export const emptyMetrics=():SocialMetrics=>({views:null,impressions:null,reach:null,likes:null,comments:null,shares:null,saves:null,clicks:null});
export const postSchema=z.object({id:z.string().min(1).max(300),url:webUrl,publishedAt:z.string().datetime({offset:true}),text:z.string().max(8000),format:z.string().max(80),metrics:metricSchema});
export type SocialPost=z.infer<typeof postSchema>;
export interface SocialSnapshot {id:string;accountId:string;at:string;source:"api"|"import";followers:number|null;posts:SocialPost[];period:{start:string;end:string}|null;periodMetrics:SocialMetrics|null;partial:boolean;warnings:string[];sourceUrl:string;fingerprint?:string}
export interface TrafficRow {date:string;sessions:number;engagedSessions:number;purchases:number;revenue:number}
export interface TrafficSegment {name:string;sessions:number;purchases:number;revenue:number}
export interface TrafficReport {id:string;at:string;propertyId:string;propertyName:string;timezone:string;currency:string;start:string;end:string;daily:TrafficRow[];sources:TrafficSegment[];landingPages:TrafficSegment[];campaigns:TrafficSegment[];partial:boolean;warnings:string[];source:"ga4"|"import"}
export const campaignFields=z.object({title:z.string().trim().min(1).max(180),date:dateOnly,time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),timezone:brandSchema.shape.timezone,platform:z.enum(PLATFORMS),format:z.enum(["Photo","Carousel","Short video","Story","Text","Video"]),channel:z.enum(["bulk","stores","online","all"]),objective:z.enum(["Awareness","Website visits","Sales","Retail outreach","Community"]),productId:z.string().max(150),productName:z.string().max(180),caption:z.string().max(6000),headline:z.string().max(150),cta:z.string().max(120),destination:webUrl,creativeBrief:z.string().max(6000),reason:z.string().max(3000),evidence:z.array(z.string().max(500)).max(20),hypothesis:z.string().max(1000),measure:z.string().max(1000),assetIds:z.array(z.uuid()).max(8),publishedUrl:webUrl});
export type CampaignFields=z.infer<typeof campaignFields>;
export type CampaignStatus="draft"|"ready"|"published"|"archived";
export interface SocialCampaign {id:string;revision:number;createdAt:string;updatedAt:string;status:CampaignStatus;fields:CampaignFields;history:{at:string;revision:number;status:CampaignStatus;fields:CampaignFields}[];planKey?:string}
export interface CreativeAsset {id:string;name:string;mime:"image/png"|"image/jpeg"|"image/webp";extension:"png"|"jpg"|"webp";bytes:number;hash:string;createdAt:string;kind:"reference"|"generated";provider?:"gemini"|"openai";model?:string;prompt?:string;campaignId?:string}
export interface CreativeJob {id:string;campaignId:string;campaignRevision:number;provider:"gemini"|"openai";model:string;prompt:string;referenceIds:string[];ratio:"1:1"|"4:5"|"9:16"|"16:9";status:"prepared"|"running"|"complete"|"attention";createdAt:string;updatedAt:string;assetId?:string;message:string;fingerprint:string}
export interface DiscoveredProfile {platform:Platform;handle:string;url:string;source:string}
export interface DiscoveredProduct {name:string;url:string;imageUrl:string;description:string}
export interface BrandDiscovery {url:string;at:string;name:string;description:string;profiles:DiscoveredProfile[];products:DiscoveredProduct[];warnings:string[]}
export interface SocialState {version:1;brand:Brand;brandRevision:number;accounts:SocialAccount[];snapshots:SocialSnapshot[];traffic:TrafficReport[];campaigns:SocialCampaign[];assets:CreativeAsset[];jobs:CreativeJob[];discoveries?:BrandDiscovery[]}
