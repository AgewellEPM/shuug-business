import DriverCore
import Foundation

extension DriverModel {
  var offerProfitProfile: GigProfitProfile {
    let goals = journal.goals ?? DriverGoals()
    let rate = goals.vehicleCostCentsPerMile.flatMap(GigMoneyMath.decimal)
    let percent = journal.reserveSettings?.taxPercent ?? 0
    return GigProfitProfile(vehicleCostCentsPerMile: rate, minimumNetHourlyCents: goals.targetHourlyCents ?? 0,
      taxReserveBasisPoints: percent.isFinite && (0...100).contains(percent) ? Int((percent * 100).rounded()) : -1)
  }
  func refreshCapturedOffers(now: Date = Date()) {
    guard storageHealthy else { return }
    let captured = OfferCaptureStore.offers(scope: journalScope)
    var service = OfferIngestionService(offers: journal.gigOffers ?? [], logs: journal.gigOfferLogs ?? [])
    let previous = service.offers.map { $0.availabilityStatus }
    var imported = Set<String>()
    for envelope in captured where envelope.reviewedInApp != true {
      let key = journalScope + "|" + envelope.offer.id.uuidString
      guard !importedCaptureIDs.contains(key) else { continue }
      do { try service.ingest(envelope.normalizedOffer, now: now); imported.insert(key) }
      catch { message = "An offer contained invalid fields. Review the source and enter it again." }
    }
    service.expire(now: now)
    guard !imported.isEmpty || previous != service.offers.map({ $0.availabilityStatus }) else { return }
    if commit({ $0.gigOffers = service.offers; $0.gigOfferLogs = service.logs }) {
      importedCaptureIDs.formUnion(imported)
      if importedCaptureIDs.count > 500 { importedCaptureIDs = Set(captured.map { journalScope + "|" + $0.offer.id.uuidString }) }
    }
  }
  func saveOffer(_ offer: UniversalGigOffer) -> Bool {
    commit { journal in
      var values = journal.gigOffers ?? []
      if let index = values.firstIndex(where: { $0.id == offer.id }) { values[index] = offer }
      else { values.append(offer) }
      journal.gigOffers = Array(values.suffix(200))
    }
  }
  @discardableResult func decide(_ choice: GigDriverChoice, offer: UniversalGigOffer) -> Bool {
    var next = journal
    do { try next.recordGigDecision(choice, offerId: offer.id) }
    catch { message = "This job could not be updated. Reopen the offer in your current account."; return false }
    return commit { $0 = next }
  }
}
