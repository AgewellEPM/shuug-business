import Foundation

/// Deterministic, local examples. Never insert these records into a driver's journal.
public struct GigSampleShift: Sendable {
  public let now: Date, offers: [UniversalGigOffer], routes: [UUID: GigDestinationRoutePlan]
  public let preferences: GigDestinationPreferences, profile: GigProfitProfile
  public let records: [DriverRecord], goals: DriverGoals
  public var recommendations: [GigDispatchRecommendation] {
    DispatchPlanner.rank(offers, profile: profile, preferences: preferences, routes: routes, now: now)
  }
  public static func make(relativeTo date: Date = Date()) throws -> GigSampleShift {
    let calendar = Calendar.current
    let now = calendar.date(bySettingHour: 17, minute: 0, second: 0, of: date)!
    let home = GigOfferLocation(label: "Home · West Hartford", latitude: 41.762, longitude: -72.743)
    let preferences = GigDestinationPreferences(destination: home, arrivalDeadline: now.addingTimeInterval(3600),
      maximumAdditionalMiles: 12, maximumAdditionalMinutes: 35)
    let profile = GigProfitProfile(vehicleCostCentsPerMile: 50, minimumNetHourlyCents: 2000, taxReserveBasisPoints: 1500)
    let goals = DriverGoals(dailyNetCents: 15000, weeklyNetCents: 75000, targetHourlyCents: 2000, vehicleCostCentsPerMile: 50)
    // All units, pay guarantees, fees and wait assumptions are explicit fixture inputs.
    let examples: [(GigPlatform, Int, Double, Double, Double, Double, Double, Double, Double)] = [
      (.doorDash, 2400, 1, 6, 8, 17, 5, 8, 15),
      (.uber, 2800, 2, 7, 8, 22, 4, 6, 14),
      (.spark, 3800, 4, 14, 12, 55, 10, 18, 30),
      (.instacart, 400, 3, 10, 10, 30, 10, 12, 20)
    ]
    var ingestion = OfferIngestionService(), routes: [UUID: GigDestinationRoutePlan] = [:]
    for (index, example) in examples.enumerated() {
      let (platform, payout, pickup, delivery, pickupTime, deliveryTime, wait, homeMiles, homeMinutes) = example
      let text = """
      \(platform.rawValue)
      Offer payout: \(Double(payout) / 100)
      Guaranteed pay: \(Double(payout) / 100)
      Currency: USD
      Pickup: Example pickup \(index + 1)
      Dropoff: Example drop-off \(index + 1)
      Pickup distance: \(pickup) miles
      Delivery distance: \(delivery) miles
      Reposition distance: 0 miles
      Travel time: \(pickupTime + deliveryTime) minutes
      Pickup wait: \(wait) minutes
      Fees: 0
      Tips included
      Unconfirmed tip: 0
      Expires in: 50 seconds
      """
      var offer = try OfferNormalizer.normalize(text, platform: platform, source: .simulation, now: now)
      offer.offerId = UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index + 1))!
      try ingestion.ingest(offer, now: now)
      func leg(_ miles: Double, _ minutes: Double) -> GigRoadLeg {
        GigRoadLeg(miles: GigNumericBounds(miles, miles), minutes: GigNumericBounds(minutes, minutes), measuredAt: now, source: .simulation)
      }
      routes[offer.id] = GigDestinationRoutePlan(offerId: offer.id, destination: home, originCapturedAt: now,
        direct: leg(20, 35), toPickup: leg(pickup, pickupTime), delivery: leg(delivery, deliveryTime), onward: leg(homeMiles, homeMinutes))
    }
    var missing = try OfferNormalizer.normalize("DoorDash\nOffer payout: 19.50\nPickup: Example cafe", platform: .doorDash, source: .simulation, now: now)
    missing.offerId = UUID(uuidString: "00000000-0000-0000-0000-000000000005")!
    try ingestion.ingest(missing, now: now)
    return GigSampleShift(now: now, offers: ingestion.offers, routes: routes, preferences: preferences,
      profile: profile, records: sampleRecords(through: now), goals: goals)
  }
  private static func sampleRecords(through now: Date) -> [DriverRecord] {
    var records: [DriverRecord] = []
    let platforms = GigPlatform.allCases
    for offset in (0..<30).reversed() {
      let day = Calendar.current.date(byAdding: .day, value: -offset, to: now)!
      let start = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: day)!
      let count = 4 + offset % 4
      for index in 0..<count {
        let unpaid = index == count - 1
        let miles = unpaid ? Double(3 + offset % 4) : Double(4 + (index * 3 + offset) % 9)
        let tripStart = start.addingTimeInterval(Double(index) * 2900)
        var trip = Trip(startedAt: tripStart, endedAt: tripStart.addingTimeInterval(Double(unpaid ? 13 : 25 + index * 4) * 60),
          distanceMeters: miles * 1609.344, classification: .business, purpose: unpaid ? "Sample repositioning" : "Sample delivery", source: "sample")
        trip.rideRole = unpaid ? .reposition : .delivery
        trip.earningsCents = unpaid ? 0 : 2200 + ((index * 7 + offset * 3) % 16) * 100
        trip.platformFeesCents = unpaid ? 0 : 150
        trip.platform = platforms[(offset + index) % platforms.count].rawValue
        trip.workArea = ["West Hartford", "Newington", "Wethersfield"][index % 3]
        records.append(DriverRecord(id: UUID(uuidString: String(format: "00000001-0000-0000-0000-%012d", offset * 10 + index + 1))!, payload: .trip(trip)))
      }
      let label = DriverRecord.day(day)
      records.append(DriverRecord(payload: .income(Income(date: label, platform: platforms[offset % platforms.count].rawValue,
        description: "Sample platform payout", amountCents: 11800 + (offset % 6) * 1200))))
      if offset % 3 == 0 {
        records.append(DriverRecord(payload: .expense(Expense(date: label, merchant: "Sample fuel stop", category: .fuel,
          amountCents: 3200 + (offset % 5) * 175, classification: .business))))
      }
    }
    return records
  }
}
