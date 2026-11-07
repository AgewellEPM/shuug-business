import { requireSectionAccess } from "@/lib/permissions/guard";
import { redirect } from "next/navigation";
export default async function ReconcilePage(){await requireSectionAccess("money","view");redirect("/accounting/office?tool=bank");}
