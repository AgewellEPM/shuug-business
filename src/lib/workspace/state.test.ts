import { expect, it } from "vitest";
import { persistentState } from "./state";
it("retains aggregate state across instances and rolls back nested operations together", () => {
  const state = persistentState("transaction-proof", () => ({ inventory: 10, shipments: 0 }));
  state.change(s => { s.inventory -= 2; state.change(nested => { nested.shipments++; }); });
  expect(persistentState("transaction-proof", () => ({ inventory: 0, shipments: 0 })).read()).toEqual({ inventory: 8, shipments: 1 });
  expect(() => state.change(s => { s.inventory = 0; state.change(() => { throw new Error("Shipment rejected"); }); })).toThrow("rejected");
  expect(state.read()).toEqual({ inventory: 8, shipments: 1 });
});
