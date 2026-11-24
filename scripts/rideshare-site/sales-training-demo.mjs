export function renderTrainingDemo({ careWorkspace }) {
  return `<section class="sdr-training sdr-training-demo" data-tab-panel="training-demo" aria-labelledby="training-demo-title" hidden>
    <header class="training-hero">
      <img class="training-reference-icon" src="/training-art/cap.png" alt="">
      <div><h1 id="training-demo-title">TinkyTown Demo Lab</h1>
        <p>Practice the visit from QR scan through a conversation the person controls.</p></div>
    </header>
    <button type="button" class="training-link" data-training-demo-return>← Back to Training</button>
    <section class="training-card training-demo-start" aria-labelledby="training-demo-qr">
      <div>
        <h2 id="training-demo-qr">1. Open the board</h2>
        <p>Scan the TinkyTown healthcare QR code. On the phone, choose the location or care setting you’re presenting. Tap a tile to see the message.</p>
        <div class="training-actions">
          <a class="training-button training-primary" href="https://tinkytown.com/biz/healthcare" target="_blank" rel="noopener noreferrer">Open the phone board ↗</a>
          ${careWorkspace ? '<a class="training-button" href="#view=demo&amp;venue=nursing-home&amp;mode=counter&amp;training=1">Nursing home kiosk</a><a class="training-button" href="#view=demo&amp;venue=senior-center&amp;training=1">Senior center kiosk</a><a class="training-button" href="#view=demo&amp;venue=stroke&amp;training=1">TinkyStroke bedside</a>' : ''}
        </div>
      </div>
      <figure><img src="/care-location-qr-healthcare.png" width="144" height="144" alt="QR code for the TinkyTown healthcare board">
        <figcaption>tinkytown.com/biz/healthcare</figcaption>
      </figure>
    </section>
    <section class="training-card training-voice" data-training-voice aria-labelledby="training-demo-voice-title">
      <header><h2 id="training-demo-voice-title">2. Try voice and suggested replies</h2>
        <p>Use practice words. Your browser handles microphone recognition. The demo uses the resulting text to offer choices.</p></header>
      <form data-training-voice-form>
        <div class="training-voice-fields">
          <label>Setting<select name="setting"><option value="nursing">Nursing home</option><option value="senior">Senior center</option><option value="bedside">Bedside</option></select></label>
          <label>Listen for<select name="mode"><option value="answer">A question to answer</option><option value="express">Something I want to say</option></select></label>
        </div>
        <div class="training-voice-examples" data-training-voice-examples></div>
        <label for="training-voice-words">What did you hear or want to say?</label>
        <textarea id="training-voice-words" name="words" rows="2" maxlength="240" required></textarea>
        <div class="training-actions">
          <button type="button" class="training-button" data-training-voice-listen aria-pressed="false">Use microphone</button>
          <button type="submit" class="training-button training-primary">Show reply choices</button>
          <button type="button" class="training-button" data-training-voice-clear>Clear</button>
        </div>
      </form>
      <p class="training-voice-status" data-training-voice-status role="status"></p>
      <section class="training-voice-result" data-training-voice-result aria-labelledby="training-voice-result-heading" hidden>
        <h3 id="training-voice-result-heading" tabindex="-1">Choose what you want to say</h3>
        <div class="training-voice-choices" data-training-voice-choices role="group" aria-label="Reply choices"></div>
        <div data-training-voice-selection hidden>
          <p data-training-voice-message aria-live="polite"></p>
          <button type="button" class="training-button training-primary" data-training-voice-speak>Speak selected reply</button>
        </div>
      </section>
    </section>
    <section class="training-card training-demo-debrief" aria-labelledby="training-demo-debrief-title">
      <h2 id="training-demo-debrief-title">3. Debrief the visit</h2>
      <ol><li>Ask which part of the interaction fit the resident or visitor’s needs.</li>
        <li>Ask staff who would keep the board available and respond when a person selects a message.</li>
        <li>Agree on one practice workflow and who will review it with you.</li></ol>
      ${careWorkspace ? '<a class="training-link" href="#view=demo&amp;venue=hospital&amp;training=1">Explore the hospital workflow →</a>' : ''}
    </section>
  </section>`;
}
