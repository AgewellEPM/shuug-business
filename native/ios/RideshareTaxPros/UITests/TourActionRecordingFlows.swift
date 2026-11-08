import XCTest

/// One live app session, recorded action by action. The host starts a clip
/// before acknowledging each step; no app restart or manufactured still frame.
@MainActor final class TourActionRecordingFlows: ScreenCatalogBase {
  private let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ActionTour")
  private var current = "", started = Date()
  private let rehearsalID = UUID().uuidString
  private var events: [[String: Any]] = []
  private var finishedEarly = false
  override func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<36 {
      if element.exists {
        let footer = app.buttons["guide.back"].exists ? app.buttons["guide.back"] : app.buttons["guide.next"]
        let tab = app.tabBars.firstMatch
        let lower = footer.exists ? footer.frame.minY - 10 : tab.exists && tab.isHittable ? tab.frame.minY - 12 : app.frame.maxY - 40
        let navigation = app.navigationBars.firstMatch
        let upper = navigation.exists ? navigation.frame.maxY + 4 : 64
        let header = ["dashboard.menu", "dashboard.coach", "guide.next", "guide.back", "guide.done", "guide.close"].contains(element.identifier)
        if element.isHittable && (header || element.frame.midY > upper && element.frame.midY < lower) { return }
        if element.frame.midY <= upper { scroll(app, down: false); continue }
      }
      scroll(app)
    }
    XCTAssertTrue(element.exists && element.isHittable, app.debugDescription)
  }
  override func scroll(_ app: XCUIApplication, down: Bool = true) {
    let keyboard = app.keyboards.firstMatch
    let startY = min(app.frame.height * 0.78, keyboard.exists ? keyboard.frame.minY - 20 : app.frame.height * 0.78)
    let endY = max(90, startY - 130)
    let x = app.frame.width > app.frame.height ? 0.30 : 0.08
    let from = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: down ? startY / app.frame.height : endY / app.frame.height))
    let to = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: down ? endY / app.frame.height : startY / app.frame.height))
    from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.15)
  }
  private func write(_ value: [String: Any], _ file: String) {
    try! FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: directory.appendingPathComponent(file), options: .atomic)
  }
  private func step(_ id: String, _ body: () -> Void) {
    if finishedEarly { return }
    current = id; events = []
    write(["id": id, "state": "ready", "rehearsalID": rehearsalID], "ready.json")
    let ack = directory.appendingPathComponent("ack-\(id).json")
    let deadline = Date().addingTimeInterval(120)
    while !FileManager.default.fileExists(atPath: ack.path) && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
    XCTAssertTrue(FileManager.default.fileExists(atPath: ack.path), "Host did not start recording \(id)")
    let config = try! JSONSerialization.jsonObject(with: Data(contentsOf: ack)) as! [String: Any]
    if config["skipBody"] as? Bool == true {
      write(["id": id, "state": "done", "events": [], "elapsed": 0], "done-\(id).json")
      finishedEarly = config["last"] as? Bool ?? false
      return
    }
    started = Date(); Thread.sleep(forTimeInterval: 0.55)
    body()
    let minimum = config["duration"] as! Double
    Thread.sleep(forTimeInterval: max(0.8, minimum - Date().timeIntervalSince(started)))
    write(["id": id, "state": "done", "events": events, "elapsed": Date().timeIntervalSince(started)], "done-\(id).json")
    finishedEarly = config["last"] as? Bool ?? false
  }
  private func touch(_ element: XCUIElement, app: XCUIApplication) {
    if !element.exists { reveal(element, in: app) }
    let navigation = app.navigationBars.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", element.identifier, element.label))
    let tab = app.tabBars.firstMatch
    let isTab = tab.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", element.identifier, element.label)).count > 0
    let footer = app.buttons["guide.next"].exists ? app.buttons["guide.next"] : app.buttons["guide.done"]
    let fixed = ["dashboard.menu", "dashboard.coach", "guide.next", "guide.back", "guide.done", "guide.keyboard.done", "entry.dismissKeyboard", "expense.dismissKeyboard", "reputation.dismissKeyboard", "mission.dismissKeyboard", "help.dismissKeyboard", "Return"].contains(element.identifier)
    let visible = element.exists && element.isHittable && element.frame.midY >= 0 && element.frame.midY < app.frame.height
    if !(visible && (fixed || navigation.count > 0 || isTab || !footer.exists || element.frame.midY < footer.frame.minY - 8)) { reveal(element, in: app) }
    XCTAssertTrue(element.isEnabled, "Control is not ready: \(element.identifier)")
    let frame = element.frame, before = Date().timeIntervalSince(started)
    let bounds = app.windows.firstMatch.frame
    element.tap()
    events.append(["kind": "tap", "start": before, "end": Date().timeIntervalSince(started),
      "x": frame.midX / bounds.width, "y": frame.midY / bounds.height])
  }
  private func button(_ id: String, _ app: XCUIApplication) { touch(app.buttons[id].firstMatch, app: app) }
  private func type(_ id: String, _ text: String, _ app: XCUIApplication) {
    if app.keyboards.firstMatch.exists {
      let dismissIDs = ["entry.dismissKeyboard", "expense.dismissKeyboard", "guide.keyboard.done", "reputation.dismissKeyboard", "mission.dismissKeyboard", "help.dismissKeyboard"]
      if let dismiss = dismissIDs.map({ app.buttons[$0] }).first(where: { $0.exists && $0.isHittable }) {
        touch(dismiss, app: app)
      }
    }
    let field = app.textFields[id].firstMatch
    touch(field, app: app)
    let old = field.value as? String ?? ""
    field.typeText((old == field.placeholderValue ? "" : String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count)) + text)
  }
  private func nav(_ title: String, _ label: String, _ app: XCUIApplication) { touch(app.navigationBars[title].buttons[label].firstMatch, app: app) }
  func testRecordInteractiveTour() throws {
    let app = XCUIApplication()
    XCUIDevice.shared.orientation = .landscapeLeft
    write(["id": "prepare-session", "state": "ready", "rehearsalID": rehearsalID], "ready.json")
    let prepared = directory.appendingPathComponent("prepare-ack.json")
    let deadline = Date().addingTimeInterval(120)
    while !FileManager.default.fileExists(atPath: prepared.path) && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
    XCTAssertTrue(FileManager.default.fileExists(atPath: prepared.path), "Host did not prepare the practice journal")
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-gettingStartedSeen", "YES", "-tourRecordingSession", rehearsalID]
    app.launch(); XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 20))
    step("home-menu") { self.button("dashboard.menu", app) }
    step("home-trips") { self.button("Trips", app) }
    step("trip-add") { self.button("Add manual trip", app) }
    step("trip-miles") { self.type("Miles", "12.4", app) }
    step("trip-purpose") { self.type("Purpose", "Practice airport run", app); self.button("entry.dismissKeyboard", app) }
    step("trip-business") { self.button("trip.classification", app); self.button("Business", app) }
    step("trip-fare") { self.type("trip.fare", "30.00", app) }
    step("trip-fees") { self.type("trip.fees", "5.00", app); self.button("entry.dismissKeyboard", app) }
    step("trip-save") { self.nav("Manual trip", "Save", app); XCTAssertTrue(app.staticTexts["Practice airport run"].waitForExistence(timeout: 10)) }
    step("money-home") { self.button("tools.close", app) }
    step("money-expense") { self.button("quick.expense", app) }
    step("money-merchant") { self.type("Merchant", "Practice fuel stop", app) }
    step("money-amount") { self.type("Amount · USD (12.34)", "24.80", app); self.button("expense.dismissKeyboard", app) }
    step("money-category") { self.button("expense.category", app); self.button("Fuel", app) }
    step("money-business") { self.button("expense.classification", app); self.button("Business", app) }
    step("money-save") { self.nav("Add expense", "Save", app) }
    step("offers-open") { self.touch(app.tabBars.buttons["Offers"], app: app) }
    step("guide-open") { self.button("screenshot.guide", app) }
    step("guide-volume") { self.button("guide.hardware.first", app) }
    step("guide-side") { self.button("guide.hardware.side", app); self.button("guide.next", app) }
    step("guide-save-menu") { self.button("guide.save.menu", app) }
    step("guide-save-photo") { self.button("guide.save.photo", app); self.button("guide.next", app) }
    step("guide-choose-route") { self.button("guide.route.picker", app) }
    step("guide-choose-picture") { self.button("guide.photo", app); self.button("guide.next", app) }
    step("review-pay") { self.type("guide.pay", "9.50", app); self.button("guide.keyboard.done", app) }
    step("review-check") { self.button("guide.next", app); XCTAssertEqual(app.staticTexts["guide.result.net"].label, "$8.70") }
    step("review-finish") { self.button("guide.done", app) }
    step("earnings-open") { self.touch(app.tabBars.buttons["Earnings"], app: app) }
    step("earnings-goals") { self.button("insights.goals", app) }
    step("earnings-cost") { self.type("goals.cost", "0.50", app) }
    step("earnings-hourly") { self.type("goals.hourly", "20", app); self.button("entry.dismissKeyboard", app) }
    step("earnings-save") { self.nav("Driving goals", "Save", app) }
    step("mission-open") { self.touch(app.tabBars.buttons["Go Home"], app: app) }
    step("mission-goal") { self.type("Net earnings goal ($)", "150", app); if app.buttons["mission.dismissKeyboard"].exists { self.button("mission.dismissKeyboard", app) } else { app.swipeDown() } }
    step("mission-save") { self.button("mission.save", app) }
    step("position-open") { self.touch(app.tabBars.buttons["Position"], app: app) }
    step("position-destination") {
      self.type("Destination address or place", "West Hartford", app)
      if app.keyboards.buttons["Return"].exists { self.touch(app.keyboards.buttons["Return"], app: app) }
      else { app.swipeDown() }
    }
    step("coach-home") {
      self.touch(app.tabBars.buttons["Home"], app: app)
      let hourly = app.descendants(matching: .any).matching(identifier: "dashboard.hourly").firstMatch
      self.reveal(hourly, in: app)
      XCTAssertTrue(hourly.label.contains("—"), "A trip without a full minute of recorded time must not show an hourly rate: \(hourly.label)")
    }
    step("coach-open") { self.button("dashboard.coach", app) }
    step("coach-details") { self.button("coach.intake", app) }
    step("coach-close") { self.nav("Tax details", "Cancel", app); self.button("tools.close", app) }
    step("ratings-menu") { self.button("dashboard.menu", app); self.button("Ratings & reviews", app) }
    step("ratings-add") { self.button("reputation.addRating", app) }
    step("ratings-score") { self.type("reputation.score", "4.9", app); self.button("reputation.dismissKeyboard", app) }
    step("ratings-save") { self.button("reputation.saveRating", app); self.button("tools.close", app) }
    step("account-menu") { self.button("dashboard.menu", app); self.button("Account", app) }
    step("account-address") { self.button("Use an address supplied by my firm", app) }
    step("account-privacy") { self.button("App privacy & data", app) }
    step("account-close") {
      self.touch(app.navigationBars["App privacy & data"].buttons.firstMatch, app: app)
      self.button("tools.close", app)
    }
    step("help-open") { self.button("help.open", app) }
    step("help-zip") { self.type("help.zip", "10001", app); self.button("help.dismissKeyboard", app) }
    step("help-search") { self.button("help.search", app) }
    step("finish-home") { self.touch(app.navigationBars["Get help"].buttons.firstMatch, app: app) }
    step("finish-sample") { self.button("dashboard.sample", app) }
    write(["state": "complete"], "complete.json")
  }
}
