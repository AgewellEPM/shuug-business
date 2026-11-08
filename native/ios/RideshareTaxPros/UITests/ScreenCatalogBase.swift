import XCTest

/// Native screen inventory. Navigate and cancel forms; never save, sync, call,
/// book, start tracking, enable screen reading, or connect an external account.
@MainActor class ScreenCatalogBase: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
    XCUIDevice.shared.orientation = .portrait
  }
  override func tearDownWithError() throws { XCUIDevice.shared.orientation = .portrait }

  func open(welcome: Bool = false) -> XCUIApplication {
    let app = XCUIApplication(); app.terminate()
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-gettingStartedSeen", welcome ? "NO" : "YES"]
    app.launch()
    XCTAssertTrue((welcome ? app.buttons["tour.skip"] : app.buttons["dashboard.menu"]).waitForExistence(timeout: 20), app.debugDescription)
    return app
  }
  func scroll(_ app: XCUIApplication, down: Bool = true) {
    let start = CGVector(dx: 0.04, dy: down ? 0.78 : 0.27)
    let end = CGVector(dx: 0.04, dy: down ? 0.27 : 0.78)
    app.coordinate(withNormalizedOffset: start).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: end))
  }
  func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<12 {
      if element.exists && element.isHittable {
        let footer = app.buttons["guide.back"].exists ? app.buttons["guide.back"] : app.buttons["guide.next"]
        let fixed = ["guide.back", "guide.next", "guide.done", "guide.close"].contains(element.identifier)
        let tab = app.tabBars.firstMatch
        let lower = footer.exists ? footer.frame.minY - 10 : tab.exists && tab.isHittable ? tab.frame.minY - 12 : app.frame.maxY - 40
        let navigation = app.navigationBars.firstMatch
        let upper = navigation.exists ? navigation.frame.maxY + 4 : 64
        if fixed || (element.frame.midY > upper && element.frame.midY < lower) || element.elementType == .navigationBar { return }
        if element.frame.midY <= upper { scroll(app, down: false); continue }
      }
      scroll(app)
    }
    XCTAssertTrue(element.exists && element.isHittable, app.debugDescription)
  }
  func tap(_ label: String, in app: XCUIApplication) {
    let button = app.buttons[label].firstMatch
    if app.navigationBars.buttons.matching(identifier: label).count > 0 { button.tap(); return }
    reveal(button, in: app); XCTAssertTrue(button.isEnabled, label); button.tap()
  }
  func tool(_ label: String, in app: XCUIApplication) {
    tap("dashboard.menu", in: app); tap(label, in: app)
  }
  func capture(_ id: String, _ title: String, route: String, mode: String = "Actual app", app: XCUIApplication) throws {
    Thread.sleep(forTimeInterval: 0.45)
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ScreenCatalog", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let filename = "\(id) - \(title.replacingOccurrences(of: "/", with: "-")).png"
    let shot = XCUIScreen.main.screenshot()
    try shot.pngRepresentation.write(to: directory.appendingPathComponent(filename), options: .atomic)
    let record: [String: Any] = ["id": id, "title": title, "route": route, "mode": mode, "file": filename,
      "capturedAt": ISO8601DateFormatter().string(from: Date()), "width": Int(shot.image.size.width * shot.image.scale),
      "height": Int(shot.image.size.height * shot.image.scale)]
    try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
      .write(to: directory.appendingPathComponent(id + ".json"), options: .atomic)
    print("SCREEN_CAPTURE|\(id)|\(title)")
  }
  func pages(_ prefix: String, _ title: String, count: Int, route: String, mode: String = "Actual app", app: XCUIApplication) throws {
    for page in 1...count {
      if page > 1 { scroll(app) }
      try capture("\(prefix)-\(page)", "\(title) - Page \(page)", route: route, mode: mode, app: app)
    }
  }
}
