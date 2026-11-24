import { HttpError, text } from './model.mjs';

const jpegPrefix = 'data:image/jpeg;base64,';

export function validateHeadshot(value) {
  const photo = text(value ?? '', 13000);
  if (!photo) return '';
  if (!/^data:image\/jpeg;base64,[a-zA-Z0-9+/]+={0,2}$/.test(photo)) throw new HttpError(400, 'Choose a headshot image.');
  const bytes = Buffer.from(photo.slice(jpegPrefix.length), 'base64');
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) {
    throw new HttpError(400, 'Choose a valid JPEG headshot.');
  }
  return photo;
}

export function salesRepProfileUpdate(input) {
  if (Object.keys(input).some(field => !['action', 'bio', 'photo', 'revision'].includes(field))) {
    throw new HttpError(400, 'You can update only your own profile.');
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new HttpError(400, 'Reopen your sales profile.');
  return { bio: text(input.bio ?? '', 800), photo: validateHeadshot(input.photo) };
}
