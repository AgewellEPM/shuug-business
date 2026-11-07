import SwiftUI

struct DriverPrivacyView: View {
  var body: some View {
    List {
      Section("Drives you control") {
        Text(
          "The app records drives you start, and can detect drives and expense stops when you enable those options in Account. Background detection uses location and motion permission; stop reminders use notification permission. Turn both assistance options off to stop detection, and end any active drive to stop its recording. Force-quitting, permission changes and poor GPS can leave missing mileage."
        )
        Text(
          "Route points are kept in the app’s private phone storage and are not uploaded to your firm. Apple Maps receives location for enabled place lookup, and trip endpoints when you request a route comparison. Your device and backup settings control system backups of app data."
        )
      }
      Section("Expenses and receipts") {
        Text(
          "You choose the expenses, income entries, photos and scans to save. Receipt text recognition runs on the iPhone. Suggested merchants and amounts need your review; they are not automatically posted."
        )
      }
      Section("Optional firm connection") {
        Text(
          "After you sign in to your invited client account, queued trip details, mileage totals, classifications, notes, income, expenses and chosen receipts sync to that firm’s private Shuug workspace. Staff with financial-record access can review them. Route coordinates are not part of those uploads."
        )
        Text(
          "Your password is used for sign-in and is not saved by this app. Its session credential is stored in iPhone Keychain. Accounts have separate phone journals; signing out hides the connected account’s journal until that same account is connected again."
        )
      }
      Section("Banks, statements & estimates") {
        Text("CSV/OFX/QFX statement imports stay in the phone inbox until you review and save entries. Approved entries, bank source references and attached receipts join your synced journal. Goals and vehicle-cost estimates stay on this phone.")
        Text("Optional direct bank linking uses Plaid's secure SDK and your bank's sign-in. Bank passwords are not received by this app. The firm stores encrypted provider access tokens and the downloaded transactions; authorized workspace administrators control that storage. The app downloads the feed for your review. Bank updates are periodic and may include corrections.")
        Text("Disconnect a bank in Money → Banks & statement imports → Connect a bank to revoke future provider access. Previously imported history and journal entries remain; ask your firm about retention. Sandbox test transactions cannot be posted to the real journal.")
        Link("Plaid privacy policy", destination: URL(string: "https://plaid.com/legal/#end-user-privacy-policy")!)
      }
      Section("Your choices") {
        Text(
          "You can review, correct, classify, export and delete journal entries. Deletions sync as deleted records so another device does not restore an old copy; the firm may retain historical records. Ask your firm about its access and retention practices."
        )
        Text(
          "CSV export shares your current journal through the system file exporter. Reinstalling or removing the app can erase phone-only records, so export or sync important records first."
        )
      }
      Section("Included services") {
        Text(
          "This app uses Apple's location, motion, maps and on-device receipt recognition, plus Plaid for optional bank linking. It has no advertising SDK or automatic tax-filing connection. Find my firm's workspace retrieves the public connection address from the firm's website."
        )
      }
    }.driverScreen().navigationTitle("App privacy & data").navigationBarTitleDisplayMode(.inline)
  }
}
