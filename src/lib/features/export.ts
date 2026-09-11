import type { Field, TrackerRecord } from "./model";
export function displayCell(field:Field,value:unknown):string {
  if(value===undefined||value==="")return "";
  if(field.type==="checkbox")return value?"Yes":"No";
  if(field.type==="money"&&typeof value==="number")return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
  return String(value);
}
export function recordsCsv(fields:Field[],records:TrackerRecord[]) {
  const cell=(v:unknown)=>`"${String(v??"").replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')}"`;
  return [["Record ID","Channel",...fields.map(f=>f.label),"Archived","Created (UTC)","Updated (UTC)"],
    ...records.map(r=>[r.id,r.channel,...fields.map(f=>r.values[f.id]??""),r.archived,r.createdAt,r.updatedAt])]
    .map(row=>row.map(cell).join(",")).join("\r\n");
}
