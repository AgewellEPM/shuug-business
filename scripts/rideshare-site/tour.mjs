import { platformBar } from './platform-bar.mjs';
import { quickActions } from './layout.mjs';

export function renderTour(html) {
  const replacements = [
    ['<!-- SITE_TOUR_PLATFORMS -->', platformBar('tour-platforms')],
    ['<!-- SITE_TOUR_QUICK_ACTIONS -->', `<div class="tour-mobile-controls">${quickActions()}</div>`],
  ];
  for (const [marker, value] of replacements) {
    if (!html.includes(marker)) throw new Error(`Tour template is missing ${marker}`);
    html = html.replace(marker, value);
  }
  return html;
}
