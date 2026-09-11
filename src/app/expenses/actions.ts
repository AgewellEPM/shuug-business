"use server";
import { requireSectionAccess } from "@/lib/permissions/guard";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/connections/access";
import { requireIdentity } from "@/lib/auth/identity";
import { expenseFieldsSchema } from "@/lib/expenses/model";
import { archiveExpense, listExpenses, saveExpense } from "@/lib/expenses/store";
const inputSchema=z.object({id:z.uuid().optional(),revision:z.number().int().positive().optional(),fields:expenseFieldsSchema,status:z.enum(["draft","recorded"]),confirmDuplicate:z.boolean().optional()});
export async function saveExpenseAction(input:z.input<typeof inputSchema>) {
  try {
  await requireSectionAccess("money", "edit");
await requireWorkspaceAccess();const actor=await requireIdentity();const result=saveExpense(inputSchema.parse(input),`${actor.name} (${actor.id})`);revalidatePath("/expenses");revalidatePath("/calendar");return {ok:true as const,...result};}
  catch(e){return {ok:false as const,error:e instanceof z.ZodError?e.issues[0].message:e instanceof Error?e.message:"Expense could not be saved."};}
}
export async function archiveExpenseAction(id:string,revision:number,restore=false) {
  try {
  await requireSectionAccess("money", "edit");
await requireWorkspaceAccess();const actor=await requireIdentity();const expense=archiveExpense(z.uuid().parse(id),z.number().int().positive().parse(revision),z.boolean().parse(restore),`${actor.name} (${actor.id})`);revalidatePath("/expenses");revalidatePath("/calendar");return {ok:true as const,expense};}
  catch(e){return {ok:false as const,error:e instanceof Error?e.message:"Expense could not be updated."};}
}
export async function refreshExpensesAction(){
  await requireSectionAccess("money", "view");
await requireWorkspaceAccess();return listExpenses();}
