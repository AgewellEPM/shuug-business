import SwiftUI

struct DriverPrivacyView: View {
  var body: some View {
    List {
      Section("Drives you control") {
        Text(
          "The app records location during a drive you start. iPhone displays its location indicator while GPS runs in the background. End the drive to stop recording. Force-quitting the app, changing permissions or losing GPS can leave missing mileage that needs your review."
        )
        Text(
          "Route points are kept in the app’s private phone storage and are not uploaded to your firm. Route previews use Apple’s MapKit. Your device and backup settings control system backups of app data."
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
          "This app includes no advertising SDK, bank feed, remote receipt-recognition service or automatic tax-filing connection. It can retrieve the firm’s public workspace address from the Rideshare Tax Pros website when you choose Find my firm’s workspace."
        )
      }
    }.driverScreen().navigationTitle("App privacy & data").navigationBarTitleDisplayMode(.inline)
  }
}
