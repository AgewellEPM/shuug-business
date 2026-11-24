const cmsPath = '/provider-data/dataset/4pq5-n9py';

// Employer-published role evidence, matched against the CMS facility ID,
// state, city and published facility phone. Keep portraits tied to pages
// where the employer identifies the person pictured.
const reviewed = {
  '015024': {
    state: 'AL', city: 'Athens', phone: '2562323461', name: 'Sherry Bowling', email: 'sbowling@limestonehf.com',
    sourceURL: 'https://www.limestonehf.com/meet-our-team',
    photoURL: 'https://static.wixstatic.com/media/7ce03f_4e7e38f9e39543efae46e06512d04a33~mv2.jpg',
    linkedinURL: 'https://www.linkedin.com/in/sherry-bowling-565401bb',
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
};

const profiles = {
  '015024': {
    description: 'Long-term skilled nursing and short-term inpatient rehabilitation. Champion Rehab offers physical, occupational, and speech therapy.',
    website: 'https://www.limestonehf.com/meet-our-team',
    facts: [
      { label: 'Visiting hours', value: 'Call for Champion Rehab visiting times', sourceURL: 'https://www.limestonehf.com/faq' },
    ],
    people: [
      ['Aleshia Teeples', 'Director of Nursing', 'Nursing', 'ateeples@limestonehf.com', 'https://static.wixstatic.com/media/7ce03f_e1e0a1d841fe41be8cff10d3e5595c37~mv2.jpg'],
      ['Edie Belue', 'Director of Social Services', 'Social Services', 'edie@limestonehf.com', 'https://static.wixstatic.com/media/7ce03f_3c856275acb840e390768dfdb49e3a68~mv2.jpg'],
      ['Leigh Ann Hughes', 'Admissions and Patient Accounts', 'Admissions', 'lahughes@limestonehf.com', 'https://static.wixstatic.com/media/7ce03f_cd76e22cad794c07bb7fce0fe099aa1c~mv2.jpg'],
      ['Kayla Thomas', 'Clinical Admission Liaison', 'Admissions', 'kthomas@limestonehf.com', 'https://static.wixstatic.com/media/7ce03f_2c33c47b8e234c438bda184d47001c6e~mv2.jpg', '2563037768'],
    ],
  },
  '015083': {
    description: 'Skilled nursing in Elba with short-term rehabilitation, long-term care, and a memory-care unit.',
    website: 'https://elbanursingandrehab.com/',
  },
  '015322': {
    description: 'Skilled nursing, long-term care, and short-term physical, occupational, and speech rehabilitation in Monroeville.',
    website: 'https://crownehealthcare.com/englewood',
    facts: [
      { label: 'Skilled nursing', value: '24-hour care', sourceURL: 'https://crownehealthcare.com/englewood' },
    ],
    people: [
      ['LaToyia Nettles', 'Admission Coordinator', 'Admissions', 'lnettles@crownehealthcare.com'],
      ['Tracy Stabler', 'Licensed Practical Nurse', 'Nursing', 'tstabler@crownehealthcare.com'],
    ],
  },
  '015373': {
    description: 'Skilled nursing in Abbeville. Its care network offers inpatient and outpatient rehabilitation, memory care, and assisted living.',
    website: 'https://www.hcnh.net/',
  },
  '015465': {
    identity: { state: 'AL', city: 'Northport', phone: '2053308412' },
    description: 'Short-term rehabilitation and skilled nursing at the West Alabama Aspire center in Northport.',
    website: 'https://www.aspirephysicalrecovery.com/locations/west-alabama/',
    facts: [
      { label: 'Building area', value: '52,000 sq ft', sourceURL: 'https://www.maxusconstruction.com/project/aspire-west-alabama/' },
    ],
  },
  '075268': {
    description: 'Hartford skilled nursing center with short-term rehabilitation, long-term care, and specialty support.',
    website: 'https://www.trinity-hill.com/welcome/',
  },
  '075320': {
    identity: { state: 'CT', city: 'Stamford', phone: '2033250200' },
    description: 'Skilled nursing and short-term rehabilitation in Stamford, with clinical care and therapy teams.',
    website: 'https://arkstcamillus.com/about-us/',
    facts: [
      { label: 'Skilled nursing', value: '24-hour care', sourceURL: 'https://arkstcamillus.com/about-us/' },
    ],
    people: [
      ['Laurie Pompa', 'Director of Nursing Services', 'Nursing', '', 'https://arkstcamillus.com/wp-content/uploads/2025/06/346456.jpg'],
      ['Jasmin Linares', 'Director of Admissions', 'Admissions', '', 'https://arkstcamillus.com/wp-content/uploads/2025/06/Jasmin-Linares-sq.png'],
      ['Minette Zambo', 'Corporate Director of Marketing and Business Development', 'Business Development'],
      ['Farah Pasard', 'Assistant Director of Nursing', 'Nursing'],
      ['Erica Hagenow', 'Social Worker', 'Social Services'],
      ['Jean Ormond', 'Social Worker', 'Social Services'],
      // The facility's staff page predates her publicly announced corporate role.
      ['Julia Olenechuk', 'Corporate Director of Special Projects', 'Corporate leadership', '',
        'https://arkstcamillus.com/wp-content/uploads/2025/06/Julia-Olenechuk-sq.png', '',
        'https://www.linkedin.com/in/julia-olenechuk-lnha-02818a1bb'],
    ],
  },
};

function matchedRecordId(row) {
  let url;
  try { url = new URL(row.sourceURL); } catch { return null; }
  if (url.origin !== 'https://data.cms.gov' || url.pathname !== cmsPath ||
      url.searchParams.get('conditions[0][property]') !== 'cms_certification_number_ccn') return null;
  const id = url.searchParams.get('conditions[0][value]');
  if (!/^\d{6}$/.test(id || '')) return null;
  const identity = reviewed[id] || profiles[id]?.identity;
  return identity && identity.state === row.state && identity.city.toLowerCase() === row.city?.trim().toLowerCase() &&
    identity.phone === row.phone?.replace(/\D/g, '') ? id : null;
}

export const administratorPhotoOrigins = [...new Set([
  ...Object.values(reviewed).map(role => role.photoURL),
  ...Object.values(profiles).flatMap(profile => (profile.people || []).map(person => person[4])),
].filter(Boolean).map(url => new URL(url).origin))];

export function publishedFacilityAdministrator(row) {
  const role = reviewed[matchedRecordId(row)];
  if (!role) return null;
  return {
    name: role.name, title: role.title || 'Administrator', phone: role.phone, email: role.email || '',
    sourceURL: role.sourceURL, photoURL: role.photoURL || '', linkedinURL: role.linkedinURL || '', checkedOn: '2026-11-23',
  };
}

export function publishedFacilityProfile(row) {
  const id = matchedRecordId(row);
  const profile = profiles[id];
  if (!profile) return null;
  const identity = reviewed[id] || profile.identity;
  return {
    description: profile.description, website: profile.website, facts: profile.facts || [],
    people: (profile.people || []).map(([name, title, group, email = '', photoURL = '', phone = '', linkedinURL = '']) => ({
      name, title, group, email, photoURL, phone: phone || identity.phone, linkedinURL,
      directPhone: Boolean(phone), sourceURL: linkedinURL || profile.website, checkedOn: '2026-11-23',
    })),
  };
}
