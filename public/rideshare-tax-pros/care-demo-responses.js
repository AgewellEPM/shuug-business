(() => {
  'use strict';

  // Color describes the person's words. Pictures, skin tones and board categories do not establish intent.
  // Mixed answers, questions and requests for clarification keep an ordinary neutral reply style.
  function toneOf(tile) {
    const words = String(tile.spokenText || tile.say || tile.label || '').trim().toLowerCase()
      .replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
    if (!words || tile.action || (tile.navigateTo && tile.spokenText === '')) return '';
    if (/\?|^(?:how|what|why|who|where|when|can you|could you|could i|do you)\b/.test(words) ||
        /\b(?:maybe|not sure|don't know|not certain|on and off|a moment|not too bad|but)\b/.test(words) ||
        /\b(?:fine|okay)\b.*\b(?:tired|sore|worried)\b/.test(words)) return 'neutral';
    if (/^(?:no (?:pain|problem|trouble|discomfort)(?:[.! ,]|$)|it (?:doesn't|does not) hurt\b)/.test(words)) return 'positive';
    if (/^(?:no|nope|neither|stop|not now|not really|not at all|please stop)\b/.test(words) ||
        /\b(?:(?:hard|rough|bad|restless|awful) night|slept (?:poorly|badly)|(?:didn't|did not|couldn't|could not|can't|cannot) sleep|didn't rest|(?:still|very) tired|(?:didn't|did not) (?:feel better|help)|not (?:well|okay|comfortable|ready|better)|(?:feel |getting |felt )?worse|still hurts|(?:in|severe|bad) pain|(?:i'm|i am|i feel) (?:scared|upset|uncomfortable|worried|sick)|(?:don't|do not) want)\b/.test(words)) return 'negative';
    if (/^(?:yes|yeah|yep|absolutely|of course|thank you|thanks|okay|definitely|that helps|that works|i agree)\b/.test(words) ||
        /\b(?:slept (?:very |really )?(?:well|great)|good night(?:'s (?:sleep|rest))?|well rested|feel(?:ing)? (?:better|good|great|rested)|getting better|much better|i(?:'m| am) (?:fine|okay|comfortable|ready))\b/.test(words)) return 'positive';
    return ['positive','negative','neutral'].includes(tile.tone) ? tile.tone : tile.reply ? 'neutral' : '';
  }

  function illustration(button, tile) {
    const tone = toneOf(tile);
    if (tone) button.dataset.responseTone = tone;
    return window.CareDemoPictures.create(tile);
  }

  window.CareDemoResponses = Object.freeze({ illustration, toneOf });
})();
