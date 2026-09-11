import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkspaceUser } from "./identity";
// Only the authenticated server adapter can establish this context. It is never
// populated from a client-supplied user ID, role, or arbitrary forwarding header.
const context = new AsyncLocalStorage<WorkspaceUser>();
export const requestIdentity = () => context.getStore();
export function withRequestIdentity<T>(user: WorkspaceUser, work: () => T): T { return context.run(user, work); }
