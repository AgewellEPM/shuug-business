import XCTest

/// Capture existing, user-visible screens without creating records or connections.
@MainActor final class AppStoreScreenshotFlows: ScreenCatalogBase {
  func testStoreScreenshots() throws {
    var app = open()
    try capture("store-01", "Home", route: "Home", app: app)

    tool("Trips", in: app)
    tap("Add manual trip", in: app)
    XCTAssertTrue(app.buttons["trip.classification"].waitForExistence(timeout: 10))
    try capture("store-02", "Mileage records", route: "Home > Trips > Add manual trip", app: app)

    app = open()
    tap("quick.expense", in: app)
    XCTAssertTrue(app.buttons["expense.category"].waitForExistence(timeout: 10))
    try capture("store-03", "Expenses and receipts", route: "Home > Expense", app: app)

    app = open()
    // iPadOS 26 exposes the floating tab as a cell instead of a TabBar button.
    let offers = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label == %@", "Offers")).firstMatch
    XCTAssertTrue(offers.waitForExistence(timeout: 10))
    offers.tap()
    tap("offers.screenshot", in: app)
    try capture("store-04", "Import an offer screenshot", route: "Offers > Choose screenshot", app: app)

    app = open()
    tap("dashboard.sample", in: app)
    XCTAssertTrue(app.otherElements["sample.banner"].exists ||
      app.staticTexts["SAMPLE DATA · Your records are separate"].waitForExistence(timeout: 10))
    try capture("store-05", "Explore sample earnings", route: "Home > Explore a sample shift",
      mode: "Built-in sample data", app: app)

    app = open(welcome: true)
    try capture("store-06", "Getting started", route: "First launch", app: app)
  }
}
