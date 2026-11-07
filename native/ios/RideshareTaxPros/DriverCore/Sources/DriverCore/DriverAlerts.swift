import Foundation

public enum DriverAlertKind: String, Codable, Sendable {
  case startTrip, endTrip, classifyTrip, tripFare, expense
}
public enum DriverAlertAction: String, Sendable {
  case startTrip, endTrip, keepRecording, dismiss, business, personal, tripFare, logExpense
}
public struct DriverAlert: Codable, Identifiable, Equatable, Sendable {
  public var id: UUID, kind: DriverAlertKind, scope: String
  public var createdAt: Date, expiresAt: Date, handledAt: Date?
  public var tripId: UUID?, promptId: UUID?
  public init(kind: DriverAlertKind, scope: String, tripId: UUID? = nil, promptId: UUID? = nil,
              now: Date = Date()) {
    id = UUID(); self.kind = kind; self.scope = scope; self.tripId = tripId; self.promptId = promptId
    createdAt = now
    expiresAt = now.addingTimeInterval(kind == .startTrip || kind == .endTrip ? 300 : 24 * 3600)
  }
}
public enum DriverAlertResult: Equatable, Sendable {
  case started(UUID), ended(UUID), classified(UUID, TripClassification), fareSaved(UUID), expenseSaved(UUID)
  case dismissed, alreadyHandled
}
public enum DriverAlertError: Error, LocalizedError {
  case unavailable, wrongAccount, expired, changedTrip, invalidAction, invalidAmount, duplicateExpense, conflict
  public var errorDescription: String? {
    switch self {
    case .unavailable: "That alert is no longer available. Your saved records are kept."
    case .wrongAccount: "This alert belongs to a different account. Open the correct account to continue."
    case .expired: "That alert has expired. Your current drive was not changed."
    case .changedTrip: "Your drive changed after this alert. The current drive was not changed."
    case .invalidAction: "This action does not match the alert."
    case .invalidAmount: "Enter an amount such as 12.34. For earnings, enter fare=20 fees=3."
    case .duplicateExpense: "A similar expense already exists. Review it in Money before adding another."
    case .conflict: "This record has a sync conflict. Review both versions in the app."
    }
  }
}

extension Journal {
  /// Reuse a pending alert so frequent GPS fixes do not generate repeated banners.
  public mutating func prepareDriverAlert(kind: DriverAlertKind, scope: String, tripId: UUID? = nil,
                                         promptId: UUID? = nil, now: Date = Date()) -> DriverAlert {
    var rows = (driverAlerts ?? []).filter { now.timeIntervalSince($0.createdAt) < 2 * 24 * 3600 }
    if let existing = rows.first(where: {
      $0.kind == kind && $0.scope == scope && $0.tripId == tripId && $0.promptId == promptId
        && $0.handledAt == nil && $0.expiresAt > now
    }) { return existing }
    let alert = DriverAlert(kind: kind, scope: scope, tripId: tripId, promptId: promptId, now: now)
    rows.append(alert); driverAlerts = Array(rows.suffix(100)); return alert
  }

  /// An alert and its journal edit are committed together. Replay, a changed
  /// account or an old end-trip button cannot mutate a later drive.
  public mutating func applyDriverAlert(_ id: UUID, action: DriverAlertAction, scope: String,
                                       text: String? = nil, now: Date = Date()) throws -> DriverAlertResult {
    guard let index = driverAlerts?.firstIndex(where: { $0.id == id }), let alert = driverAlerts?[index] else {
      throw DriverAlertError.unavailable
    }
    guard alert.scope == scope else { throw DriverAlertError.wrongAccount }
    if alert.handledAt != nil { return .alreadyHandled }
    guard now >= alert.createdAt.addingTimeInterval(-5), now <= alert.expiresAt else { throw DriverAlertError.expired }
    let result: DriverAlertResult
    switch action {
    case .dismiss:
      if alert.kind == .expense, let promptId = alert.promptId,
        let p = placePrompts?.firstIndex(where: { $0.id == promptId }) { placePrompts?[p].dismissed = true }
      result = .dismissed
    case .keepRecording:
      guard alert.kind == .endTrip, activeTripId == alert.tripId else { throw DriverAlertError.changedTrip }
      result = .dismissed
    case .startTrip:
      guard alert.kind == .startTrip else { throw DriverAlertError.invalidAction }
      guard activeTripId == nil, let id = beginTrip(classification: .unclassified, purpose: "Drive started from alert", now: now) else {
        throw DriverAlertError.changedTrip
      }
      // Movement was detected before the tap; no earlier mileage is invented.
      markLocationGap(); result = .started(id)
    case .endTrip:
      guard alert.kind == .endTrip else { throw DriverAlertError.invalidAction }
      guard let id = alert.tripId, activeTripId == id else { throw DriverAlertError.changedTrip }
      finishTrip(now: now); result = .ended(id)
    case .business, .personal, .tripFare:
      guard (action == .tripFare ? alert.kind == .tripFare : alert.kind == .classifyTrip),
        let id = alert.tripId, let entry = entries.first(where: { $0.id == id && !$0.record.deleted }),
        case .trip(var trip) = entry.record.payload, trip.endedAt != nil else { throw DriverAlertError.changedTrip }
      guard entry.conflict == nil else { throw DriverAlertError.conflict }
      if action == .tripFare {
        let fields = (text ?? "").lowercased().split(whereSeparator: { $0.isWhitespace })
        guard fields.count == 2, fields[0].hasPrefix("fare="), fields[1].hasPrefix("fees="),
          let fare = StatementImport.signedCents(String(fields[0].dropFirst(5))), fare >= 0,
          let fees = StatementImport.signedCents(String(fields[1].dropFirst(5))), fees >= 0 else {
          throw DriverAlertError.invalidAmount
        }
        trip.earningsCents = fare; trip.platformFeesCents = fees; result = .fareSaved(id)
      } else {
        trip.classification = action == .business ? .business : .personal
        result = .classified(id, trip.classification)
      }
      var record = entry.record; record.payload = .trip(trip); upsert(record)
    case .logExpense:
      guard alert.kind == .expense, let prompt = placePrompts?.first(where: { $0.id == alert.promptId && !$0.dismissed }) else {
        throw DriverAlertError.unavailable
      }
      guard let cents = StatementImport.signedCents(text ?? ""), cents > 0 else { throw DriverAlertError.invalidAmount }
      let date = DriverRecord.day(prompt.detectedAt)
      guard !visible.contains(where: {
        if case .expense(let expense) = $0.record.payload {
          return expense.date == date && expense.amountCents == cents && expense.merchant.caseInsensitiveCompare(prompt.merchant) == .orderedSame
        }
        return false
      }) else { throw DriverAlertError.duplicateExpense }
      var expense = Expense(date: date, merchant: prompt.merchant, category: prompt.category,
                            amountCents: cents, classification: .unclassified)
      expense.place = prompt.address
      let record = DriverRecord(payload: .expense(expense)); upsert(record)
      if let p = placePrompts?.firstIndex(where: { $0.id == prompt.id }) { placePrompts?[p].dismissed = true }
      result = .expenseSaved(record.id)
    }
    driverAlerts?[index].handledAt = now
    return result
  }

  public mutating func cancelEndTripAlerts(scope: String, tripId: UUID, now: Date = Date()) -> [UUID] {
    var cancelled: [UUID] = []
    for index in (driverAlerts ?? []).indices {
      guard driverAlerts?[index].kind == .endTrip, driverAlerts?[index].scope == scope,
        driverAlerts?[index].tripId == tripId, driverAlerts?[index].handledAt == nil else { continue }
      driverAlerts?[index].handledAt = now
      if let id = driverAlerts?[index].id { cancelled.append(id) }
    }
    return cancelled
  }
}
