import { HttpError, email, text } from './model.mjs';

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

function profilePhone(value) {
  const phone = text(value ?? '', 40);
  const match = phone.match(/^(\+?[\d ().-]+?)(?:\s*(?:ext\.?|x|#)\s*\d{1,8})?$/i);
  if (phone && (!match || !/^\d{7,15}$/.test(match[1].replace(/\D/g, '')))) {
    throw new HttpError(400, 'Enter a phone number with 7 to 15 digits. You can include an extension.');
  }
  return phone;
}

export function profileForAccount(account, stored, memberView = false) {
  return {
    name: stored.name || (account.id === 'owner' && !memberView ? '' : account.name || ''),
    email: stored.email ?? account.email ?? '',
    displayTitle: stored.displayTitle ?? '',
    phone: stored.phone ?? '',
    bio: stored.bio,
    photo: stored.photo,
    ...(memberView ? { id: account.id } : { revision: stored.revision }),
  };
}

const editable = new Set(['action', 'name', 'displayTitle', 'email', 'phone', 'bio', 'photo', 'revision']);

export function salesRepProfileUpdate(input) {
  if (Object.keys(input).some(field => !editable.has(field))) {
    throw new HttpError(400, 'You can update only your own profile.');
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new HttpError(400, 'Reopen your sales profile.');
  const changes = {};
  if (Object.hasOwn(input, 'name')) changes.name = text(input.name ?? '', 140);
  if (Object.hasOwn(input, 'displayTitle')) changes.displayTitle = text(input.displayTitle ?? '', 100).replace(/\s+/g, ' ');
  if (Object.hasOwn(input, 'email')) changes.email = input.email ? email(input.email) : '';
  if (Object.hasOwn(input, 'phone')) changes.phone = profilePhone(input.phone);
  if (Object.hasOwn(input, 'bio')) changes.bio = text(input.bio ?? '', 800);
  if (Object.hasOwn(input, 'photo')) changes.photo = validateHeadshot(input.photo);
  return changes;
}
