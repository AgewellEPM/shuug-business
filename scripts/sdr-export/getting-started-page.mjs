export const gettingStarted = `<dialog class="sdr-tour" id="sdr-tour" aria-labelledby="sdr-tour-title" aria-describedby="sdr-tour-copy">
  <div class="sdr-tour-shade" aria-hidden="true"><span></span></div>
  <article class="sdr-tour-card">
    <header class="sdr-tour-header">
      <div class="sdr-tour-section" data-tour-section></div>
      <button class="sdr-tour-close" type="button" data-tour-pause aria-label="Pause walkthrough">×</button>
    </header>
    <div class="sdr-tour-progress" data-tour-progress hidden><progress aria-label="Walkthrough progress"></progress><span></span></div>
    <h2 id="sdr-tour-title" tabindex="-1"></h2>
    <p id="sdr-tour-copy"></p>
    <p class="sdr-tour-instruction" data-tour-instruction hidden></p>
    <button class="button secondary sdr-tour-voice" type="button" data-tour-voice aria-description="Pauses the walkthrough and starts voice mode" hidden>Talk to Tinky</button>
    <form class="sdr-tour-practice" data-tour-practice hidden>
      <p class="sdr-tour-practice-label">Practice</p>
      <fieldset><legend></legend><div data-tour-fields></div></fieldset>
      <button class="button secondary" type="submit">Check my answer</button>
      <p role="status" data-tour-feedback></p>
    </form>
    <p class="sdr-tour-status" data-tour-status role="status"></p>
    <footer class="sdr-tour-actions">
      <button class="button secondary" type="button" data-tour-back>Back</button>
      <button class="sdr-tour-later" type="button" data-tour-pause>Continue later</button>
      <button class="button primary" type="button" data-tour-next>Start walkthrough</button>
    </footer>
  </article>
</dialog>`;
