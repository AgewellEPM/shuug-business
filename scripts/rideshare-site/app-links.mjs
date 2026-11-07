export function appleAppAssociation(appId) {
  if (appId !== null && appId !== undefined && !/^[A-Z0-9]{10}\.com\.ridesharetaxpros\.driver$/.test(appId)) {
    throw new Error('iosAppId must be the signed application identifier for the Gig Tax Pros iPhone app.');
  }
  return { applinks: { details: appId ? [{ appIDs: [appId], components: [{ '/': '/bank-return' }] }] : [] } };
}
