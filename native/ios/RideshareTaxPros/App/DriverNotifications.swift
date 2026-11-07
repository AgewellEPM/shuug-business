import Combine
import CoreLocation
import DriverCore
import UIKit
import UserNotifications

@MainActor final class DriverNotifications: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
  @Published private(set) var status = "Enable notifications to answer trip alerts."
  private weak var model: DriverModel?
  private weak var tracker: LocationTracker?
  private let center = UNUserNotificationCenter.current()
  private var posted = Set<UUID>()
  var onDriveAction: (() -> Void)?

  func attach(_ model: DriverModel, tracker: LocationTracker) {
    self.model = model; self.tracker = tracker
    center.delegate = self
    func button(_ action: DriverAlertAction, _ title: String) -> UNNotificationAction {
      UNNotificationAction(identifier: action.rawValue, title: title, options: [])
    }
    let open = UNNotificationAction(identifier: "openApp", title: "Open Gig Tax Pros", options: [.foreground])
    let amount = UNTextInputNotificationAction(identifier: DriverAlertAction.logExpense.rawValue,
      title: "Log amount", options: [.authenticationRequired], textInputButtonTitle: "Save",
      textInputPlaceholder: "12.34")
    let fare = UNTextInputNotificationAction(identifier: DriverAlertAction.tripFare.rawValue,
      title: "Add earnings", options: [.authenticationRequired], textInputButtonTitle: "Save",
      textInputPlaceholder: "fare=20 fees=3")
    center.setNotificationCategories([
      UNNotificationCategory(identifier: DriverAlertKind.startTrip.rawValue,
        actions: [button(.startTrip, "Yes, start trip"), button(.dismiss, "Not now")], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: DriverAlertKind.endTrip.rawValue,
        actions: [button(.endTrip, "Yes, end trip"), button(.keepRecording, "Keep recording")], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: DriverAlertKind.classifyTrip.rawValue,
        actions: [button(.business, "Business"), button(.personal, "Personal"), button(.dismiss, "Review later")], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: DriverAlertKind.tripFare.rawValue,
        actions: [fare, button(.dismiss, "Later")], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: DriverAlertKind.expense.rawValue,
        actions: [amount, button(.dismiss, "Not a purchase"), open], intentIdentifiers: [], options: []),
      UNNotificationCategory(identifier: "gig.status", actions: [open], intentIdentifiers: [], options: [])
      ,UNNotificationCategory(identifier: "gig.offer", actions: [
        UNNotificationAction(identifier: "confirmOffer", title: "Confirm & save comparison", options: [.authenticationRequired]), open,
        UNNotificationAction(identifier: "dismissOffer", title: "Dismiss", options: [])], intentIdentifiers: [], options: [])
      ,UNNotificationCategory(identifier: "gig.offer.review", actions: [open,
        UNNotificationAction(identifier: "dismissOffer", title: "Dismiss", options: [])], intentIdentifiers: [], options: [])
    ])
  }

  func requestPermission() async {
    do {
      let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
      status = granted ? "Trip and expense actions are available in expanded alerts." : "Notifications are off. Enable them in iPhone Settings."
    } catch { status = "Notifications could not be enabled. Check iPhone Settings." }
  }

  func offerStart() {
    publish(.startTrip, title: "Start a new trip?",
      body: "Driving detected. When safely parked, expand this alert and choose Yes. Mileage starts when you confirm.")
  }
  func offerEnd() {
    guard let id = model?.journal.activeTripId else { return }
    publish(.endTrip, tripId: id, title: "Have you finished this trip?",
      body: "You appear to be parked. End and save the drive here, or keep recording.")
  }
  func offerExpense(_ prompt: ExpensePrompt) {
    publish(.expense, promptId: prompt.id, title: "Purchase near \(prompt.merchant)?",
      body: "Choose Log amount to save it from this alert, or Not a purchase. Receipt capture remains available in the app.")
  }
  func cancelEndWhenMoving() {
    guard let model, let id = model.journal.activeTripId,
      model.journal.driverAlerts?.contains(where: { $0.kind == .endTrip && $0.tripId == id && $0.handledAt == nil }) == true else { return }
    var cancelled: [UUID] = []
    if model.commit({ cancelled = $0.cancelEndTripAlerts(scope: model.journalScope, tripId: id) }) {
      let ids = cancelled.map(\.uuidString)
      center.removeDeliveredNotifications(withIdentifiers: ids)
      center.removePendingNotificationRequests(withIdentifiers: ids)
    }
  }

  private func publish(_ kind: DriverAlertKind, tripId: UUID? = nil, promptId: UUID? = nil,
                       title: String, body: String) {
    guard let model else { return }
    let scope = model.journalScope
    var alert: DriverAlert?
    guard model.commit({ alert = $0.prepareDriverAlert(kind: kind, scope: scope, tripId: tripId, promptId: promptId) }),
      let alert, !posted.contains(alert.id) else { return }
    posted.insert(alert.id)
    let content = UNMutableNotificationContent()
    content.title = title; content.body = body; content.sound = .default
    content.categoryIdentifier = kind.rawValue; content.threadIdentifier = "gig-tax-pros"
    content.userInfo = ["driverAlert": alert.id.uuidString, "scope": scope]
    Task {
      do {
        try await center.add(UNNotificationRequest(identifier: alert.id.uuidString, content: content, trigger: nil))
        status = "Trip and expense alerts are ready. Expand an alert to answer."
      } catch { posted.remove(alert.id); status = "This alert could not be delivered. Open the app to check notification access." }
    }
  }

  func perform(_ id: UUID, action: DriverAlertAction, scope: String, text: String? = nil) async throws -> DriverAlertResult {
    guard let model, model.storageHealthy else { throw DriverAlertError.unavailable }
    guard scope == model.journalScope else { throw DriverAlertError.wrongAccount }
    if action == .startTrip {
      guard await tracker?.canStartFromAlert() == true else {
        throw WorkspaceError.message("Allow Always location access in iPhone Settings before starting a drive from a background alert.")
      }
      guard scope == model.journalScope else { throw DriverAlertError.wrongAccount }
    }
    var next = model.journal
    let result = try next.applyDriverAlert(id, action: action, scope: scope, text: text)
    if result == .alreadyHandled { return result }
    guard model.commit({ $0 = next }) else { throw DriverAlertError.unavailable }
    center.removeDeliveredNotifications(withIdentifiers: [id.uuidString])
    switch result {
    case .started:
      tracker?.reconcileAfterAlert(); onDriveAction?()
      sendStatus("Trip recording started", "Your drive is saved as it records. Review any mileage before the confirmation tap.")
    case .ended(let tripId):
      tracker?.reconcileAfterAlert(); onDriveAction?()
      publish(.classifyTrip, tripId: tripId, title: "Drive saved. Business or personal?",
        body: "Classify this completed drive directly from this alert. Your route stays on the phone.")
    case .classified(let tripId, let classification):
      if classification == .business {
        publish(.tripFare, tripId: tripId, title: "Add this drive’s earnings?",
          body: "Enter fare=20 fees=3 using your actual payout and fees. Use 0 only when known. Includes tips in fare.")
      } else { sendStatus("Personal drive saved", "Your classification is recorded.") }
    case .fareSaved:
      sendStatus("Earnings saved", "Your entered fare and fees are saved for this drive.")
    case .expenseSaved:
      sendStatus("Expense saved for review", "The amount and nearby merchant are saved. Business purpose, classification and receipts can be added later.")
    case .dismissed:
      if action == .keepRecording || next.driverAlerts?.first(where: { $0.id == id })?.kind == .startTrip { onDriveAction?() }
    case .alreadyHandled: break
    }
    Task { await model.sync() }
    return result
  }

  private func sendStatus(_ title: String, _ body: String) {
    let content = UNMutableNotificationContent(); content.title = title; content.body = body
    content.categoryIdentifier = "gig.status"; content.threadIdentifier = "gig-tax-pros"
    Task { try? await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)) }
  }
  func confirmObservedOffer(_ id: UUID, sessionId: UUID, scope: String) throws {
    guard let model, scope == model.journalScope else { throw DriverAlertError.wrongAccount }
    if model.journal.observedOffers?.contains(where: { $0.id == id && $0.comparisonSavedAt != nil }) == true { return }
    guard let session = OfferCaptureStore.session(), session.id == sessionId, session.scope == scope else { throw DriverAlertError.expired }
    let envelope = try OfferCaptureStore.offer(id)
    guard envelope.scope == scope, envelope.sessionId == session.id,
      let comparison = envelope.offer.confirmedComparison(session: session) else { throw DriverAlertError.expired }
    var observed = envelope.offer; observed.comparisonSavedAt = Date()
    guard model.commit({ journal in
      var offers = journal.missionOffers ?? []; offers.append(comparison); journal.missionOffers = Array(offers.suffix(20))
      var observations = journal.observedOffers ?? []; observations.removeAll { $0.id == id }; observations.append(observed)
      journal.observedOffers = Array(observations.suffix(100))
    }) else { throw DriverAlertError.unavailable }
    sendStatus("Comparison saved", "This is an offer estimate. No gig was accepted and no earnings were posted. Check the destination route before deciding.")
  }
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .list, .sound])
  }
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void) {
    let payload = response.notification.request.content.userInfo
    let id = (payload["driverAlert"] as? String).flatMap(UUID.init(uuidString:))
    let scope = payload["scope"] as? String
    let action = DriverAlertAction(rawValue: response.actionIdentifier)
    let text = (response as? UNTextInputNotificationResponse)?.userText
    let observed = (payload["observedOffer"] as? String).flatMap(UUID.init(uuidString:))
    let readerSession = (payload["readerSession"] as? String).flatMap(UUID.init(uuidString:))
    Task { @MainActor [weak self] in
      defer { completionHandler() }
      guard let self else { return }
      if let observed, let readerSession, let scope {
        if response.actionIdentifier == "confirmOffer" {
          do { try self.confirmObservedOffer(observed, sessionId: readerSession, scope: scope) }
          catch { self.sendStatus("Offer needs review", error.localizedDescription) }
        }
        return
      }
      guard let id, let scope else { return }
      if response.actionIdentifier == UNNotificationDefaultActionIdentifier || response.actionIdentifier == "openApp" {
        if scope == self.model?.journalScope,
          let promptId = self.model?.journal.driverAlerts?.first(where: { $0.id == id })?.promptId {
          self.model?.requestedPrompt = self.model?.journal.placePrompts?.first { $0.id == promptId && !$0.dismissed }
        }
        return
      }
      guard let action else { return }
      do { _ = try await self.perform(id, action: action, scope: scope, text: text) }
      catch {
        self.status = error.localizedDescription
        self.sendStatus("Action needs attention", error.localizedDescription)
      }
    }
  }
}
