import XCTest

@MainActor final class ScreenCatalogMainFlows: ScreenCatalogBase {
  func test01WelcomeAndVideo() throws {
    let app = open(welcome: true)
    try capture("01-01", "Getting started - Welcome", route: "First launch", app: app)
    tap("tour.watch", in: app)
    XCTAssertTrue(app.buttons["tour.player.done"].waitForExistence(timeout: 15))
    Thread.sleep(forTimeInterval: 2)
    try capture("01-02", "Tour player - Portrait rotation instruction", route: "Getting started > Watch", app: app)
    XCUIDevice.shared.orientation = .landscapeLeft; Thread.sleep(forTimeInterval: 2)
    try capture("01-03", "Tour player - Landscape", route: "Getting started > Watch > Rotate phone", app: app)
    XCUIDevice.shared.orientation = .portrait
    tap("tour.player.done", in: app)
    try pages("01-04", "Getting started chapters", count: 4, route: "Getting started > Scroll", app: app)
  }
  func test02HomeAndDriving() throws {
    var app = open()
    try pages("02-01", "Home dashboard", count: 3, route: "Home", app: app)
    app = open(); tap("dashboard.menu", in: app)
    try capture("02-02", "Home - More tools menu", route: "Home > More tools", app: app)
    app = open(); tap("Start a drive", in: app)
    XCTAssertTrue(app.navigationBars["Start a drive"].waitForExistence(timeout: 10), app.debugDescription)
    try capture("03-01", "Start a drive", route: "Home > Start a drive", app: app)
    tap("Classification, Review later", in: app)
    try capture("03-02", "Drive classification choices", route: "Start a drive > Classification", app: app)
    app = open(); tool("Trips", in: app)
    try capture("03-03", "Trips - Saved driving records", route: "Home > Trips", app: app)
    tap("Add manual trip", in: app)
    try pages("03-04", "Manual trip entry", count: 2, route: "Trips > Add manual trip", app: app)
    app = open(); tool("Trips", in: app); tap("Add manual trip", in: app); tap("trip.classification", in: app)
    try capture("03-05", "Manual trip - Classification", route: "Manual trip > Classification", app: app)
    app = open(); tool("Trips", in: app); tap("Add manual trip", in: app); tap("trip.role", in: app)
    try capture("03-06", "Manual trip - Drive type", route: "Manual trip > Drive type", app: app)
  }
  func test03PlanningAndEarnings() throws {
    var app = open(); app.tabBars.buttons["Go Home"].tap()
    try pages("04-01", "Go Home - Mission and offer planning", count: 5, route: "Go Home", app: app)
    app = open(); app.tabBars.buttons["Position"].tap()
    try pages("04-02", "Position - Waiting area planner", count: 2, route: "Position", app: app)
    app = open(); app.tabBars.buttons["Earnings"].tap()
    try pages("05-01", "Earnings and recorded results", count: 3, route: "Earnings", app: app)
    app = open(); app.tabBars.buttons["Earnings"].tap(); tap("insights.goals", in: app)
    try capture("05-02", "Driving goals and vehicle cost", route: "Earnings > Goals", app: app)
  }
  func test04BuiltInSampleShift() throws {
    var app = open(); tap("dashboard.sample", in: app)
    XCTAssertTrue(app.otherElements["sample.banner"].exists || app.staticTexts["SAMPLE DATA · Your records are separate"].waitForExistence(timeout: 10))
    try pages("06-01", "Sample earnings and charts", count: 4, route: "Home > Explore a sample shift > Earnings", mode: "Built-in sample data", app: app)
    // The built-in sample has four platforms and a second incomplete DoorDash offer.
    for platform in ["Uber", "DoorDash", "Instacart", "Spark"] {
      app = open(); app.tabBars.buttons["Offers"].tap(); tap("offers.sample", in: app)
      XCTAssertTrue(app.navigationBars["Explore a sample shift"].waitForExistence(timeout: 10), app.debugDescription)
      let card = app.buttons.matching(identifier: "sample.ranked").matching(NSPredicate(format: "label BEGINSWITH %@", "\(platform) app icon")).firstMatch
      reveal(card, in: app)
      try capture("06-02-\(platform)", "Sample offer card - \(platform)", route: "Offers > Explore a sample shift", mode: "Built-in sample data", app: app)
      card.tap()
      XCTAssertTrue(app.navigationBars[platform].waitForExistence(timeout: 10), app.debugDescription)
      try pages("06-03-\(platform)", "Sample offer detail - \(platform)", count: 2, route: "Sample offers > \(platform)", mode: "Built-in sample data", app: app)
    }
    app = open(); app.tabBars.buttons["Offers"].tap(); tap("offers.sample", in: app)
    XCTAssertTrue(app.navigationBars["Explore a sample shift"].waitForExistence(timeout: 10))
    let incomplete = app.buttons.matching(identifier: "sample.ranked").matching(NSPredicate(format: "label CONTAINS %@", "$19.50")).firstMatch
    reveal(incomplete, in: app)
    try capture("06-04", "Sample offer - Missing information", route: "Sample offers > Incomplete DoorDash example", mode: "Built-in sample data", app: app)
    incomplete.tap()
    try pages("06-05", "Sample offer detail - Missing information", count: 2, route: "Sample offers > Incomplete DoorDash example", mode: "Built-in sample data", app: app)
  }
}
