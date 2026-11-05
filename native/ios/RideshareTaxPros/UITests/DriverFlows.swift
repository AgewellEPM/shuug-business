import XCTest

@MainActor final class DriverFlows: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }
  private func open() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments += ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 2), app.debugDescription)
    return app
  }
  private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<10 {
      if element.exists && element.isHittable { return }
      app.swipeUp()
    }
    XCTAssertTrue(element.exists && element.isHittable, app.debugDescription)
  }
  private func enter(_ value: String, into field: XCUIElement, in app: XCUIApplication) {
    reveal(field, in: app)
    field.tap()
    field.typeText(value)
    let done = app.buttons["expense.dismissKeyboard"]
    if done.waitForExistence(timeout: 2) { done.tap() }
  }
  private func newExpense(_ merchant: String, amount: String, in app: XCUIApplication) {
    app.tabBars.buttons["Today"].tap()
    app.buttons["Add expense"].tap()
    enter(merchant, into: app.textFields["Merchant"], in: app)
    enter(amount, into: app.textFields["Amount · USD (12.34)"], in: app)
  }
  private func choose(_ label: String, picker: String, in app: XCUIApplication) {
    let control = app.buttons[picker]
    reveal(control, in: app)
    control.tap()
    let choice = app.buttons[label]
    reveal(choice, in: app)
    choice.tap()
  }
  private func multiline(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    let text = app.textViews[identifier]
    return text.exists ? text : app.textFields[identifier]
  }
  func test01DriveExpenseAndRelaunch() throws {
    let app = open()
    XCTAssertTrue(app.buttons["Start a drive"].waitForExistence(timeout: 15))
    app.buttons["Start a drive"].tap()
    let start = app.navigationBars["Start a drive"].buttons["Start"]
    XCTAssertTrue(start.waitForExistence(timeout: 10), app.debugDescription)
    start.tap()
    let miles = app.staticTexts["driver.liveMiles"]
    XCTAssertTrue(miles.waitForExistence(timeout: 10))
    let moving = expectation(
      for: NSPredicate { _, _ in !miles.label.hasPrefix("0.00") }, evaluatedWith: miles)
    wait(for: [moving], timeout: 40)
    let before = miles.label
    XCUIDevice.shared.press(.home)
    XCTAssertTrue(app.wait(for: .runningBackground, timeout: 15), app.debugDescription)
    Thread.sleep(forTimeInterval: 8)
    app.activate()
    XCTAssertTrue(app.buttons["End drive & save"].waitForExistence(timeout: 10))
    XCTAssertNotEqual(miles.label, before)
    app.buttons["End drive & save"].tap()
    app.buttons["Add expense"].tap()
    app.textFields["Merchant"].tap()
    app.textFields["Merchant"].typeText("Native UI fuel")
    app.textFields["Amount · USD (12.34)"].tap()
    app.textFields["Amount · USD (12.34)"].typeText("17.35")
    app.navigationBars["Add expense"].buttons["Save"].tap()
    app.tabBars.buttons["Money"].tap()
    XCTAssertTrue(app.staticTexts["Native UI fuel"].waitForExistence(timeout: 10))
    app.terminate()
    app.launch()
    app.tabBars.buttons["Money"].tap()
    XCTAssertTrue(app.staticTexts["Native UI fuel"].waitForExistence(timeout: 10))
    app.tabBars.buttons["Trips"].tap()
    XCTAssertTrue(app.staticTexts["Driving trip"].waitForExistence(timeout: 10))
  }
  func test02PhotoReceiptAndOnDeviceRecognition() throws {
    let app = open()
    newExpense("Native UI receipt", amount: "1.00", in: app)
    let picker = app.buttons["Choose receipt photo"]
    reveal(picker, in: app)
    picker.tap()
    XCTAssertTrue(app.navigationBars["Photos"].waitForExistence(timeout: 15), app.debugDescription)
    let photo = app.images.matching(identifier: "PXGGridLayout-Info").matching(
      NSPredicate(format: "label BEGINSWITH %@", "Photo,")
    ).firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 15), app.debugDescription)
    // Photos exposes the visible tile as an image without an XCTest hit point.
    // Tap the center of that observed tile, then verify the actual attachment.
    XCTAssertTrue(app.frame.contains(photo.frame), app.debugDescription)
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(
      app.staticTexts["Receipt photo attached"].waitForExistence(timeout: 15), app.debugDescription)
    let read = app.buttons["Read receipt on this iPhone"]
    reveal(read, in: app)
    read.tap()
    let useAmount = app.buttons["Use amount: $17.35"]
    reveal(useAmount, in: app)
    useAmount.tap()
    app.navigationBars["Add expense"].buttons["Save"].tap()
    app.tabBars.buttons["Money"].tap()
    XCTAssertTrue(app.staticTexts["Native UI receipt"].waitForExistence(timeout: 10))
    app.staticTexts["Native UI receipt"].tap()
    XCTAssertTrue(app.staticTexts["$17.35"].exists)
    app.buttons["View private receipt"].tap()
    XCTAssertTrue(app.navigationBars["Private receipt"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.images["Your expense receipt"].waitForExistence(timeout: 10))
  }
  func test03MealRepairDetailsAndDuplicateReview() throws {
    let app = open()
    newExpense("Native UI meal", amount: "24.50", in: app)
    choose("Meals & food", picker: "expense.category", in: app)
    choose("Business", picker: "expense.classification", in: app)
    let mealDetails = app.buttons["Business & vehicle details"]
    reveal(mealDetails, in: app)
    mealDetails.tap()
    enter("Driver business meeting", into: multiline("expense.purpose", in: app), in: app)
    enter("Driver and bookkeeper", into: multiline("expense.mealContext", in: app), in: app)
    app.navigationBars["Add expense"].buttons["Save"].tap()
    XCTAssertTrue(app.buttons["Add expense"].waitForExistence(timeout: 10))

    newExpense("Native UI garage", amount: "245.67", in: app)
    choose("Vehicle repairs", picker: "expense.category", in: app)
    choose("Business", picker: "expense.classification", in: app)
    let repairDetails = app.buttons["Business & vehicle details"]
    reveal(repairDetails, in: app)
    repairDetails.tap()
    enter("Brake repair", into: multiline("expense.purpose", in: app), in: app)
    enter("75", into: app.textFields["Business use % (optional)"], in: app)
    enter("Driver car", into: app.textFields["Vehicle (optional)"], in: app)
    enter("12345.6", into: app.textFields["Odometer miles (optional)"], in: app)
    app.navigationBars["Add expense"].buttons["Save"].tap()
    XCTAssertTrue(app.buttons["Add expense"].waitForExistence(timeout: 10))

    app.terminate()
    app.launch()
    app.tabBars.buttons["Money"].tap()
    app.staticTexts["Native UI garage"].tap()
    XCTAssertTrue(
      app.staticTexts["Vehicle, Driver car"].waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertTrue(app.staticTexts["Recorded business use, 75%"].exists, app.debugDescription)
    XCTAssertTrue(app.staticTexts["Odometer, 12,345.6 mi"].exists, app.debugDescription)
    app.navigationBars.buttons.firstMatch.tap()
    app.staticTexts["Native UI meal"].tap()
    XCTAssertTrue(
      app.staticTexts["Meal / travel context, Driver and bookkeeper"].waitForExistence(timeout: 10),
      app.debugDescription)
    app.navigationBars.buttons.firstMatch.tap()
    app.buttons["Spending & review"].tap()
    XCTAssertTrue(
      app.staticTexts["Meals & food, $24.50"].waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertTrue(app.staticTexts["Vehicle repairs, $245.67"].exists, app.debugDescription)

    newExpense("Native UI garage", amount: "245.67", in: app)
    app.navigationBars["Add expense"].buttons["Save"].tap()
    XCTAssertTrue(
      app.buttons["Save another expense"].waitForExistence(timeout: 10), app.debugDescription)
    // Leave the warning unconfirmed; the app-container audit must find only one payment.
    app.terminate()
    app.launch()
    app.tabBars.buttons["Money"].tap()
    XCTAssertTrue(app.staticTexts["Native UI garage"].waitForExistence(timeout: 10))
  }
}
