// Keep the supplied photography and its crop; only the mobile frame can move.
export function mobileHeroArt({ artwork, width, height, box, className }) {
  return `<div class="mobile-hero-frame" data-hero-parallax aria-hidden="true"><svg class="mobile-hero-photo ${className}" width="${box[2]}" height="${box[3]}" viewBox="${box.join(' ')}" focusable="false"><image href="${artwork}" width="${width}" height="${height}"/></svg></div>`;
}
