export const DEFAULT_TIMEZONE="America/New_York";
export function businessDay(timestamp:string,timezone=DEFAULT_TIMEZONE) {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(timestamp));
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;return `${get("year")}-${get("month")}-${get("day")}`;
}
export function moveDate(date:string,amount:number,unit:"day"|"month"|"year") {
  const d=new Date(`${date}T12:00:00Z`);
  if(unit==="day")d.setUTCDate(d.getUTCDate()+amount);
  else {const day=d.getUTCDate();d.setUTCDate(1);if(unit==="month")d.setUTCMonth(d.getUTCMonth()+amount);else d.setUTCFullYear(d.getUTCFullYear()+amount);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}
  return d.toISOString().slice(0,10);
}
export function period(date:string,view:"day"|"month"|"year") {
  const start=view==="day"?date:view==="month"?`${date.slice(0,7)}-01`:`${date.slice(0,4)}-01-01`;
  return {start,end:moveDate(moveDate(start,1,view),-1,"day")};
}
