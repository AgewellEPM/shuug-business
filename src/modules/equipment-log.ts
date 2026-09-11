/**
 * EXAMPLE MODULE — a warehouse/operations module. Shows the SDK works for any
 * department, not just sales. Same shape, different section + fields.
 */
import { defineModule } from "@/lib/sdk/module";

export default defineModule({
  id: "equipment-log",
  label: "Equipment & maintenance",
  description: "Track equipment, service dates and who's responsible — before something breaks mid-run.",
  group: "Operations",
  section: "operations",
  icon: "products",
  version: "1.0.0",
  author: "Shuug",
  organizations: ["product"],
  fields: [
    { id: "asset", label: "Asset", type: "text", required: true, options: [] },
    { id: "status", label: "Status", type: "select", required: true, options: ["In service", "Needs attention", "Down"] },
    { id: "last_serviced", label: "Last serviced", type: "date", required: false, options: [] },
    { id: "owner", label: "Responsible", type: "text", required: false, options: [] },
    { id: "cost_ytd", label: "Maintenance cost YTD", type: "money", required: false, options: [] },
    { id: "notes", label: "Notes", type: "notes", required: false, options: [] },
  ],
  panels: [
    {
      id: "health",
      label: "Fleet health",
      compute: (records) => {
        const live = records.filter((r) => !r.archived);
        const down = live.filter((r) => r.values.status === "Down").length;
        const attention = live.filter((r) => r.values.status === "Needs attention").length;
        return [
          { label: "Assets tracked", value: String(live.length) },
          { label: "Need attention", value: String(attention), tone: attention > 0 ? "warn" : "good" },
          { label: "Down", value: String(down), tone: down > 0 ? "bad" : "good" },
        ];
      },
    },
  ],
});
