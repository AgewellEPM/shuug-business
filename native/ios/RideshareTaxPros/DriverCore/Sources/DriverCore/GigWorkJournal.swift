import Foundation

extension Journal {
  /// Records what the driver reports doing in the provider app. This never
  /// dispatches provider actions, starts GPS or books an estimated payout.
  public mutating func recordGigDecision(_ choice: GigDriverChoice, offerId: UUID, now: Date = Date()) throws {
    var work = gigCommitments ?? []
    let index = work.firstIndex { $0.offerId == offerId }
    var offer = gigOffers?.first(where: { $0.id == offerId })
    if offer == nil, let index, [.started, .completed, .canceled].contains(choice) {
      // The bounded offer inbox can age out an accepted job. Its separate
      // commitment must remain closable without recreating an offer or income.
      var archived = UniversalGigOffer(platform: work[index].platform, source: .manual, receivedAt: work[index].startsAt)
      archived.offerId = offerId; offer = archived
    }
    guard let offer, offer.source != .simulation else { throw GigDispatchError.invalidInput }
    switch choice {
    case .acceptedInProvider:
      if index == nil {
        // Even stale offers may describe a job the driver already accepted.
        // Unknown completion time blocks competing work until explicitly ended.
        work.append(GigConfirmedWork(offerId: offer.id, platform: offer.platform, startsAt: now,
          expectedEnd: nil, verification: "Driver reported acceptance in provider app"))
      }
    case .started, .completed, .canceled:
      guard let index else { throw GigDispatchError.invalidInput }
      let next: GigCommitmentState = choice == .started ? .inProgress : choice == .completed ? .completed : .canceled
      guard [.accepted, .inProgress].contains(work[index].state) || work[index].state == next else {
        throw GigDispatchError.invalidInput
      }
      work[index].state = next
      if next == .completed || next == .canceled { work[index].expectedEnd = now }
    case .declinedInProvider:
      guard index == nil else { throw GigDispatchError.invalidInput }
    case .consider, .skipAdvice: break
    }
    gigCommitments = work
    gigDecisions = DriverDecisionService.record(choice, offer: offer, existing: gigDecisions ?? [], now: now)
  }
}
