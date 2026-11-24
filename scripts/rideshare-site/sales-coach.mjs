export function renderSalesCoach(icon) {
  return `<section data-tab-panel="coach" class="coach-workspace" aria-labelledby="coach-title" hidden>
    <header class="coach-header"><span class="coach-symbol" aria-hidden="true">${icon('chat')}</span>
      <div><h2 id="coach-title">Ask Tinky</h2><p>Your private TinkyTown sales coach</p></div>
    </header>
    <div class="coach-layout">
      <div class="coach-conversation">
        <div id="coach-stream" tabindex="0" aria-label="Conversation history">
          <button type="button" id="coach-older" hidden>Earlier messages</button>
          <div id="coach-welcome" hidden>
            <img src="/sales-chat-express.webp" width="660" height="322" alt="" loading="lazy">
            <h3>What are you working on?</h3>
            <div class="coach-prompts">
              <button type="button" data-prompt="What should I work on next to reach my sales goal?">Plan my next move</button>
              <button type="button" data-prompt="Help me introduce TinkyTown to a new prospect.">Practice my pitch</button>
              <button type="button" data-prompt="Help me fill out a new prospect record. What details do you need?">Fill out a prospect</button>
            </div>
          </div>
          <div id="coach-messages" role="log" aria-label="Private conversation" aria-live="polite" aria-relevant="additions"></div>
        </div>
        <div class="coach-compose"><p id="coach-status" role="status"></p>
          <button type="button" id="coach-reload" hidden>Reload conversation</button>
          <form id="coach-form"><textarea name="question" rows="2" maxlength="2400" required disabled aria-label="Ask Tinky a question" placeholder="Ask about TinkyTown, a prospect, or your next step…"></textarea>
            <button type="submit" disabled>Ask Tinky ${icon('chatSend')}</button></form>
        </div>
      </div>
      <aside class="coach-side" aria-label="Your goal and priorities">
        <section class="coach-card"><div class="coach-card-title"><h3>My sales goal</h3><button type="button" id="coach-edit-goal" aria-controls="coach-goal-form" aria-expanded="false" disabled>Set goal</button></div>
          <div id="coach-goal-summary"></div>
          <form id="coach-goal-form" hidden>
            <label>Measure<select name="metric"><option value="meetings">Meetings scheduled</option><option value="prospects">Prospects added</option><option value="calls">Calls logged</option><option value="agreements">Agreements signed</option></select></label>
            <label>Target<input type="number" name="target" min="1" max="10000" step="1" required></label>
            <label>Start date<input name="start" type="date" required></label><label>Deadline<input name="end" type="date" required></label>
            <label>What are you focusing on?<input name="focus" maxlength="240" placeholder="e.g. Senior-care admissions teams"></label>
            <div><button type="submit">Save goal</button><button type="button" id="coach-cancel-goal">Cancel</button></div>
          </form>
          <p id="coach-goal-status" role="status"></p>
        </section>
        <section class="coach-card"><div class="coach-card-title"><h3>From Today’s Plan</h3></div><ul id="coach-next"></ul><a href="#view=today">Open today’s plan →</a></section>
      </aside>
    </div>
  </section>`;
}
