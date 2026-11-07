// @vitest-environment node
import { expect, it } from 'vitest';
import { appleAppAssociation } from '../../../scripts/rideshare-site/app-links.mjs';
it('does not grant any app association until a signed app identifier is supplied',()=>{
 expect(appleAppAssociation(null)).toEqual({applinks:{details:[]}});
 expect(appleAppAssociation(undefined)).toEqual({applinks:{details:[]}});
});
it('grants only the bank return path to the intended signed driver application',()=>{
 expect(appleAppAssociation('ABCDEFGHIJ.com.ridesharetaxpros.driver')).toEqual({applinks:{details:[{appIDs:['ABCDEFGHIJ.com.ridesharetaxpros.driver'],components:[{'/':'/bank-return'}]}]}});
 for(const id of ['*.com.ridesharetaxpros.driver','ABCDEFGHIJ.com.other.app','FAKE.com.ridesharetaxpros.driver','ABCDEFGHIJ.com.ridesharetaxpros.driver/*'])expect(()=>appleAppAssociation(id)).toThrow();
});
