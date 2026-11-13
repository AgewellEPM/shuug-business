import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('business_places_builder', Path(__file__).with_name('build-business-places.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def fixture(**changes):
    return {'id': '12345678-1234-1234-1234-123456789abc', 'names': {'primary': 'Synthetic Tax'},
            'taxonomy': {'primary': 'tax_service'}, 'operating_status': 'open', 'confidence': 0.9,
            'addresses': [{'freeform': '12 Fixture Rd', 'locality': 'Hartford', 'region': 'CT', 'country': 'US', 'postcode': '06103'}],
            'websites': ['https://fixture-business.org/contact'], 'phones': ['860-246-9999'],
            'emails': ['Office@fixture-business.org'], 'sources': [{'dataset': 'Synthetic', 'property': '/websites', 'update_time': '2026-09-01'}],
            'bbox': {'xmin': -72.68, 'ymin': 41.76}, **changes}


class BusinessPlaceBuilderTests(unittest.TestCase):
    def test_published_business_fields_keep_record_provenance_without_person_inference(self):
        rows = builder.normalize(fixture(), 6, 107)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row['phones'], ['+18602469999'])
        self.assertEqual(row['emails'], ['office@fixture-business.org'])
        self.assertEqual(row['sourceFile'], 6)
        self.assertEqual(row['sourceRowGroup'], 107)
        self.assertEqual(row['sources'][0]['update_time'], '2026-09-01')
        self.assertNotIn('owner', row)
        self.assertNotIn('location', row)

    def test_closed_government_legal_and_taxi_records_are_not_accounting_contacts(self):
        for category in ['tax_office', 'tax_law', 'taxi_service', 'taxidermist']:
            self.assertEqual(builder.normalize(fixture(taxonomy={'primary': category}), 0, 0), [])
        self.assertEqual(builder.normalize(fixture(operating_status='permanently_closed'), 0, 0), [])
        self.assertEqual(builder.normalize(fixture(confidence=0), 0, 0), [])
        self.assertEqual(builder.normalize(fixture(confidence=float('nan')), 0, 0), [])
        self.assertEqual(builder.normalize(fixture(websites=[], phones=[], emails=[]), 0, 0), [])

    def test_only_explicit_us_state_and_locality_records_are_used(self):
        address = fixture()['addresses'][0]
        for changes in [{'country': 'CA'}, {'region': 'PR'}, {'locality': ''}, {'freeform': ''}]:
            self.assertEqual(builder.normalize(fixture(addresses=[{**address, **changes}]), 0, 0), [])
        rows = builder.normalize(fixture(addresses=[address, address, {**address, 'region': 'US-MA'}]), 0, 0)
        self.assertEqual([r['state'] for r in rows], ['CT', 'MA'])

    def test_unsafe_urls_and_non_business_placeholders_are_rejected(self):
        for value in ['javascript:alert(1)', 'https://user:password@fixture.org', 'http://10.0.0.1',
                      'https://[::1]', 'http://office.internal', 'https://fixture.org:8000', 'https://fixture.org/\n']:
            self.assertEqual(builder.website(value), '')
        self.assertEqual(builder.phone('860-555-0199'), '')
        self.assertEqual(builder.phone('+44 20 7946 0000'), '')
        self.assertEqual(builder.email('not-an-email'), '')


if __name__ == '__main__':
    unittest.main()
