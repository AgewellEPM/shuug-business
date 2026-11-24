"""Build the administrator index from public CMS and state licensing exports.

Usage: python3 scripts/sales/build-facility-leadership.py INPUT_DIR OUTPUT_JSON
The input filenames and publisher URLs are listed in the exported sources map.
Regeneration uses openpyxl, xlrd, and beautifulsoup4. The app reads only JSON.
"""

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import xlrd
from bs4 import BeautifulSoup
from openpyxl import load_workbook


SOURCES = {
    "cms": {
        "name": "CMS enrollment", "date": "2026-10",
        "url": "https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/skilled-nursing-facility-all-owners",
        "inputs": {
            "cms-owners.csv": "https://data.cms.gov/sites/default/files/2026-10/f60332c1-eab0-49b8-a4be-55c1b3da4449/SNF_All_Owners_2026.09.29.csv",
            "cms-enrollments.csv": "https://data.cms.gov/sites/default/files/2026-10/4674b04e-948d-45c6-b70e-2ad30b3e7b0d/SNF_Enrollments_2026.09.29.csv",
            "cms-facilities.csv": "https://data.cms.gov/provider-data/sites/default/files/resources/0970c657767e40f8521187d02ba8d0ed_1792181744/NH_ProviderInfo_Oct2026.csv",
        },
    },
    "AL": {
        "name": "Alabama public health", "date": "2026-11-23",
        "url": "https://www.alabamapublichealth.gov/providerstandards/directory.html",
        "inputs": {"al-report.xls": "https://dph1.adph.state.al.us/FacilitiesDirectory/"},
    },
    "CA": {
        "name": "California public health", "date": "2026-11-23",
        "url": "https://publish.data.ca.gov/dataset/licensed-and-certified-healthcare-facility-listing",
        "inputs": {"ca.csv": "https://data.chhs.ca.gov/dataset/3b5b80e8-6b8d-4715-b3c0-2699af6e72e5/resource/f0ae5731-fef8-417f-839d-54a0ed3a126e/download/health_facility_locations.csv"},
    },
    "IN": {
        "name": "Indiana health department", "date": "2026-11-23",
        "url": "https://www.in.gov/health/reports/QAMIS/ltcdir/wdirltc.htm",
        "inputs": {"in.html": "https://www.in.gov/health/reports/QAMIS/ltcdir/wdirltc.htm"},
    },
    "NC": {
        "name": "North Carolina licensure", "date": "2026-10",
        "url": "https://info.ncdhhs.gov/dhsr/facilities/search.asp",
        "inputs": {"nc.xlsx": "https://info.ncdhhs.gov/dhsr/data/Nhlist_a.xlsx?ver=1.2"},
    },
    "PA": {
        "name": "Pennsylvania health department", "date": "2026-09",
        "url": "https://apps.health.pa.gov/NCFFacilities/NCFOwnerLicensePull_202609.aspx",
        "inputs": {"pa.html": "https://apps.health.pa.gov/NCFFacilities/NCFOwnerLicensePull_202609.aspx"},
    },
    "TX": {
        "name": "Texas health and human services", "date": "2026-11-20",
        "url": "https://www.hhs.texas.gov/providers/long-term-care-providers/nursing-facilities-nf",
        "inputs": {"tx.xlsx": "https://apps.hhs.texas.gov/providers/directories/NF.xlsx"},
    },
}

CMS_TITLES = {
    "ADMINISTRATOR", "FACILITY ADMINISTRATOR", "NURSING HOME ADMINISTRATOR",
    "SNF ADMINISTRATOR", "LICENSED NURSING HOME ADMINISTRATOR", "INTERIM ADMINISTRATOR",
    "CEO/ADMINISTRATOR", "ADMINISTRATOR/CEO", "EXECUTIVE DIRECTOR/ADMINISTRATOR",
    "ADMINISTRATOR/EXECUTIVE DIRECTOR",
}


def clean(value):
    return " ".join(str(value or "").split())


def digits(value):
    return re.sub(r"[^0-9]", "", clean(value))


def street(value):
    words = {"STREET": "ST", "ROAD": "RD", "AVENUE": "AVE", "HIGHWAY": "HWY",
             "DRIVE": "DR", "LANE": "LN", "NORTH": "N", "SOUTH": "S", "EAST": "E",
             "WEST": "W", "NORTHEAST": "NE", "NORTHWEST": "NW", "SOUTHEAST": "SE",
             "SOUTHWEST": "SW", "BOULEVARD": "BLVD", "COURT": "CT"}
    return " ".join(words.get(word, word) for word in re.findall(r"[A-Z0-9]+", clean(value).upper()))


def csv_rows(path, encoding="utf-8-sig"):
    with path.open(encoding=encoding, errors="replace", newline="") as source:
        yield from csv.DictReader(source)


def excel_rows(path, headers):
    if path.suffix == ".xls":
        sheet = xlrd.open_workbook(path).sheet_by_index(0)
        columns = sheet.row_values(headers)
        for index in range(headers + 1, sheet.nrows):
            yield dict(zip(columns, sheet.row_values(index)))
        return
    book = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = book.active.iter_rows(min_row=headers + 1, values_only=True)
        columns = next(rows)
        for row in rows:
            yield dict(zip(columns, row))
    finally:
        book.close()


def source_rows(directory, state):
    if state == "AL":
        for row in excel_rows(directory / "al-report.xls", 0):
            if row["Facility Type"] == "Nursing Home":
                yield row["Medicare #"], row["Address Line 1"], row["ZIP"], row["Phone"], row["Administrator Name"], ""
    elif state == "CA":
        for row in csv_rows(directory / "ca.csv"):
            if row["FAC_TYPE_CODE"] == "SNF" and row["LICENSE_STATUS_DESCRIPTION"] == "ACTIVE":
                name = row["FACADMIN"]
                if name.count(",") == 1:
                    last, first = name.split(",")
                    name = f"{first.strip()} {last.strip()}"
                yield row["CCN"], row["ADDRESS"], row["ZIP"], row["CONTACT_PHONE_NUMBER"], name, ""
    elif state == "NC":
        for row in excel_rows(directory / "nc.xlsx", 4):
            if row["Site State"] == "NC":
                yield "", row["Site Address"], row["Site Zip"], row["Facility Contact Number"], row["Administrator Name"], ""
    elif state == "TX":
        for row in excel_rows(directory / "tx.xlsx", 1):
            if row["Program Type"] == "Nursing" and row["Facility  Licensed"] == "YES":
                yield row["Medicare Provider Number"], row["Physical Address"], row["Physical Address Zipcode"], row["Facility Phone Number"], row["Administrator"], ""
    elif state == "IN":
        document = BeautifulSoup((directory / "in.html").read_bytes(), "html.parser")
        for location in document.select(".provider"):
            fields = [p.get_text(" ", strip=True) for p in location.find_all("p", recursive=False)]
            address = next((p for p in fields if re.match(r"^\d+ ", p)), "")
            zip_code = next((p.rsplit(" ", 1)[-1] for p in fields if re.search(r",\s*\d{5}$", p)), "")
            phone = next((p.removeprefix("Tel:").strip() for p in fields if p.startswith("Tel:")), "")
            name = next((p.removeprefix("Administrator:").strip() for p in fields if p.startswith("Administrator:")), "")
            yield "", address, zip_code, phone, name, ""
    elif state == "PA":
        document = BeautifulSoup((directory / "pa.html").read_bytes(), "html.parser")
        for row in document.find_all("tr")[1:]:
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td", recursive=False)]
            if len(cells) >= 18 and cells[5] == "PA":
                yield cells[1], cells[3], cells[6], cells[8], cells[9], cells[10]


def valid_name(value):
    return bool(re.fullmatch(r"[\w .,'’()/-]{3,100}", value, re.UNICODE)
                and len(re.findall(r"[^\W\d_]+", value)) >= 2
                and not re.search(r"\b(?:vacant|unknown|pending|tbd|unassigned|unavailable)\b", value, re.I)
                and not any(character.isdigit() for character in value))


def unique_people(rows):
    result = {}
    for ccn, entries in rows.items():
        names = {re.sub(r"[^\w]", "", name.casefold()) for name, _, _ in entries}
        if len(names) == 1:
            result[ccn] = sorted(entries, key=lambda entry: (not entry[2], entry))[0]
    return result


def license_matches(facilities, rows, state):
    addresses, phones = defaultdict(set), defaultdict(set)
    for ccn, facility in facilities.items():
        if facility["State"] != state:
            continue
        addresses[street(facility["Provider Address"]), digits(facility["ZIP Code"])[:5]].add(ccn)
        phones[digits(facility["Telephone Number"])].add(ccn)
    found = defaultdict(set)
    for source_id, address, zip_code, phone, name, email in rows:
        name, email = clean(name), clean(email).lower()
        name = re.sub(r"\s*\(license\s*#?\s*\d+\)$", "", name, flags=re.I)
        if not valid_name(name):
            continue
        ccn = digits(source_id)
        address_key, zip_key, phone_key = street(address), digits(zip_code)[:5], digits(phone)
        same_address = addresses.get((address_key, zip_key), set()) if address_key and zip_key else set()
        same_phone = phones.get(phone_key, set()) if len(phone_key) == 10 else set()
        civic = address_key.split(" ")[0]
        phone_with_street = {id for id in same_phone if civic.isdigit() and
                             street(facilities[id]["Provider Address"]).split(" ")[0] == civic}
        matches = same_address | phone_with_street
        direct = facilities.get(ccn, {})
        if ccn in matches or (direct.get("State") == state and zip_key and digits(direct["ZIP Code"])[:5] == zip_key):
            matches = {ccn}
        if len(matches) == 1:
            address_for_admin = email if re.fullmatch(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", email) else ""
            found[next(iter(matches))].add((name, "Administrator", address_for_admin))
    return unique_people(found)


def build(directory):
    facilities = {row["CMS Certification Number (CCN)"]: row for row in csv_rows(directory / "cms-facilities.csv")
                  if row["State"] not in {"PR", "VI", "GU", "AS", "MP"}}
    enrollments = {row["ENROLLMENT ID"]: row for row in csv_rows(directory / "cms-enrollments.csv", "cp1252")}
    cms = defaultdict(set)
    for row in csv_rows(directory / "cms-owners.csv", "cp1252"):
        title = row["TITLE - OWNER"].strip()
        if (row["TYPE - OWNER"] != "I" or title not in CMS_TITLES or row["CHAIN HOME OFFICE - OWNER"] == "Y"):
            continue
        enrollment = enrollments.get(row["ENROLLMENT ID"], {})
        ccn = enrollment.get("CCN", "")
        if ccn not in facilities or facilities[ccn]["State"] != enrollment["STATE"]:
            continue
        name = clean(" ".join(
            row[key] for key in ("FIRST NAME - OWNER", "MIDDLE NAME - OWNER", "LAST NAME - OWNER")))
        if valid_name(name):
            cms[ccn].add((name, "Interim administrator" if title == "INTERIM ADMINISTRATOR" else "Administrator", ""))
    records = {}
    for source in SOURCES:
        found = unique_people(cms) if source == "cms" else license_matches(facilities, source_rows(directory, source), source)
        if not found:
            raise ValueError(f"No trusted facility matches for {source}")
        for ccn, (name, title, email) in found.items():
            row = facilities[ccn]
            records[ccn] = {"state": row["State"], "city": row["City/Town"], "name": name, "title": title, "source": source}
            if email:
                records[ccn]["email"] = email
    return facilities, records


def main():
    directory, output = map(Path, sys.argv[1:])
    facilities, records = build(directory)
    sources = json.dumps(SOURCES, ensure_ascii=False, sort_keys=True)
    entries = [f"    {json.dumps(ccn)}: {json.dumps(record, ensure_ascii=False, sort_keys=True)}"
               for ccn, record in sorted(records.items())]
    output.write_text('{"sources": ' + sources + ', "records": {\n' + ",\n".join(entries) + "\n}}\n", encoding="utf-8")
    print(f"{len(records)} people matched to {len(facilities)} CMS facilities")
    print("By source:", dict(Counter(row["source"] for row in records.values())))
    print("States with matches:", len({row["state"] for row in records.values()}))


if __name__ == "__main__":
    main()
