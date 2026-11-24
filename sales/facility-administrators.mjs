const cmsPath = '/provider-data/dataset/4pq5-n9py';

// Employer-published role evidence, matched against the CMS facility ID,
// state, city and published facility phone. Keep portraits tied to pages
// where the employer identifies the person pictured.
const reviewed = {
  '015024': {
    state: 'AL', city: 'Athens', phone: '2562323461', name: 'Sherry Bowling', email: 'sbowling@limestonehf.com',
    sourceURL: 'https://www.limestonehf.com/meet-our-team',
    photoURL: 'https://static.wixstatic.com/media/7ce03f_4e7e38f9e39543efae46e06512d04a33~mv2.jpg',
  },
  '015083': {
    state: 'AL', city: 'Elba', phone: '3348972257', name: 'Nikki Hall', title: 'Executive Director',
    sourceURL: 'https://elbanursingandrehab.com/',
    photoURL: 'https://elbanursingandrehab.com/wp-content/uploads/2021/02/NikkiHalladministrator-scaled.jpg',
  },
  '015322': {
    state: 'AL', city: 'Monroeville', phone: '2515753285', name: 'Caroline Howell', email: 'cmhowell@crownehealthcare.com',
    sourceURL: 'https://crownehealthcare.com/englewood',
    photoURL: 'https://crownehealthcare.com/hubfs/Headshots/Caroline%20Howell%2C%20Administrator%20Englewood%20Health%20Care%20Center.jpg',
  },
  '015373': {
    state: 'AL', city: 'Abbeville', phone: '3345852241', name: 'Chuck Houston',
    sourceURL: 'https://www.hcnh.net/',
  },
  '075268': {
    state: 'CT', city: 'Hartford', phone: '8609511060', name: 'George Kingston',
    sourceURL: 'https://www.trinity-hill.com/welcome/',
  },
  '075320': {
    state: 'CT', city: 'Stamford', phone: '2033250200', name: 'Julia Olenechuk',
    sourceURL: 'https://arkstcamillus.com/about-us/',
    photoURL: 'https://arkstcamillus.com/wp-content/uploads/2025/06/Julia-Olenechuk-sq.png',
  },
};

export const administratorPhotoOrigins = [...new Set(Object.values(reviewed).flatMap(
  role => role.photoURL ? [new URL(role.photoURL).origin] : [],
))];

export function publishedFacilityAdministrator(row) {
  let url;
  try { url = new URL(row.sourceURL); } catch { return null; }
  if (url.origin !== 'https://data.cms.gov' || url.pathname !== cmsPath ||
      url.searchParams.get('conditions[0][property]') !== 'cms_certification_number_ccn') return null;
  const id = url.searchParams.get('conditions[0][value]');
  if (!/^\d{6}$/.test(id || '')) return null;
  const role = reviewed[id];
  if (!role || role.state !== row.state || role.city.toLowerCase() !== row.city?.trim().toLowerCase() ||
      role.phone !== row.phone?.replace(/\D/g, '')) return null;
  return {
    name: role.name, title: role.title || 'Administrator', phone: role.phone, email: role.email || '',
    sourceURL: role.sourceURL, photoURL: role.photoURL || '', checkedOn: '2026-11-23',
  };
}
