import XCTest

@MainActor final class ScreenCatalogAccountFlows: ScreenCatalogBase {
  func test01AccountAndPrivacy() throws {
    var app = open(); tool("Account", in: app); Thread.sleep(forTimeInterval: 2)
    try pages("15-01", "Account - Sign in and sync choices", count: 4, route: "Home > Account", app: app)
    app = open(); tool("Account", in: app); tap("App privacy & data", in: app)
    try pages("15-02", "App privacy and data", count: 5, route: "Account > App privacy & data", app: app)
  }
  func test02AlertsAndRewards() throws {
    var app = open(); tool("Alerts & reminders", in: app)
    try pages("16-01", "Alerts and reminders", count: 2, route: "Home > Alerts & reminders", app: app)
    app = open(); tool("Account", in: app); tap("Driving & expense reminders", in: app)
    try pages("16-02", "Driving and expense assistance settings", count: 2, route: "Account > Driving & expense reminders", app: app)
    app = open(); tool("Account", in: app); tap("Driver Rewards · Referrals & points", in: app)
    try pages("16-03", "Driver Rewards and referrals", count: 2, route: "Account > Driver Rewards", app: app)
  }
  func test03CoachAndTaxDetails() throws {
    var app = open(); tap("dashboard.coach", in: app)
    try pages("17-01", "Tax and Goals chat", count: 2, route: "Home > Tax & Goals chat", app: app)
    app = open(); tap("dashboard.coach", in: app); tap("coach.intake", in: app)
    try capture("17-02", "Tax details form", route: "Tax & Goals > Tax details", app: app)
  }
  func test04RatingsAndReviews() throws {
    var app = open(); tool("Ratings & reviews", in: app)
    try pages("18-01", "Ratings history and feedback guide", count: 3, route: "Home > Ratings & reviews", app: app)
    app = open(); tool("Ratings & reviews", in: app); tap("reputation.addRating", in: app)
    try pages("18-02", "Add a rating snapshot", count: 2, route: "Ratings & reviews > Add rating", app: app)
    app = open(); tool("Ratings & reviews", in: app); tap("reputation.addReview", in: app)
    try pages("18-03", "Add a review and feedback topics", count: 3, route: "Ratings & reviews > Add review", app: app)
  }
  func test05OfficeHelp() throws {
    let app = open(); tap("help.open", in: app)
    XCTAssertTrue(app.descendants(matching: .any)["help.map"].waitForExistence(timeout: 15))
    Thread.sleep(forTimeInterval: 3)
    try pages("19-01", "Find an office and get help", count: 2, route: "Home > Get help", app: app)
  }
  func test06WorkspaceAndWrittenTour() throws {
    var app = open(); tool("Account", in: app); tap("Use an address supplied by my firm", in: app)
    try capture("15-03", "Account - Enter a workspace address", route: "Account > Use an address supplied by my firm", app: app)
    app = open(welcome: true)
    let transcript = app.buttons["Read this part"].firstMatch
    reveal(transcript, in: app); transcript.tap()
    try pages("01-05", "Getting started - Written transcript", count: 2, route: "Getting started > Read this part", app: app)
  }
}
