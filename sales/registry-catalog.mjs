import { STATES, state } from './model.mjs';

// Official state authorities, current links published on their own sites, and
// the federal SkillBridge verification directory. A link is not an integration.
export const REGISTRY_DIRECTORY_SOURCE = 'https://www.nass.org/business-services/corporate-registration';
export const REGISTRY_SEARCH_DIRECTORY_SOURCE = 'https://www.skillbridge.mil/static/docs/Business_Entity_Verification_Documents_2026.pdf';
export const REGISTRIES = Object.freeze({
  AL: { name:"Alabama", url:"https://www.sos.alabama.gov/government-records/business-entity-records" },
  AK: { name:"Alaska", url:"https://www.commerce.alaska.gov/web/cbpl/Corporations.aspx" },
  AZ: { name:"Arizona", url:"https://arizonabusinesscenter.azcc.gov/businesssearch" },
  AR: { name:"Arkansas", url:"https://www.sos.arkansas.gov/corps/search_all.php" },
  CA: { name:"California", url:"https://bizfileonline.sos.ca.gov/search/business" },
  CO: { name:"Colorado", url:"https://www.coloradosos.gov/biz/BusinessEntityCriteriaExt.do" },
  CT: { name:"Connecticut", url:"https://service.ct.gov/business/s/onlinebusinesssearch" },
  DE: { name:"Delaware", url:"https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx" },
  DC: { name:"District of Columbia", url:"https://dlcp.dc.gov/page/corporations-0" },
  FL: { name:"Florida", url:"https://search.sunbiz.org/Inquiry/CorporationSearch/ByName" },
  GA: { name:"Georgia", url:"https://ecorp.sos.ga.gov/BusinessSearch" },
  HI: { name:"Hawaii", url:"https://hbe.ehawaii.gov/documents/search.html" },
  ID: { name:"Idaho", url:"https://sosbiz.idaho.gov/search/business" },
  IL: { name:"Illinois", url:"https://apps.ilsos.gov/businessentitysearch/" },
  IN: { name:"Indiana", url:"https://bsd.sos.in.gov/publicbusinesssearch" },
  IA: { name:"Iowa", url:"https://sos.iowa.gov/search/business/search.aspx" },
  KS: { name:"Kansas", url:"https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx" },
  KY: { name:"Kentucky", url:"https://sosbes.sos.ky.gov/BusSearchNProfile/search.aspx" },
  LA: { name:"Louisiana", url:"https://www.sos.la.gov/business-services/search-business-filings" },
  ME: { name:"Maine", url:"https://apps3.web.maine.gov/nei-sos-icrs/ICRS?MainPage=x" },
  MD: { name:"Maryland", url:"https://egov.maryland.gov/BusinessExpress/EntitySearch" },
  MA: { name:"Massachusetts", url:"https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx" },
  MI: { name:"Michigan", url:"https://mibusinessregistry.lara.state.mi.us/search/business" },
  MN: { name:"Minnesota", url:"https://mblsportal.sos.mn.gov/Business/Search" },
  MS: { name:"Mississippi", url:"https://corp.sos.ms.gov/corp/portal/c/page/corpbusinessidsearch/portal.aspx" },
  MO: { name:"Missouri", url:"https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx?SearchType=0" },
  MT: { name:"Montana", url:"https://biz.sosmt.gov/search/business" },
  NE: { name:"Nebraska", url:"https://www.nebraska.gov/sos/corp/corpsearch.cgi?nav=search" },
  NV: { name:"Nevada", url:"https://esos.nv.gov/EntitySearch/OnlineEntitySearch" },
  NH: { name:"New Hampshire", url:"https://quickstart.sos.nh.gov/online/BusinessInquire" },
  NJ: { name:"New Jersey", url:"https://www.njportal.com/dor/businessnamesearch/" },
  NM: { name:"New Mexico", url:"https://enterprise.sos.nm.gov/" },
  NY: { name:"New York", url:"https://apps.dos.ny.gov/publicInquiry/" },
  NC: { name:"North Carolina", url:"https://www.sosnc.gov/divisions/business_registration" },
  ND: { name:"North Dakota", url:"https://firststop.sos.nd.gov/search/business" },
  OH: { name:"Ohio", url:"https://businesssearch.ohiosos.gov/" },
  OK: { name:"Oklahoma", url:"https://oklahoma.gov/sos/businesses/business-services/business-search.html" },
  OR: { name:"Oregon", url:"https://sos.oregon.gov/business/Pages/find.aspx" },
  PA: { name:"Pennsylvania", url:"https://file.dos.pa.gov/search/business" },
  RI: { name:"Rhode Island", url:"https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx" },
  SC: { name:"South Carolina", url:"https://businessfilings.sc.gov/businessfiling/Entity/Search" },
  SD: { name:"South Dakota", url:"https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx" },
  TN: { name:"Tennessee", url:"https://tncab.tnsos.gov/business-entity-search" },
  TX: { name:"Texas", url:"https://comptroller.texas.gov/taxes/franchise/account-status/search" },
  UT: { name:"Utah", url:"https://businessregistration.utah.gov/EntitySearch/OnlineEntitySearch" },
  VT: { name:"Vermont", url:"https://bizfilings.vermont.gov/business/businesssearch" },
  VA: { name:"Virginia", url:"https://cis.scc.virginia.gov/EntitySearch/Index" },
  WA: { name:"Washington", url:"https://ccfs.sos.wa.gov/#/AdvancedSearch" },
  WV: { name:"West Virginia", url:"https://apps.wv.gov/sos/businessentitysearch/" },
  WI: { name:"Wisconsin", url:"https://apps.dfi.wi.gov/apps/CorpSearch/Search.aspx" },
  WY: { name:"Wyoming", url:"https://wyobiz.wyo.gov/Business/FilingSearch.aspx" },
});

const automatic = new Set(['AK','CT','CO','DC','DE','IA','KY','NM','NY','OR','PA','TX']);
const localDiscovery = new Set(['AK','CT','CO','DC','DE','IA','NY','OR','PA','TX']);
const people = {CT:'Listed principals',NY:'Chairman / CEO when published',OR:'Authorized representatives when published',CO:'Registered agent only; not an owner',IA:'Registered agent only; not an owner',AK:'Listed license owners, people or entities; partial extract and business match require review',NM:'Officers and directors when published; organizers and registered agents are not owner findings',DC:'Names in the official beneficial-owner table, joined by filing number; current ownership and office match require review',DE:'No owner or principal fields in the revenue license feed; business/trade names are not owner findings',KY:'Current officers, members and managers when published; no verified ownership or initial-organizer inference',PA:'No principal fields in this data feed',TX:'No principal fields in this data feed'};
const notes={
  NM:'Select a directory office for automatic legal-name and officer/director lookup. This source omits business addresses, so town-wide registry discovery is not connected.',
  IA:'Monthly Iowa active-entity data. Sole proprietors and some partnerships are not included; the feed publishes registered agents, not owners or business email/phone.',
  AK:'Partial Alaska DCCED business-license extract. Roughly 12% of active licenses are excluded by its state/city matching. Confirm listed owners and current status in the primary licensing record.',
  DC:'D.C. DLCP corporate registrations and selected-filing beneficial-owner names (CC BY 4.0). Sole proprietors and unregistered businesses may be absent. Registered agents remain separate.',
  DE:'Delaware Division of Revenue business licenses, separate from corporate entity filings. Published legal/trade names and license dates require review; no owner, phone or email fields.',
  KY:'Selected-business legal-name lookup through the free Kentucky public search and Current Officers view. Sole proprietors are excluded; town-wide registry discovery and the paid bulk service are not connected.',
};
export function registryCoverage(region) {
  state(region); const entry=REGISTRIES[region];
  return {state:region,name:entry.name,officialURL:entry.url,directorySource:REGISTRY_DIRECTORY_SOURCE,searchDirectorySource:REGISTRY_SEARCH_DIRECTORY_SOURCE,
    mode:automatic.has(region)?'automatic_records':'official_search', automaticRecords:automatic.has(region),
    automaticLocalDiscovery:localDiscovery.has(region),
    principalCoverage:people[region] || 'Review the official state record; automatic principal retrieval is not connected.',
    note:notes[region] || (automatic.has(region)?'Public business records are checked automatically; roles and business matches require review.':'Official state search is available. Automated records are not connected for this state yet.')};
}
export const allRegistryCoverage = () => STATES.map(registryCoverage);
export function registryLinks(candidate) {
  const coverage=registryCoverage(candidate.registryState || candidate.state);
  const query=new URL('https://www.google.com/search'); query.searchParams.set('q',`site:${new URL(coverage.officialURL).hostname} "${candidate.name}"`);
  return [{label:`Open ${coverage.name} official business registry`,url:coverage.officialURL},...(coverage.state==='AK'?[{label:'Open Alaska primary business-license search',url:'https://www.commerce.alaska.gov/cbp/businesslicense/search/License'}]:[]),...(coverage.state==='DE'?[{label:'Open Delaware revenue business-license search',url:'https://revenue.delaware.gov/business-license-search/'}]:[]),{label:'Search this business on the official registry site',url:query.href}];
}
