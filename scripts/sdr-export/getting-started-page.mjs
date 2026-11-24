export const gettingStarted = `<dialog class="sdr-tour" id="sdr-tour" aria-labelledby="sdr-tour-title" aria-describedby="sdr-tour-copy">
  <div class="sdr-tour-shade" aria-hidden="true"><span></span></div>
  <article class="sdr-tour-card">
    <header class="sdr-tour-cover">
      <div class="sdr-tour-masthead">
        <span class="sdr-tour-wordmark"><span aria-hidden="true">🚂</span> TinkyTown</span>
        <span class="sdr-tour-edition">Sales field guide</span>
        <button class="sdr-tour-close" type="button" data-tour-pause aria-label="Pause walkthrough">×</button>
      </div>
      <div class="sdr-tour-heading">
        <img class="sdr-tour-emblem" data-tour-emblem alt="" width="50" height="50" hidden>
        <div><span class="sdr-tour-section" data-tour-section></span><h2 id="sdr-tour-title" tabindex="-1"></h2></div>
      </div>
      <div class="sdr-tour-scene" aria-hidden="true"></div>
    </header>
    <div class="sdr-tour-body">
      <div class="sdr-tour-progress" data-tour-progress hidden><span></span><progress aria-label="Walkthrough progress"></progress></div>
      <p id="sdr-tour-copy"></p>
      <ol class="sdr-tour-route" aria-label="Highlights of the walkthrough" data-tour-route hidden>
        <li>Plan your day</li><li>Find a prospect</li><li>Book a demo</li>
      </ol>
      <p class="sdr-tour-instruction" data-tour-instruction hidden></p>
      <form class="sdr-tour-practice" data-tour-practice hidden>
        <p class="sdr-tour-practice-label">Practice with Tinky</p>
        <fieldset><legend></legend><div data-tour-fields></div></fieldset>
        <button class="button secondary" type="submit">Check my answer</button>
        <p role="status" data-tour-feedback></p>
      </form>
      <p class="sdr-tour-status" data-tour-status role="status"></p>
    </div>
    <footer class="sdr-tour-actions">
      <button class="sdr-tour-back" type="button" data-tour-back>Back</button>
      <button class="sdr-tour-later" type="button" data-tour-pause>Continue later</button>
      <button class="button primary" type="button" data-tour-next>Start walkthrough</button>
    </footer>
  </article>
</dialog>`;
