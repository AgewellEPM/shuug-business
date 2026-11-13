# New York EIC originals

The annual 2023–2025 IT-215 and IT-209 originals are pinned in
`state-ny-eic-maps.mjs` and `data/ny-eic-form-sources.json`. Their inventories are
stored beside the unchanged PDF bytes. IT-215 has two pages and 67 fields each
year. IT-209 has four pages, with 105 fields in 2023 and 104 in 2024/2025. No
2026/2027 original is inferred from these forms.

`renderNYEicForm` validates annual bytes, hashes, field counts and page geometry,
fills the reviewed fields, flattens their appearances and removes document
actions. It consumes the state's actual `lines`, `flags`, federal child records,
noncustodial source children and worksheets. It does not recalculate eligibility,
replace unknown amounts with zeros or derive calendar months from residence days.
Long or incomplete identifiers and overflowed field values fail explicitly.

The mappings were checked against printed row positions. IT-215's misleading
legacy field names require question 2 to use `Line 1a`, question 3 to use
`Line 2`, and question 4 to use `Line 3`. IT-209 questions 7 and 9 have reversed
widget order, so the renderer selects their actual native Yes/No appearance
values. The 2023 IT-209 includes an unused field over an already printed .30
rate; that field remains empty to avoid printing the rate twice.

IT-215 and IT-209 Schedule B print the actual federal child identities,
relationships, birth dates, reviewed months and corresponding student/disability
checkboxes. Additional federal child rows use the instructed continuation with
taxpayer name/SSN. IT-209 line 3 requests up to three noncustodial children;
additional linked source records remain in the calculation workpaper. The
workpaper also retains support orders, effective periods, due/paid amounts,
separate noncustodial combat elections, and the NYC rate and credit worksheets.

Tests check actual extracted PDF positions and flattening across all six
originals, native checkbox selections, unknown blank amounts, annual hash
failures and full continuation retention. Geometry vectors are synthetic.
Six additional source-reviewed annual ordinary/noncustodial cases run the real
calculation through `generateDraftPdf`, checking the IT-201 payment transfers,
known settlement amounts and the attached original schedules. A four-child
calculation exercises the actual continuation path; an unresolved birth date
keeps the amount unknown and the unsafe original out of the packet.
These are preparation packets, not agency approval or filing certification.
