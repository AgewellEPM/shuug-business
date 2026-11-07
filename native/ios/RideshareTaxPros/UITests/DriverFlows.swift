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
  private func navigate(_ destination: String, in app: XCUIApplication) {
    let close = app.buttons["tools.close"]
    if close.exists && close.isHittable { close.tap() }
    let tab = destination == "Today" ? "Home" : destination == "Insights" ? "Earnings" : destination
    if ["Trips", "Money", "Account"].contains(destination) {
      app.tabBars.buttons["Home"].tap()
      app.buttons["dashboard.menu"].tap()
      app.buttons[destination].firstMatch.tap()
    } else { app.tabBars.buttons[tab].tap() }
  }
  private func enter(_ value: String, into field: XCUIElement, in app: XCUIApplication) {
    reveal(field, in: app)
    field.tap()
    field.typeText(value)
    let done = app.buttons["expense.dismissKeyboard"]
    if done.waitForExistence(timeout: 1) { done.tap() }
    else if app.buttons["entry.dismissKeyboard"].exists { app.buttons["entry.dismissKeyboard"].tap() }
    else if app.buttons["mission.dismissKeyboard"].exists { app.buttons["mission.dismissKeyboard"].tap() }
  }
  private func newExpense(_ merchant: String, amount: String, in app: XCUIApplication) {
    navigate("Today", in: app)
    reveal(app.buttons["Add expense"], in: app); app.buttons["Add expense"].tap()
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
    reveal(app.buttons["Start a drive"], in: app); app.buttons["Start a drive"].tap()
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
    navigate("Money", in: app)
    XCTAssertTrue(app.staticTexts["Native UI fuel"].waitForExistence(timeout: 10))
    app.terminate()
    app.launch()
    navigate("Money", in: app)
    XCTAssertTrue(app.staticTexts["Native UI fuel"].waitForExistence(timeout: 10))
    navigate("Trips", in: app)
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
    navigate("Money", in: app)
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
    navigate("Money", in: app)
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
    navigate("Money", in: app)
    XCTAssertTrue(app.staticTexts["Native UI garage"].waitForExistence(timeout: 10))
  }
  func test04InsightsAndBankImport() throws {
    let app = open()
    navigate("Insights", in: app)
    app.buttons["insights.goals"].tap()
    enter("100", into: app.textFields["goals.daily"], in: app)
    enter("500", into: app.textFields["goals.weekly"], in: app)
    enter("25", into: app.textFields["goals.hourly"], in: app)
    enter("0.50", into: app.textFields["goals.cost"], in: app)
    app.navigationBars["Driving goals"].buttons["Save"].tap()
    navigate("Trips", in: app)
    app.buttons["Add manual trip"].tap()
    enter("10", into: app.textFields["Miles"], in: app)
    choose("Business", picker: "trip.classification", in: app)
    enter("Profit UI ride", into: app.textFields["Purpose"], in: app)
    choose("Passenger ride", picker: "trip.role", in: app)
    enter("20", into: app.textFields["trip.fare"], in: app)
    enter("3", into: app.textFields["trip.fees"], in: app)
    enter("Uber", into: app.textFields["trip.platform"], in: app)
    enter("Fixture downtown", into: app.textFields["trip.area"], in: app)
    app.navigationBars["Manual trip"].buttons["Save"].tap()
    app.staticTexts["Profit UI ride"].tap()
    let net = app.staticTexts["trip.estimatedNet"]
    reveal(net, in: app)
    XCTAssertTrue(net.label.contains("$12.00"), app.debugDescription)
    navigate("Insights", in: app)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "$12.00 / $100.00")).firstMatch.waitForExistence(timeout: 10), app.debugDescription)

    navigate("Money", in: app)
    app.buttons["Banks & statement imports"].tap()
    app.buttons["Import a bank statement"].tap()
    enter("Fixture checking", into: app.textFields["bank.accountLabel"], in: app)
    app.buttons["Choose statement file"].tap()
    let fixture = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "RTPBankFixture")).firstMatch
    if !fixture.waitForExistence(timeout: 5) {
      if app.buttons["Browse"].exists { app.buttons["Browse"].firstMatch.tap() }
      let onPhone = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "On My iPhone")).firstMatch
      if onPhone.waitForExistence(timeout: 5) { onPhone.tap() }
      let folder = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Gig Tax Pros")).firstMatch
      if folder.waitForExistence(timeout: 5) { folder.tap() }
    }
    XCTAssertTrue(fixture.waitForExistence(timeout: 15), app.debugDescription)
    fixture.tap()
    let preview = app.buttons["bank.preview"]
    XCTAssertTrue(preview.waitForExistence(timeout: 10), app.debugDescription); preview.tap()
    let importing = app.buttons["bank.import"]
    reveal(importing, in: app); importing.tap()
    let fuel = app.staticTexts["Fixture Shell"]
    XCTAssertTrue(fuel.waitForExistence(timeout: 10), app.debugDescription); fuel.tap()
    app.buttons["Create expense from this transaction"].tap()
    XCTAssertEqual(app.textFields["Merchant"].value as? String, "Fixture Shell")
    XCTAssertEqual(app.textFields["Amount · USD (12.34)"].value as? String, "17.35")
    choose("Business", picker: "expense.classification", in: app)
    app.navigationBars["Add expense"].buttons["Save"].tap()
    XCTAssertTrue(app.buttons["Open saved record"].waitForExistence(timeout: 10), app.debugDescription)
    app.terminate(); app.launch()
    navigate("Money", in: app)
    XCTAssertTrue(app.staticTexts["Fixture Shell"].waitForExistence(timeout: 10), app.debugDescription)
  }
  func test05MissionAndOffer() throws {
    let app = open()
    navigate("Insights", in: app); app.buttons["insights.goals"].tap()
    enter("25", into: app.textFields["goals.hourly"], in: app)
    enter("0.50", into: app.textFields["goals.cost"], in: app)
    app.navigationBars["Driving goals"].buttons["Save"].tap()
    navigate("Today", in: app)
    navigate("Go Home", in: app)
    let save = app.buttons["mission.save"]
    reveal(save, in: app); save.tap()
    enter("20", into: app.textFields["mission.payout"], in: app)
    enter("3", into: app.textFields["mission.fees"], in: app)
    enter("10", into: app.textFields["mission.miles"], in: app)
    enter("20", into: app.textFields["mission.minutes"], in: app)
    enter("10", into: app.textFields["mission.wait"], in: app)
    let result = app.staticTexts["mission.result"]
    reveal(result, in: app); XCTAssertTrue(result.label.contains("$12.00"), app.debugDescription)
    app.terminate(); app.launch(); navigate("Today", in: app)
    navigate("Go Home", in: app)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Earn $100.00")).firstMatch.waitForExistence(timeout: 10), app.debugDescription)
  }
  func test06ColdStartTripNotificationActions() throws {
    let app = open()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    func sendTripAlert() {
      navigate("Account", in: app)
      app.buttons["Driving & expense reminders"].tap()
      let button = app.buttons["assistance.tripAlert"]
      XCTAssertTrue(button.waitForExistence(timeout: 10), app.debugDescription)
      button.tap()
      let allow = springboard.alerts.buttons["Allow"]
      if allow.waitForExistence(timeout: 4) { allow.tap() }
    }
    func answer(_ title: String, action: String) {
      XCUIDevice.shared.press(.home)
      let cell = springboard.descendants(matching: .any).matching(NSPredicate(format: "identifier == 'NotificationShortLookView' AND label CONTAINS %@", title)).firstMatch
      if !cell.waitForExistence(timeout: 5) {
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.001))
          .press(forDuration: 0.1, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.7)))
      }
      XCTAssertTrue(cell.waitForExistence(timeout: 10), springboard.debugDescription)
      app.terminate()
      if !cell.exists {
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.001))
          .press(forDuration: 0.1, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.7)))
      }
      XCTAssertTrue(cell.waitForExistence(timeout: 10), springboard.debugDescription)
      let initialFrame = cell.frame
      cell.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 1.5)
      let button = springboard.buttons[action]
      if !button.waitForExistence(timeout: 2) {
        // Notification Center may initially show a collapsed stack. The first
        // gesture expands that stack and moves this card; query its new frame
        // before expanding the individual notification. Do not replay a stale
        // coordinate or interpret a delivered banner as an executed action.
        let expandedCard = springboard.descendants(matching: .any).matching(NSPredicate(
          format: "identifier == 'NotificationShortLookView' AND label CONTAINS %@", title)).firstMatch
        XCTAssertTrue(expandedCard.exists, springboard.debugDescription)
        XCTAssertGreaterThan(abs(expandedCard.frame.minY - initialFrame.minY), 8,
          "The first gesture neither exposed actions nor expanded the notification stack.\n" + springboard.debugDescription)
        expandedCard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 1.5)
      }
      XCTAssertTrue(button.waitForExistence(timeout: 10), springboard.debugDescription)
      button.tap()
      XCTAssertNotEqual(app.state, .runningForeground, "A background notification action opened the app UI")
    }
    sendTripAlert()
    answer("Start a new trip?", action: "Yes, start trip")
    app.launch()
    XCTAssertTrue(app.buttons["End drive & save"].waitForExistence(timeout: 15), app.debugDescription)
    sendTripAlert()
    answer("Have you finished this trip?", action: "Yes, end trip")
    app.launch()
    XCTAssertTrue(app.buttons["Start a drive"].waitForExistence(timeout: 15), app.debugDescription)
  }
  func test07ModernDashboardAndExistingTools() throws {
    let app = open()
    XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 15), app.debugDescription)
    for (tab, title) in [("Offers", "Offers"), ("Go Home", "Go Home"), ("Position", "Positioning"), ("Earnings", "Earnings")] {
      navigate(tab, in: app)
      XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10), app.debugDescription)
    }
    navigate("Trips", in: app)
    XCTAssertTrue(app.buttons["Add manual trip"].waitForExistence(timeout: 10), app.debugDescription)
    navigate("Money", in: app)
    XCTAssertTrue(app.buttons["Banks & statement imports"].waitForExistence(timeout: 10), app.debugDescription)
    navigate("Account", in: app)
    XCTAssertTrue(app.navigationBars["Your account"].waitForExistence(timeout: 10), app.debugDescription)
    navigate("Today", in: app)
    XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 10), app.debugDescription)
  }
  func test08SampleChartsAndRankedOffers() throws {
    let app = open()
    navigate("Today", in: app)
    app.buttons["dashboard.menu"].tap()
    app.buttons["Explore a sample shift"].tap()
    let banner = app.descendants(matching: .any).matching(identifier: "sample.banner").firstMatch
    XCTAssertTrue(banner.waitForExistence(timeout: 10), app.debugDescription)
    let tabs = app.segmentedControls["sample.tabs"]
    XCTAssertTrue(tabs.waitForExistence(timeout: 10), app.debugDescription)
    tabs.buttons["Offers"].tap()
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "sample.ranked").firstMatch.waitForExistence(timeout: 10), app.debugDescription)
    let uber = app.descendants(matching: .any).matching(identifier: "offer.card.Uber").firstMatch
    let doorDash = app.descendants(matching: .any).matching(identifier: "offer.card.DoorDash").firstMatch
    XCTAssertTrue(uber.waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertTrue(doorDash.exists, app.debugDescription)
    XCTAssertLessThan(uber.frame.minY, doorDash.frame.minY, "The higher-ranked Uber example should appear before DoorDash.")
    uber.tap()
    XCTAssertTrue(app.staticTexts["Fits your trip home"].firstMatch.waitForExistence(timeout: 10), app.debugDescription)
    app.navigationBars.buttons.element(boundBy: 0).tap()
    tabs.buttons["Earnings"].tap()
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "earnings.trend").firstMatch.waitForExistence(timeout: 10), app.debugDescription)
    app.buttons["sample.close"].tap()
    XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 10), app.debugDescription)
    app.terminate(); app.launch()
    XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertFalse(banner.exists, "Sample mode must not become the driver's default journal after relaunch.")
  }
  func test09ReportedJobSurvivesRelaunchAndCompletes() throws {
    let app = open()
    navigate("Offers", in: app)
    app.buttons["offers.enter"].tap()
    enter("30", into: app.textFields["Quoted payout"], in: app)
    enter("30", into: app.textFields["Guaranteed part of payout"], in: app)
    enter("2", into: app.textFields["Additional costs (0 only if known)"], in: app)
    app.navigationBars["Review offer fields"].buttons["Save"].tap()
    let card = app.descendants(matching: .any).matching(identifier: "offer.card.DoorDash").firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 10), app.debugDescription); card.tap()
    let accepted = app.buttons["work.accepted"]
    reveal(accepted, in: app); accepted.tap()
    app.buttons["Confirm"].tap()
    XCTAssertTrue(app.staticTexts["Accepted · reported by you"].waitForExistence(timeout: 10), app.debugDescription)
    app.terminate(); app.launch(); navigate("Offers", in: app)
    let active = app.descendants(matching: .any).matching(identifier: "work.active").firstMatch
    XCTAssertTrue(active.waitForExistence(timeout: 10), app.debugDescription)
    app.buttons["DoorDash"].firstMatch.tap()
    let completed = app.buttons["work.complete"]
    reveal(completed, in: app); completed.tap(); app.buttons["Confirm"].tap()
    XCTAssertTrue(active.waitForNonExistence(timeout: 10), app.debugDescription)
    app.terminate(); app.launch(); navigate("Offers", in: app)
    XCTAssertFalse(active.exists, "Completed work must stay closed after relaunch")
  }
  func test10CaptureDiagnosticsKeepsPlatformsSeparate() throws {
    let app = open()
    navigate("Offers", in: app)
    app.buttons["offers.diagnostics"].tap()
    XCTAssertTrue(app.navigationBars["Capture diagnostics"].waitForExistence(timeout: 10), app.debugDescription)
    for platform in ["DoorDash", "Uber", "Lyft", "Instacart", "Spark"] {
      let row = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "capture.platform." + platform)).firstMatch
      reveal(row, in: app); row.tap()
      XCTAssertTrue(app.navigationBars[platform + " diagnostics"].waitForExistence(timeout: 10), app.debugDescription)
      XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Not connected · unavailable")).firstMatch.exists, app.debugDescription)
      XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "None saved")).firstMatch.exists, "A sample/manual offer must not count as a capture.\n" + app.debugDescription)
      let evidence = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "No · needs review")).firstMatch
      reveal(evidence, in: app)
      XCTAssertTrue(evidence.exists, app.debugDescription)
      app.navigationBars.buttons.element(boundBy: 0).tap()
    }
  }
  func test11ChosenScreenshotAppearsInOnlyItsPlatformDiagnostics() throws {
    let app = open()
    navigate("Offers", in: app); app.buttons["Read an offer"].tap()
    let enable = app.buttons["Enable reader for this shift"]
    reveal(enable, in: app); enable.tap()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let allow = springboard.alerts.buttons["Allow"]
    if allow.waitForExistence(timeout: 4) { allow.tap() }
    let picker = app.buttons["Choose an offer screenshot"]
    reveal(picker, in: app); picker.tap()
    XCTAssertTrue(app.navigationBars["Photos"].waitForExistence(timeout: 15), app.debugDescription)
    let photo = app.images.matching(identifier: "PXGGridLayout-Info").matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,")).firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 15), app.debugDescription)
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Screenshot read.")).firstMatch.waitForExistence(timeout: 15), app.debugDescription)
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.buttons["offers.diagnostics"].tap()
    app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "capture.platform.DoorDash")).firstMatch.tap()
    let detected = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Captured fields found")).firstMatch
    XCTAssertTrue(detected.waitForExistence(timeout: 10), app.debugDescription)
    let payout = app.staticTexts.matching(NSPredicate(format: "label == %@", "Payout, $19.50")).firstMatch
    reveal(payout, in: app)
    XCTAssertTrue(payout.exists, app.debugDescription)
    let pickup = app.staticTexts.matching(NSPredicate(format: "label == %@", "Pickup miles, 2.00 mi")).firstMatch
    reveal(pickup, in: app); XCTAssertTrue(pickup.exists, app.debugDescription)
    let recommendation = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "No · needs review")).firstMatch
    reveal(recommendation, in: app); XCTAssertTrue(recommendation.exists, app.debugDescription)
    app.terminate(); app.launch(); navigate("Offers", in: app); app.buttons["offers.diagnostics"].tap()
    app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "capture.platform.Uber")).firstMatch.tap()
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "None saved")).firstMatch.exists,
      "A DoorDash capture must not establish Uber detection.\n" + app.debugDescription)
  }
}
