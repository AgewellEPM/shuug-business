import { getDealStore } from "./store";
export async function loadWorkspace() {
  const store = await getDealStore();
  const summaries = await store.listCustomers();
  const [deals, orderGroups] = await Promise.all([
    Promise.all(summaries.map(c => store.getDeal(c.id))),
    Promise.all(summaries.map(c => store.listOrders(c.id))),
  ]);
  return { durable: store.durable, deals: deals.filter((d): d is NonNullable<typeof d> => !!d), orders: orderGroups.flat().sort((a,b) => b.createdAt.localeCompare(a.createdAt)) };
}
