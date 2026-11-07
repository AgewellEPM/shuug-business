import XCTest

@MainActor final class ScreenshotGuideFlows: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }
  private func openOffers() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Offers"].waitForExistence(timeout: 15))
    app.tabBars.buttons["Offers"].tap()
    return app
  }
  private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<8 {
      if element.exists && element.isHittable {
        let footer = app.buttons["guide.back"]
        let isFooter = ["guide.back", "guide.next", "guide.done", "guide.close"].contains(element.identifier)
        if isFooter || !footer.exists || element.frame.midY < footer.frame.minY - 10 { return }
      }
      app.swipeUp()
    }
    XCTAssertTrue(element.exists && element.isHittable, app.debugDescription)
  }
  private func tap(_ identifier: String, in app: XCUIApplication) {
    let button = app.buttons[identifier]
    XCTAssertTrue(button.waitForExistence(timeout: 10), app.debugDescription)
    reveal(button, in: app); button.tap()
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
    XCTAssertFalse(app.buttons["guide.next"].isEnabled)
    tap("guide.hardware.first", in: app); tap("guide.hardware.side", in: app)
    tap("guide.next", in: app)
    tap("guide.save.menu", in: app); tap("guide.save.photo", in: app)
    tap("guide.next", in: app); tap("guide.route.picker", in: app)
    tap("guide.photo", in: app); tap("guide.next", in: app)
    tap("guide.next", in: app)
    XCTAssertEqual(app.staticTexts["guide.result.net"].label, "$15.00", app.debugDescription)
    tap("guide.back", in: app)
    replace(app.textFields["guide.pay"], with: "4.00", in: app)
    tap("guide.next", in: app)
    XCTAssertEqual(app.staticTexts["guide.result.net"].label, "-$1.00", app.debugDescription)
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
}
