import { requireOwnerAccess } from "@/lib/auth/identity";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { loadBusinessHistory } from "@/lib/history/load";
import { dateOnly } from "@/lib/expenses/model";
import { BusinessCalendar } from "@/components/BusinessCalendar";
export const dynamic="force-dynamic";
export default async function CalendarPage({searchParams}:{searchParams:Promise<{date?:string;view?:string}>}) {
  await requireOwnerAccess();
  await requireWorkspaceAccess();const data=await loadBusinessHistory(),params=await searchParams;
  return <BusinessCalendar initial={data} initialDate={dateOnly.safeParse(params.date).success?params.date!:data.today} initialView={params.view==="day"||params.view==="year"?params.view:"month"}/>;
}
