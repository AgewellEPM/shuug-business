/** Maps URLs support fewer waypoints on mobile, so offer routes in batches of
 * three intermediate stops (four visits). Each leg's destination becomes the next start. */
export function navigationLinks(start:string,stops:{name:string;address:string;placeId:string|null}[],roundTrip:boolean){
  const links:{label:string;url:string}[]=[];let origin=start;
  for(let i=0;i<stops.length;i+=4){const batch=stops.slice(i,i+4),last=batch[batch.length-1],waypoints=batch.slice(0,-1);const q=new URLSearchParams({api:"1",origin,destination:last.address||last.name,travelmode:"driving"});if(last.placeId)q.set("destination_place_id",last.placeId);if(waypoints.length){q.set("waypoints",waypoints.map(s=>s.address||s.name).join("|"));if(waypoints.every(s=>s.placeId))q.set("waypoint_place_ids",waypoints.map(s=>s.placeId).join("|"));}links.push({label:`Visits ${i+1}–${i+batch.length}`,url:`https://www.google.com/maps/dir/?${q}`});origin=last.address||last.name;}
  if(roundTrip&&stops.length)links.push({label:"Return to start",url:`https://www.google.com/maps/dir/?${new URLSearchParams({api:"1",origin,destination:start,travelmode:"driving"})}`});return links;
}
