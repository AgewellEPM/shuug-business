# Current homepage boundary: original page plus small bottom map

Luke explicitly requested the original homepage, with only the small map at the
bottom. This supersedes the larger map section, placement in the services area
and local-office marketing rewrites from the preceding correction.

Implementation 7b97d52 restores the original approach and service sections and
places one map figure at the end of main, after the original contact section.
Map width is at most 480px. Original artwork hero and global CSS are unchanged.
The factual free-access correction is retained; fee/pricing copy is not restored.
No company-guide, partner-pilot or app-showcase sections appear on the homepage.
Do not make further homepage additions without Luke's explicit instruction.

During this correction the public site was observed republished by other work
with company-guide and partner sections again. The canonical restoration branch
is fix/gig-tax-pros-restore-original in GigTaxProsCustomerSite-20261107. Future
publication must preserve this boundary rather than republish Connections.

Existing business sign-in, office signup and sales APIs were preserved from
16240c6 (merge c78f476), including their footer entry. They remain separate from
the customer homepage. Business-data storage and configuration were not changed.
Integration checkpoint: 715fde6. Six site interaction checks and twenty existing
business checks pass. Both public domains match the saved homepage exactly;
all public static checks pass in the linked receipt. Visual acceptance is Luke's.

Deployment dpl_Cp9LUKadHWmfqa2QBpsj1TwycyXt is Ready at
https://gigtax.pro and https://www.gigtax.pro. Detailed receipt:
gig-tax-pros-small-map-only-verification-20261107.json.
