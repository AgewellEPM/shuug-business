import XCTest

final class WorkspaceTests: XCTestCase {
    @MainActor
    func testConnectSignInAndSaveProspect() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let origin = environment["SDR_FIXTURE_ORIGIN"],
              let code = environment["SDR_FIXTURE_OWNER_CODE"] else {
            throw XCTSkip("Start a scratch SDR export and supply its origin and owner code.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-sdr.workspaceAddress", ""]
        app.launch()
        XCUIDevice.shared.orientation = .landscapeLeft

        let address = app.textFields["sdr.address"]
        XCTAssertTrue(address.waitForExistence(timeout: 10))
        address.tap()
        address.typeText(origin + "\n")

        let workspace = app.webViews.firstMatch
        let accessCode = workspace.secureTextFields.firstMatch
        XCTAssertTrue(accessCode.waitForExistence(timeout: 15))
        accessCode.tap()
        accessCode.typeText(code)
        workspace.buttons["Sign in"].tap()
        XCTAssertTrue(workspace.buttons["Sign out"].waitForExistence(timeout: 15))

        let researchPane = app.buttons["sdr.toggleSidebar"]
        XCTAssertTrue(researchPane.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["www.linkedin.com"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["sdr.capture"].isEnabled)
        researchPane.tap()

        app.buttons["sdr.prospects"].tap()
        XCTAssertTrue(workspace.staticTexts["Build your prospect list and find the right people to contact."].waitForExistence(timeout: 10))
        XCTAssertTrue(workspace.buttons["Add prospect"].waitForExistence(timeout: 10))
        workspace.buttons["Add prospect"].tap()
        let key = String(UUID().uuidString.prefix(8)).lowercased()
        enter("https://www.linkedin.com/company/ipad-check-" + key,
              in: workspace.textFields["LinkedIn profile or company URL"])
        enter("iPad Prospect " + key, in: workspace.textFields["Person or company name"])
        workspace.buttons["Save prospect"].tap()
        XCTAssertTrue(workspace.staticTexts["iPad Prospect " + key].waitForExistence(timeout: 10))

        let rightPage = app.webViews.element(boundBy: 1)
        app.buttons["sdr.demo"].tap()
        enter(origin + "/sales\n", in: app.textFields["sdr.reference.link"])
        XCTAssertTrue(rightPage.secureTextFields.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(workspace.buttons["Sign out"].exists)

        let campaigns = workspace.descendants(matching: .any).matching(identifier: "Campaigns").firstMatch
        XCTAssertTrue(campaigns.waitForExistence(timeout: 5))
        campaigns.tap()
        XCTAssertTrue(workspace.staticTexts["Plan outreach, prepare drafts, and review the prospects you collect."].waitForExistence(timeout: 10))
        workspace.links.matching(NSPredicate(format: "label BEGINSWITH %@", "Sales materials")).firstMatch.tap()
        XCTAssertTrue(app.buttons["sdr.reference.pdf"].waitForExistence(timeout: 5))
        enter(origin + "/sales\n", in: app.textFields["sdr.reference.link"])
        XCTAssertTrue(rightPage.secureTextFields.firstMatch.waitForExistence(timeout: 10))
        app.buttons["sdr.demo"].tap()
        XCTAssertTrue(rightPage.secureTextFields.firstMatch.waitForExistence(timeout: 10))
        researchPane.tap()
        XCTAssertTrue(rightPage.secureTextFields.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertEqual(researchPane.label, "Show right pane")

        XCUIDevice.shared.orientation = .portrait
        let linkedIn = app.buttons["sdr.linkedin"]
        linkedIn.tap()
        XCTAssertTrue(app.staticTexts["www.linkedin.com"].waitForExistence(timeout: 10))
        app.buttons["sdr.prospects"].tap()
        XCTAssertTrue(workspace.staticTexts["iPad Prospect " + key].waitForExistence(timeout: 10))
    }

    @MainActor
    private func enter(_ value: String, in field: XCUIElement) {
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText(value)
    }
}
