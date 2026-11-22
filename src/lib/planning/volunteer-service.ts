import { llmChat } from "../llm";
import { askVolunteerPlanner, volunteerConversationInput } from "./volunteer-planning";

export function createVolunteerProposal(input: unknown, now = new Date()) {
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // The portable planner supplies the full schema and validates the returned JSON.
  // JSON mode also works with Ollama runners that cannot compile its schema grammar.
  return askVolunteerPlanner(volunteerConversationInput.parse(input), today, options => llmChat({ ...options, format: "json" }));
}
