import XCTest

@MainActor final class GettingStartedFlows: XCTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }

  private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
    for _ in 0..<12 {
      if element.exists && element.isHittable { return }
      app.swipeUp()
    }
    XCTAssertTrue(element.exists && element.isHittable, app.debugDescription)
  }

  private func chapterStart(_ chapter: XCUIElement) -> Int {
    let text = chapter.label as NSString
    let pattern = try! NSRegularExpression(pattern: #"(\d+):(\d{2})"#)
    guard let match = pattern.firstMatch(in: text as String, range: NSRange(location: 0, length: text.length)) else {
      XCTFail("Chapter is missing its displayed start time: \(text)"); return 0
    }
    return (Int(text.substring(with: match.range(at: 1))) ?? 0) * 60 + (Int(text.substring(with: match.range(at: 2))) ?? 0)
  }

  private func checkPlayback(in app: XCUIApplication, chapter: String, expectedStart: Int = 0) {
    XCTAssertTrue(app.buttons["tour.player.done"].waitForExistence(timeout: 15), app.debugDescription)
    let rotate = app.descendants(matching: .any)["tour.rotate.player"].firstMatch
    XCTAssertTrue(rotate.waitForExistence(timeout: 5), app.debugDescription)
    XCUIDevice.shared.orientation = .landscapeLeft
    let rotated = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: rotate)
    wait(for: [rotated], timeout: 10)
    let player = app.descendants(matching: .any)["tour.player"].firstMatch
    let pause = app.buttons["Pause"].firstMatch
    // A tap toggles the native controls, so reveal them only when hidden.
    if !pause.exists { player.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)).tap() }
    XCTAssertTrue(pause.waitForExistence(timeout: 15), app.debugDescription)
    // AVKit's disabled volume slider has the same label. Match the actual
    // playback slider's identifier, not XCTest's identifier-or-label shortcut.
    let timeline = app.sliders.matching(NSPredicate(format: "identifier == %@", "Current position")).firstMatch
    XCTAssertTrue(timeline.exists, app.debugDescription)
    let position = timeline.value as? String ?? ""
    print("TOUR_PLAYBACK|\(chapter)|\(position)")
    let elapsedText = (position.components(separatedBy: "elapsed").first ?? "") as NSString
    let elapsedPattern = try! NSRegularExpression(pattern: #"(\d+)\s+(hour|minute|second)"#)
    let matches = elapsedPattern.matches(in: elapsedText as String, range: NSRange(location: 0, length: elapsedText.length))
    let elapsed = matches.reduce(0) { total, match in
      let value = Int(elapsedText.substring(with: match.range(at: 1))) ?? 0
      let unit = elapsedText.substring(with: match.range(at: 2))
      return total + value * (unit == "hour" ? 3600 : unit == "minute" ? 60 : 1)
    }
    XCTAssertFalse(matches.isEmpty, "Playback time is unavailable: \(position)")
    XCTAssertGreaterThan(elapsed, 0, "Video must advance after opening")
    XCTAssertGreaterThanOrEqual(elapsed, expectedStart, "Chapter must seek to its displayed start: \(position)")
    XCTAssertLessThan(elapsed, expectedStart + 30, "Chapter opened at the wrong time: \(position)")
    pause.tap()
    let play = app.buttons["Play"].firstMatch
    XCTAssertTrue(play.waitForExistence(timeout: 5), app.debugDescription)
    let proof = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    proof.name = "Native tour playback - \(chapter)"; proof.lifetime = .keepAlways
    add(proof)
    play.tap()
    XCTAssertTrue(pause.waitForExistence(timeout: 5))
    XCUIDevice.shared.orientation = .portrait
    app.buttons["tour.player.done"].tap()
  }

  func testExistingPreviewPlaybackAndChapterSeeking() throws {
    let app = XCUIApplication()
    XCUIDevice.shared.orientation = .portrait
    defer { XCUIDevice.shared.orientation = .portrait }
    // Show the welcome page without changing an existing user's stored preference.
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-gettingStartedSeen", "NO"]
    app.launch()
    let watch = app.buttons["tour.watch"]
    XCTAssertTrue(watch.waitForExistence(timeout: 15))
    reveal(watch, in: app); watch.tap()
    checkPlayback(in: app, chapter: "start")
    let chapter = app.buttons["tour.chapter.screenshots"]
    reveal(chapter, in: app); let start = chapterStart(chapter); chapter.tap()
    checkPlayback(in: app, chapter: "screenshots", expectedStart: start)
  }

  func testFirstLaunchPlaybackSkipRelaunchAndHelpReplay() throws {
    let app = XCUIApplication()
    XCUIDevice.shared.orientation = .portrait
    defer { XCUIDevice.shared.orientation = .portrait }
    // Exercise the real first-launch preference, without overriding it in argv.
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    app.launch()
    let watch = app.buttons["tour.watch"]
    XCTAssertTrue(watch.waitForExistence(timeout: 15), app.debugDescription)
    XCTAssertTrue(app.descendants(matching: .any)["tour.rotate"].firstMatch.exists)
    reveal(watch, in: app); watch.tap()
    checkPlayback(in: app, chapter: "start")
    app.buttons["tour.skip"].tap()
    XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 10))
    app.terminate(); app.launch()
    XCTAssertTrue(app.buttons["dashboard.menu"].waitForExistence(timeout: 15))
    XCTAssertFalse(watch.exists)

    let help = app.buttons["help.open"]
    reveal(help, in: app); help.tap()
    XCTAssertTrue(app.buttons["help.tour"].waitForExistence(timeout: 10), app.debugDescription)
    app.buttons["help.tour"].tap()
    let chapter = app.buttons["tour.chapter.screenshots"]
    reveal(chapter, in: app); let start = chapterStart(chapter); chapter.tap()
    checkPlayback(in: app, chapter: "screenshots", expectedStart: start)

    let guide = app.buttons["Try the interactive screenshot guide"]
    reveal(guide, in: app); guide.tap()
    XCTAssertTrue(app.buttons["guide.close"].waitForExistence(timeout: 10), app.debugDescription)
    app.buttons["guide.close"].tap()
    app.terminate()
  }
}
