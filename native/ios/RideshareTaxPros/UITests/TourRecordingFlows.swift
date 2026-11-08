import XCTest

/// Record only a fresh guest session. Forms are cancelled; no client data,
/// financial records, calls, appointments or external messages are created.
@MainActor final class TourRecordingFlows: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }
  private func fresh() -> XCUIApplication {
    let app = XCUIApplication(); app.terminate()
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-gettingStartedSeen", "YES"]
    app.launch(); XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 15)); return app
  }
  private func scroll(_ app: XCUIApplication) {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.72))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.24)))
  }
  private func tap(_ id: String, in app: XCUIApplication) {
    let button = app.buttons[id].firstMatch
    for _ in 0..<10 {
      let footer = app.buttons["guide.back"].exists ? app.buttons["guide.back"] : app.buttons["guide.next"]
      let fixed = ["guide.back", "guide.next", "guide.done", "guide.close"].contains(id)
      if button.exists && button.isHittable && (fixed || !footer.exists || button.frame.midY < footer.frame.minY - 10) { break }
      scroll(app)
    }
    XCTAssertTrue(button.exists && button.isHittable && button.isEnabled, "Missing tour action \(id)\n\(app.debugDescription)"); button.tap()
  }
  private func chapter(_ id: String, action: () -> Void = {}) {
    Thread.sleep(forTimeInterval: 1)
    print("TOUR_BEGIN|\(id)|\(Date().timeIntervalSince1970)")
    Thread.sleep(forTimeInterval: 4); action(); Thread.sleep(forTimeInterval: 5)
    print("TOUR_END|\(id)|\(Date().timeIntervalSince1970)")
  }
  private func tool(_ name: String, in app: XCUIApplication) { tap("dashboard.menu", in: app); tap(name, in: app) }
  func testRecordGettingStarted() throws {
    var app = fresh(); chapter("home")
    app = fresh(); tap("Start a drive", in: app)
    XCTAssertTrue(app.navigationBars["Start a drive"].waitForExistence(timeout: 10)); chapter("drives")
    app = fresh(); tap("quick.expense", in: app)
    XCTAssertTrue(app.navigationBars["Add expense"].waitForExistence(timeout: 10)); chapter("money") { self.scroll(app) }
    app = fresh(); app.tabBars.buttons["Offers"].tap(); tap("screenshot.guide", in: app)
    chapter("screenshots") {
      for id in ["guide.hardware.first", "guide.hardware.side", "guide.next", "guide.save.menu", "guide.save.photo", "guide.next", "guide.route.picker", "guide.photo", "guide.next", "guide.next"] { self.tap(id, in: app) }
      XCTAssertEqual(app.staticTexts["guide.result.net"].label, "$6.70")
    }
    app = fresh(); app.tabBars.buttons["Offers"].tap(); tap("offers.screenshot", in: app); tap("screenshot.choose", in: app)
    XCTAssertTrue(app.navigationBars["Photos"].waitForExistence(timeout: 15))
    let photo = app.images.matching(identifier: "PXGGridLayout-Info").matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,")).firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 15)); photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(app.navigationBars["Review offer fields"].waitForExistence(timeout: 15)); chapter("review") { self.scroll(app) }
    app = fresh(); app.tabBars.buttons["Earnings"].tap(); chapter("earnings") { self.tap("insights.goals", in: app) }
    app = fresh(); app.tabBars.buttons["Go Home"].tap(); chapter("go_home") { self.scroll(app) }
    app = fresh(); app.tabBars.buttons["Position"].tap(); chapter("position")
    app = fresh(); tap("dashboard.coach", in: app); chapter("coach")
    app = fresh(); tool("Ratings & reviews", in: app); chapter("ratings") { self.tap("reputation.addRating", in: app) }
    app = fresh(); tool("Account", in: app); chapter("account") { self.scroll(app) }
    app = fresh(); tap("help.open", in: app)
    XCTAssertTrue(app.descendants(matching: .any)["help.map"].waitForExistence(timeout: 15)); chapter("help")
    app = fresh(); chapter("finish"); app.terminate()
  }
}
