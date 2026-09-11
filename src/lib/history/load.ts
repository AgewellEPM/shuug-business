import { readSocial } from "../social/store";
import { loadWorkspace } from "../data/workspace";
import { listExpenses } from "../expenses/store";
import { listNotes } from "../notes/store";
import { listTasks } from "../tasks/store";
import { listSampleRequests, listShipments } from "../ops/store";
import { businessDay, DEFAULT_TIMEZONE } from "./dates";
import { historicalSales } from "./calculate";
import { listJournal } from "./journal";
import type { BusinessActivity, BusinessHistory } from "./model";
export async function loadBusinessHistory():Promise<BusinessHistory> {
  const workspace=await loadWorkspace(),timezone=DEFAULT_TIMEZONE;
  const activities:BusinessActivity[]=[...listJournal()];
  for(const post of readSocial().campaigns)if(post.status!=="archived")activities.push({id:`social-${post.id}`,date:post.fields.date,title:post.fields.title,detail:`${post.fields.platform} · ${post.status=== "published"?"Published":"Planned"} · ${post.fields.time} ${post.fields.timezone}`,kind:"Social campaign",channel:post.fields.channel==="all"?"shared":post.fields.channel,href:"/social",source:"saved"});
  for(const task of listTasks()) {
    if(task.dueDate)activities.push({id:`task-due-${task.id}`,date:task.dueDate,title:task.title,detail:`Due · ${task.status.replaceAll("_"," ")}`,kind:"Task due",channel:"shared",href:"/tasks",source:"demo"});
    if(task.completedAt)activities.push({id:`task-done-${task.id}`,date:businessDay(task.completedAt,timezone),title:task.title,detail:"Task completed",kind:"Completed",channel:"shared",href:"/tasks",source:"demo"});
  }
  for(const note of listNotes())activities.push({id:`note-${note.id}`,date:businessDay(note.createdAt,timezone),title:note.pageLabel,detail:`${note.author}: ${note.body}`,kind:"Team note",channel:"shared",href:"/notes",source:"demo"});
  for(const shipment of listShipments())activities.push({id:`shipment-${shipment.id}`,date:businessDay(shipment.createdAt,timezone),title:`Shipment to ${shipment.toCompany}`,detail:`${shipment.carrier}${shipment.trackingNumber?` · ${shipment.trackingNumber}`:""} · ${shipment.refId}`,kind:"Shipment recorded",channel:"shared",href:"/operations",source:"demo"});
  for(const sample of listSampleRequests())activities.push({id:`sample-${sample.id}`,date:businessDay(sample.createdAt,timezone),title:`Sample requested by ${sample.company}`,detail:`${sample.requesterName} · ${sample.status}`,kind:"Sample request",channel:"shared",href:"/samples",source:"demo"});
  return {today:businessDay(new Date().toISOString(),timezone),timezone,sales:historicalSales(workspace.orders,workspace.deals,timezone),expenses:listExpenses(),activities,durableOrders:workspace.durable};
}
