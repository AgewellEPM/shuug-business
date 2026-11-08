import XCTest

@MainActor final class ScreenshotGuideFlows: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }
  private func openOffers() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-gettingStartedSeen", "YES"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Offers"].waitForExistence(timeout: 15))
    app.tabBars.buttons["Offers"].tap()
    return app
  }
  private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<8 {
      if element.exists && element.isHittable {
        let footer = app.buttons["guide.back"].exists ? app.buttons["guide.back"] : app.buttons["guide.next"]
        let isFooter = ["guide.back", "guide.next", "guide.done", "guide.close"].contains(element.identifier)
        if isFooter || !footer.exists || element.frame.midY < footer.frame.minY - 10 { return }
      }
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.72))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.24)))
    }
    XCTAssertTrue(element.exists && element.isHittable, app.debugDescription)
  }
  private func tap(_ identifier: String, in app: XCUIApplication) {
    let button = app.buttons[identifier]
    if !button.waitForExistence(timeout: 2) { reveal(button, in: app) }
    XCTAssertTrue(button.waitForExistence(timeout: 10), app.debugDescription)
    reveal(button, in: app); XCTAssertTrue(button.isEnabled, identifier + "\n" + app.debugDescription); button.tap()
  }
  private func replace(_ field: XCUIElement, with text: String, in app: XCUIApplication) {
    reveal(field, in: app); field.tap()
    let value = field.value as? String ?? ""
    if value != field.placeholderValue { field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: value.count)) }
    field.typeText(text)
    if app.buttons["guide.keyboard.done"].exists { app.buttons["guide.keyboard.done"].tap() }
    else if app.buttons["entry.dismissKeyboard"].exists { app.buttons["entry.dismissKeyboard"].tap() }
    else if app.toolbars.buttons["Done"].exists { app.toolbars.buttons["Done"].tap() }
  }
  func test01PracticeBothRoutesAndChangedPay() throws {
    let app = openOffers()
    tap("screenshot.guide", in: app)
    XCTAssertTrue(app.otherElements["guide.doordash.reference"].exists || app.images["guide.doordash.reference"].exists,
      "The guide must display the real DoorDash reference.")
    XCTAssertFalse(app.buttons["guide.next"].isEnabled)
    tap("guide.hardware.first", in: app); tap("guide.hardware.side", in: app)
    tap("guide.next", in: app)
    tap("guide.save.menu", in: app); tap("guide.save.photo", in: app)
    tap("guide.next", in: app); tap("guide.route.picker", in: app)
    tap("guide.photo", in: app); tap("guide.next", in: app)
    tap("guide.next", in: app)
    XCTAssertEqual(app.staticTexts["guide.result.net"].label, "$6.70", app.debugDescription)
    tap("guide.back", in: app)
    replace(app.textFields["guide.pay"], with: "0.50", in: app)
    tap("guide.next", in: app)
    XCTAssertEqual(app.staticTexts["guide.result.net"].label, "-$0.30", app.debugDescription)
    tap("guide.restart", in: app)
    tap("Has a Home button", in: app)
    tap("guide.hardware.first", in: app); tap("guide.hardware.side", in: app)
    tap("guide.next", in: app); tap("guide.save.menu", in: app); tap("guide.save.photo", in: app)
    tap("guide.next", in: app); tap("guide.route.share", in: app)
    for button in ["guide.photo", "guide.share", "guide.share.app", "guide.share.read", "guide.share.keep"] { tap(button, in: app) }
    tap("guide.next", in: app); tap("guide.next", in: app)
    tap("guide.real", in: app)
    XCTAssertTrue(app.buttons["screenshot.choose"].waitForExistence(timeout: 10), app.debugDescription)
    app.terminate()
    app.launch(); app.tabBars.buttons["Offers"].tap()
    XCTAssertFalse(app.buttons["guide.close"].exists)
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "offer.card.")).count, 0,
      "Practice must not add offers to the driver's inbox.")
  }
  private func pickPhoto(in app: XCUIApplication) {
    tap("screenshot.choose", in: app)
    XCTAssertTrue(app.navigationBars["Photos"].waitForExistence(timeout: 15), app.debugDescription)
    let photo = app.images.matching(identifier: "PXGGridLayout-Info").matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,")).firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 15), app.debugDescription)
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(app.navigationBars["Review offer fields"].waitForExistence(timeout: 15), app.debugDescription)
  }
  func test02DirectPhotoReviewCancelCorrectionAndRelaunch() throws {
    let app = openOffers()
    tap("offers.screenshot", in: app)
    pickPhoto(in: app)
    XCTAssertEqual(app.textFields["Quoted payout"].value as? String, "19.50", app.debugDescription)
    app.navigationBars.buttons["Cancel"].tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "offer.card.")).count, 0)
    tap("offers.screenshot", in: app)
    tap("Set my vehicle cost & pay goal", in: app)
    replace(app.textFields["goals.hourly"], with: "20.00", in: app)
    replace(app.textFields["goals.cost"], with: "0.50", in: app)
    app.navigationBars.buttons["Save"].tap()
    pickPhoto(in: app)
    replace(app.textFields["Quoted payout"], with: "20.50", in: app)
    replace(app.textFields["Guaranteed part of payout"], with: "20.50", in: app)
    replace(app.textFields["Additional costs (0 only if known)"], with: "0", in: app)
    replace(app.textFields["All working miles"], with: "10", in: app)
    replace(app.textFields["All working minutes"], with: "30", in: app)
    app.navigationBars.buttons["Save"].tap()
    let cash = app.staticTexts["$15.50"].firstMatch
    XCTAssertTrue(cash.waitForExistence(timeout: 10), app.debugDescription)
    app.terminate(); app.launch(); app.tabBars.buttons["Offers"].tap()
    let card = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "offer.card.DoorDash")).firstMatch
    reveal(card, in: app); card.tap()
    XCTAssertTrue(cash.waitForExistence(timeout: 10), "Reviewed amounts must survive relaunch and capture refresh.\n" + app.debugDescription)
  }
  func test03HelpMapAndZIPValidation() throws {
    let app = openOffers(); app.tabBars.buttons["Home"].tap()
    tap("help.open", in: app)
    XCTAssertTrue(app.descendants(matching: .any)["help.map"].waitForExistence(timeout: 10), app.debugDescription)
    replace(app.textFields["help.zip"], with: "123", in: app)
    tap("help.search", in: app)
    XCTAssertTrue(app.staticTexts["help.location.error"].waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertEqual(app.staticTexts["help.location.error"].label, "Enter a five-digit US ZIP code.")
    tap("help.refresh", in: app)
    XCTAssertTrue(app.buttons["help.website"].exists, app.debugDescription)
  }
  func test04FirstLaunchTourPlaysAndCanBeSkippedOrReplayed() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-gettingStartedSeen", "NO"]
    app.launch()
    XCTAssertTrue(app.buttons["tour.watch"].waitForExistence(timeout: 15), app.debugDescription)
    app.buttons["tour.watch"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["tour.player"].waitForExistence(timeout: 10), app.debugDescription)
    Thread.sleep(forTimeInterval: 3)
    app.buttons["tour.player.done"].tap(); app.buttons["tour.skip"].tap()
    XCTAssertTrue(app.tabBars.buttons["Home"].exists)
    app.buttons["dashboard.menu"].tap(); app.buttons["Getting-started video"].tap()
    XCTAssertTrue(app.buttons["tour.watch"].waitForExistence(timeout: 10))
    tap("tour.chapter.help", in: app)
    XCTAssertTrue(app.buttons["tour.player.done"].waitForExistence(timeout: 10))
    app.buttons["tour.player.done"].tap(); app.terminate()
  }
}
