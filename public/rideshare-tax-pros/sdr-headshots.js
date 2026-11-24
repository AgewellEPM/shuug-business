(() => {
  'use strict';

  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read this photo. Choose the file again.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth && image.naturalHeight) resolve(image);
        else reject(new Error('Choose a photo with a valid image size.'));
      };
      image.onerror = () => reject(new Error('Could not open this photo. Try a JPG, PNG, or WebP image.'));
      image.src = source;
    });
  }

  async function encode(file) {
    if (file.size > 16 * 1024 * 1024) throw new Error('Choose a photo smaller than 16 MB.');
    // The workspace permits data images in its content security policy.
    const image = await loadImage(await readPhoto(file));
    const size = 112;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare this headshot on this device.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const quality of [.82, .65, .45]) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (encoded.startsWith('data:image/jpeg;base64,') && encoded.length <= 13000) return encoded;
    }
    throw new Error('Choose a smaller headshot.');
  }

  window.SdrHeadshots = { encode };
})();
