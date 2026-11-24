(() => {
  'use strict';
  async function encode(file) {
    if (file.size > 16 * 1024 * 1024) throw Error('Choose a photo smaller than 16 MB.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 112;
      const ctx = canvas.getContext('2d'), side = Math.min(image.naturalWidth, image.naturalHeight);
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 112, 112);
      ctx.drawImage(image, (image.naturalWidth - side)/2, (image.naturalHeight - side)/2, side, side, 0, 0, 112, 112);
      for (const quality of [.82, .65, .45]) {
        const encoded = canvas.toDataURL('image/jpeg', quality);
        if (encoded.length <= 13000) return encoded;
      }
      throw Error('Choose a smaller headshot.');
    } finally { URL.revokeObjectURL(url); }
  }

  window.SdrHeadshots = { encode };
})();
