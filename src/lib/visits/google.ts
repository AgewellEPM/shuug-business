import { z } from "zod";
import { setting } from "../connections/vault";
import { publicWebsite } from "../ppc/market";
import { placeIdSchema,type Place,type RoutePlan } from "./model";
const fields="id,displayName,formattedAddress,location,nationalPhoneNumber,websiteUri,googleMapsUri,businessStatus,regularOpeningHours.weekdayDescriptions,types";
interface RawPlace {id?:string;displayName?:{text?:string};formattedAddress?:string;location?:{latitude:number;longitude:number};nationalPhoneNumber?:string;websiteUri?:string;googleMapsUri?:string;businessStatus?:string;regularOpeningHours?:{weekdayDescriptions?:string[]};types?:string[]}
export function mapPlace(raw:RawPlace):Place|null {
  if(!raw.id||!placeIdSchema.safeParse(raw.id).success||!raw.displayName?.text||!raw.location||!Number.isFinite(raw.location.latitude)||!Number.isFinite(raw.location.longitude))return null;
  return {id:raw.id,name:raw.displayName.text,address:raw.formattedAddress||"",phone:raw.nationalPhoneNumber||null,website:raw.websiteUri&&publicWebsite(raw.websiteUri)||null,mapsUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw.displayName.text)}&query_place_id=${encodeURIComponent(raw.id)}`,lat:raw.location.latitude,lng:raw.location.longitude,businessStatus:raw.businessStatus||"UNKNOWN",hours:raw.regularOpeningHours?.weekdayDescriptions||[],types:raw.types||[]};
}
async function google<T>(url:string,mask:string,body?:unknown):Promise<T>{const key=setting("GOOGLE_MAPS_SERVER_KEY");if(!key)throw new Error("Connect Google Maps in Settings to search live businesses and plan driving routes.");const res=await fetch(url,{method:body?"POST":"GET",headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":mask,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),cache:"no-store",signal:AbortSignal.timeout(25000)});if(!res.ok)throw new Error(`Google Maps returned ${res.status}. Check that Places API (New) and Routes API are enabled and that this key permits them.`);return await res.json() as T;}
export async function searchPlaces(query:string,pageToken?:string):Promise<{places:Place[];nextPageToken?:string}>{
  z.string().trim().min(3).max(300).parse(query);if(pageToken)z.string().max(2000).parse(pageToken);
  const data=await google<{places?:RawPlace[];nextPageToken?:string}>("https://places.googleapis.com/v1/places:searchText",fields.split(",").map(f=>`places.${f}`).join(",")+",nextPageToken",{textQuery:query,pageSize:20,languageCode:"en",...(pageToken?{pageToken}:{})});
  return {places:(data.places||[]).map(mapPlace).filter((p):p is Place=>!!p),nextPageToken:data.nextPageToken};
}
export async function placeDetails(id:string):Promise<Place>{placeIdSchema.parse(id);const p=mapPlace(await google<RawPlace>(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,fields));if(!p)throw new Error("Google no longer has full details for this business.");return p;}
export async function optimizeRoute(startAddress:string,stops:{id:string;placeId:string|null;address:string}[],roundTrip:boolean):Promise<RoutePlan>{
  z.string().trim().min(3).max(300).parse(startAddress);z.array(z.object({id:z.uuid(),placeId:placeIdSchema.nullable(),address:z.string().max(300)})).min(1).max(20).parse(stops);
  const waypoint=(s:typeof stops[number])=>s.placeId?{placeId:s.placeId}:s.address?{address:s.address}:(()=>{throw new Error("Each stop needs a Place ID or a street address.");})();
  const intermediates=roundTrip?stops:stops.slice(0,-1),destination=roundTrip?{address:startAddress}:waypoint(stops[stops.length-1]);
  const mask="routes.distanceMeters,routes.duration,routes.legs.duration,routes.legs.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex";
  const data=await google<{routes?:{distanceMeters:number;duration:string;legs?:{duration:string;distanceMeters:number}[];polyline?:{encodedPolyline?:string};optimizedIntermediateWaypointIndex?:number[]}[]}>("https://routes.googleapis.com/directions/v2:computeRoutes",mask,{origin:{address:startAddress},destination,intermediates:intermediates.map(waypoint),travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE",optimizeWaypointOrder:intermediates.length>1,languageCode:"en-US",units:"IMPERIAL"});
  const route=data.routes?.[0];if(!route)throw new Error("No driving route was found. Check the start address and your stops.");
  const indices=route.optimizedIntermediateWaypointIndex??intermediates.map((_,i)=>i);
  if(indices.length!==intermediates.length||new Set(indices).size!==indices.length||indices.some(i=>i<0||i>=intermediates.length))throw new Error("Google returned an incomplete stop order. Your original list is unchanged.");
  const orderedIds=indices.map(i=>intermediates[i].id);if(!roundTrip)orderedIds.push(stops[stops.length-1].id);
  return {orderedIds,distanceMeters:route.distanceMeters,durationSeconds:Number(route.duration.replace(/s$/,"")),legs:(route.legs||[]).map(l=>({durationSeconds:Number(l.duration.replace(/s$/,"")),distanceMeters:l.distanceMeters})),polyline:route.polyline?.encodedPolyline||"",source:"Google Routes"};
}
