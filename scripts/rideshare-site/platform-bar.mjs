const platforms = [
  ['Uber', 'uber.svg', 72, 25, 'platform-logo-uber'],
  ['Lyft', 'lyft.png', 43, 29, ''],
  ['DoorDash', 'doordash.svg', 130, 21, ''],
  ['Instacart', 'instacart.svg', 130, 21, ''],
  ['Amazon Flex', 'amazon-flex.svg', 112, 28, ''],
];
export function platformBar(className) {
  return `<ul class="platform-bar ${className}" aria-label="Gig platforms" tabindex="0">${platforms.map(([name,file,width,height,extra]) => `<li class="platform-item"><img class="${extra}" src="/assets/platforms/${file}" width="${width}" height="${height}" alt="${name}" decoding="async"></li>`).join('')}<li class="platform-item">+ All Gig Platforms</li></ul>`;
}
