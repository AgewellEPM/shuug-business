export function renderTrainingPipeline() {
  return `<section class="sdr-training sdr-training-pipeline" data-tab-panel="training-pipeline" aria-labelledby="training-pipeline-title" hidden>
    <header class="training-hero">
      <img class="training-reference-icon" src="/training-art/cap.png" alt="">
      <div><h1 id="training-pipeline-title">Pipeline Practice</h1>
        <p>Rehearse a sales visit from first contact to a signed agreement, a dated next step or a clear decline.</p></div>
    </header>
    <a class="training-link" href="#view=training">← Back to Training</a>
    <p data-training-pipeline-status role="status" hidden></p>
    <section class="training-card training-pipeline-card" data-training-pipeline-content aria-label="Practice case"></section>
  </section>`;
}
