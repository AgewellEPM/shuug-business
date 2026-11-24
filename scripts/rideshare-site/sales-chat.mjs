export function renderTeamChat(icon) {
  return `<section class="chat-workspace" data-tab-panel="chat" aria-labelledby="chat-title" hidden>
    <header class="chat-titlebar">
      <span class="chat-mark">${icon('chat')}</span><h2 id="chat-title">Team chat</h2>
      <span class="chat-audience">${icon('team')} <span id="chat-audience-label">Sales team only</span></span>
    </header>
    <div class="chat-mobile-controls">
      <button type="button" id="chat-nav-toggle" aria-expanded="false" aria-controls="chat-nav">
        ${icon('chat')} Conversations <span class="chat-chevron" aria-hidden="true"></span>
      </button>
      <button type="button" id="chat-online-shortcut" aria-controls="chat-presence">Online staff</button>
    </div>
    <div class="chat-layout">
      <aside class="chat-rail" id="chat-nav" aria-label="Conversations">
        <div class="chat-rail-heading"><h3>Channels</h3>
          <button type="button" id="chat-add" aria-label="Create channel" title="Create channel" aria-controls="chat-create" aria-expanded="false" hidden>+</button>
        </div>
        <form id="chat-create" hidden>
          <label>Channel name<input name="name" maxlength="48" placeholder="deal-desk" required></label>
          <label>Topic <small>(optional)</small><input name="topic" maxlength="180"></label>
          <div><button type="submit">Create</button><button type="button" id="chat-create-cancel">Cancel</button></div>
          <p id="chat-create-status" role="status"></p>
        </form>
        <nav id="chat-channels" class="chat-conversations" aria-label="Channels"></nav>
        <div class="chat-rail-heading chat-direct-heading"><h3>Direct messages</h3>
          <button type="button" id="chat-new-direct" aria-label="New direct message" title="New direct message" aria-expanded="false" aria-controls="chat-people">+</button>
        </div>
        <div id="chat-people" hidden>
          <label for="chat-person-search">Find a teammate</label>
          <input type="search" id="chat-person-search" placeholder="Search by name" autocomplete="off">
          <div id="chat-person-results" aria-label="Matching teammates"></div>
          <p id="chat-person-status" role="status"></p>
          <a href="#view=team&section=invite" id="chat-invite-link" hidden>Invite a sales agent</a>
        </div>
        <nav id="chat-directs" class="chat-conversations" aria-label="Direct messages"></nav>
        <button type="button" id="chat-first-direct">${icon('prospects')} Message a teammate</button>
        <section id="chat-presence" aria-labelledby="chat-online-title">
          <div class="chat-rail-heading"><h3 id="chat-online-title" tabindex="-1">Online now</h3><span id="chat-online-count" hidden></span></div>
          <ul id="chat-online-members" aria-label="Online staff"></ul>
          <p id="chat-online-status" role="status">Connecting…</p>
        </section>
      </aside>
      <div class="chat-room">
        <header class="chat-room-heading">
          <span class="chat-channel-mark" aria-hidden="true">#</span>
          <div><h3 id="chat-name">general</h3><p id="chat-topic"></p></div>
        </header>
        <div id="chat-scroll" tabindex="0" aria-label="Channel history">
          <button type="button" class="chat-history-button" id="chat-older" hidden>Load earlier messages</button>
          <div id="chat-empty" hidden>
            <div class="chat-empty-art"><img src="/sales-chat-express.webp" alt="" width="660" height="322" loading="lazy" decoding="async"></div>
            <h4></h4><p>Send the first message to your team.</p>
          </div>
          <div id="chat-messages" role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions"></div>
        </div>
        <div class="chat-compose-area">
          <button type="button" id="chat-jump" hidden>New messages ↓</button>
          <p id="chat-status" role="status"></p>
          <a id="chat-signin" href="/sales#view=chat" hidden>Sign in again</a>
          <div id="chat-reply" hidden><span></span><button type="button" aria-label="Cancel reply">×</button></div>
          <form id="chat-compose">
            <textarea name="message" aria-label="Message" placeholder="Message #general" maxlength="2000" rows="2" required disabled></textarea>
            <button type="submit" aria-label="Send message" disabled><span>Send</span>${icon('chatSend')}</button>
          </form>
          <small class="chat-key-hint"><span><kbd>Enter</kbd> to send</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line</span></small>
        </div>
      </div>
    </div>
  </section>`;
}
