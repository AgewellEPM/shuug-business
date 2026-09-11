import { z } from "zod";
export const customerFields=["company","buyerName","buyerEmail","phone","billingAddress","shippingAddress","website","region","accountOwner","channel"] as const;
export const customerLabels:Record<typeof customerFields[number],string>={company:"Company / customer name",buyerName:"Contact name",buyerEmail:"Email",phone:"Phone",billingAddress:"Billing address",shippingAddress:"Shipping address",website:"Website",region:"Region",accountOwner:"Account owner",channel:"Sales channel"};
export const importCustomerSchema=z.object({company:z.string().trim().min(1).max(160),buyerName:z.string().trim().max(160),buyerEmail:z.union([z.literal(""),z.email()]),phone:z.string().trim().max(60),billingAddress:z.string().max(600),shippingAddress:z.string().max(600),website:z.string().max(500),region:z.string().max(120),accountOwner:z.string().max(120),channel:z.enum(["wholesale_bulk","store","online","amazon"]),externalId:z.string().max(200).optional()}).strict();
export type ImportCustomer=z.infer<typeof importCustomerSchema>;
export type ImportRow={index:number;customer:ImportCustomer|null;issue:string;duplicateId?:string};
export type ImportPreview={id:string;source:string;createdAt:string;rows:ImportRow[];count:number};
const aliases:Record<typeof customerFields[number],string[]>={company:["company","companyname","customer","customername","displayname","business","name"],buyerName:["contact","contactname","buyer","buyername","fullname"],buyerEmail:["email","emailaddress","buyeremail","primaryemail"],phone:["phone","phonenumber","telephone","mobile"],billingAddress:["billingaddress","address","streetaddress"],shippingAddress:["shippingaddress","deliveryaddress"],website:["website","url","webaddress"],region:["region","state","territory"],accountOwner:["accountowner","owner","salesrep"],channel:["channel","saleschannel","type"]};
export function matchColumns(headers:string[]):Record<string,string>{return Object.fromEntries(customerFields.map(f=>[f,headers.find(h=>aliases[f].includes(h.toLowerCase().replace(/[^a-z0-9]/g,"")))||""]));}
export function normalizeChannel(value:string,fallback:ImportCustomer["channel"]):ImportCustomer["channel"] {
  const text=value.trim().toLowerCase();if(!text)return fallback;
  if(["bulk","wholesale","wholesale_bulk"].includes(text))return "wholesale_bulk";
  if(["store","stores","retail"].includes(text))return "store";
  if(["online","website","shopify"].includes(text))return "online";
  if(text==="amazon")return "amazon";throw new Error(`Unknown sales channel: ${value}. Use Bulk, Stores or Online.`);
}
export function mapCustomerRows(rows:Record<string,string>[],mapping:Record<string,string>,fallback:ImportCustomer["channel"]):ImportRow[]{
  return rows.map((row,index)=>{
    try{const values=Object.fromEntries(customerFields.map(f=>[f,mapping[f]?String(row[mapping[f]]??"").trim():""]));values.channel=normalizeChannel(values.channel,fallback);values.buyerName||=values.company;values.shippingAddress||=values.billingAddress;values.accountOwner||="Owner";const parsed=importCustomerSchema.safeParse(values);if(!parsed.success)throw new Error(`${String(parsed.error.issues[0]?.path[0]||"Row")}: ${parsed.error.issues[0]?.message}`);return {index,customer:parsed.data,issue:""};}
    catch(e){return {index,customer:null,issue:e instanceof Error?e.message:"Check this row."};}
  });
}
