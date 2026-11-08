import XCTest

@MainActor final class ScreenCatalogOffersFlows: ScreenCatalogBase {
  func offers() -> XCUIApplication { let app = open(); app.tabBars.buttons["Offers"].tap(); return app }
  func test01OffersAndManualEntry() throws {
    var app = offers()
    try pages("10-01", "Offers inbox", count: 2, route: "Offers", app: app)
    app = offers(); tap("offers.enter", in: app)
    try pages("10-02", "Manual offer - Review every field", count: 4, route: "Offers > Enter", app: app)
    app = offers(); tap("offers.screenshot", in: app)
    try pages("10-03", "Choose an offer screenshot", count: 2, route: "Offers > Choose screenshot", app: app)
    app = offers(); tap("Read an offer", in: app)
    try pages("10-04", "Offer reader permissions and setup", count: 3, route: "Offers > Read an offer", app: app)
  }
  func test02PlatformsAndDiagnostics() throws {
    var app = offers(); tap("Offer settings and platforms", in: app)
    try pages("11-01", "Platforms and settings", count: 2, route: "Offers > Platforms & settings", app: app)
    app = offers(); tap("Offer settings and platforms", in: app); tap("Connected jobs & pay", in: app)
    try pages("11-02", "Connected work - Jobs and pay", count: 2, route: "Platforms & settings > Connected jobs & pay", app: app)
    app = offers(); tap("Offer settings and platforms", in: app); tap("Planning reserves & history", in: app)
    try pages("11-03", "Planning reserves and work history", count: 2, route: "Platforms & settings > Planning reserves & history", app: app)
  }
  func test03PerPlatformDiagnostics() throws {
    var app = open(); tool("Offer Capture Diagnostics", in: app)
    try pages("12-01", "Capture diagnostics overview", count: 2, route: "Home > Offer Capture Diagnostics", app: app)
    for platform in ["Uber", "DoorDash", "Lyft", "Instacart", "Spark"] {
      app = open(); tool("Offer Capture Diagnostics", in: app); tap("capture.platform.\(platform)", in: app)
      try pages("12-02-\(platform)", "Capture diagnostics - \(platform)", count: 3, route: "Capture diagnostics > \(platform)", app: app)
    }
  }
  func test04InteractiveScreenshotGuide() throws {
    let app = offers(); tap("screenshot.guide", in: app)
    try capture("13-01", "Screenshot guide - Face ID phone buttons", route: "Offers > Screenshot guide", mode: "Interactive practice", app: app)
    tap("Has a Home button", in: app)
    try capture("13-02", "Screenshot guide - Home button phone", route: "Screenshot guide > Has a Home button", mode: "Interactive practice", app: app)
    tap("guide.hardware.first", in: app); tap("guide.hardware.side", in: app); tap("guide.next", in: app)
    try capture("13-03", "Screenshot guide - Save the picture", route: "Screenshot guide > Save the picture", mode: "Interactive practice", app: app)
    tap("guide.save.menu", in: app)
    try capture("13-04", "Screenshot guide - Save menu", route: "Screenshot guide > Save menu", mode: "Interactive practice", app: app)
    tap("guide.save.photo", in: app); tap("guide.next", in: app)
    try capture("13-05", "Screenshot guide - Import route choices", route: "Screenshot guide > Pick a way to bring it in", mode: "Interactive practice", app: app)
    tap("guide.route.picker", in: app)
    try capture("13-06", "Screenshot guide - Choose from Photos", route: "Screenshot guide > Photo picker lesson", mode: "Interactive practice", app: app)
    tap("guide.photo", in: app); tap("guide.next", in: app)
    try pages("13-07", "Screenshot guide - Check the numbers", count: 2, route: "Screenshot guide > Check the numbers", mode: "Interactive practice", app: app)
    tap("guide.next", in: app)
    try pages("13-08", "Screenshot guide - Profit estimate explained", count: 2, route: "Screenshot guide > See what you could keep", mode: "Interactive practice", app: app)
    tap("guide.restart", in: app); tap("guide.hardware.first", in: app); tap("guide.hardware.side", in: app)
    tap("guide.next", in: app); tap("guide.save.menu", in: app); tap("guide.save.photo", in: app); tap("guide.next", in: app)
    tap("guide.route.share", in: app)
    try capture("13-09", "Screenshot guide - Sharing from Photos", route: "Screenshot guide > Share lesson", mode: "Interactive practice", app: app)
    for (index, id) in ["guide.photo", "guide.share", "guide.share.app", "guide.share.read", "guide.share.keep"].enumerated() {
      tap(id, in: app)
      try capture("13-10-\(index + 1)", "Screenshot guide - Share step \(index + 1)", route: "Screenshot guide > Share lesson > \(id)", mode: "Interactive practice", app: app)
    }
  }
  func test05UniversalWorkProfiles() throws {
    for (id, title) in [("universal-delivery", "Universal Delivery"), ("in-store-shopper", "In-store Shopper")] {
      let app = open(), row = app.descendants(matching: .any).matching(identifier: "gig.launcher.row").firstMatch
      reveal(row, in: app)
      let button = app.buttons["gig.launcher.\(id)"].firstMatch
      for _ in 0..<14 {
        if button.exists && button.isHittable { break }
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.86, dy: 0.30))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.30))
        if row.exists { row.swipeLeft() } else { start.press(forDuration: 0.05, thenDragTo: end) }
      }
      XCTAssertTrue(button.exists && button.isHittable, app.debugDescription); button.tap()
      try pages("14-01-\(id)", title, count: 2, route: "Home > Gig apps > \(title)", app: app)
    }
  }
}
