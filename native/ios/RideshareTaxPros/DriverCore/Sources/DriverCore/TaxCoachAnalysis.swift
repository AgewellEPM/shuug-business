import Foundation

extension TaxCoach {
  public static func analyze(records: [DriverRecord], goals: DriverGoals,
                             from firstDay: String, through lastDay: String) -> CoachAnalysis {
    let valid = date(firstDay) != nil && date(lastDay) != nil && firstDay <= lastDay
    // A journal normally has one entry per ID. Preserve the latest revision if a caller supplies repeats.
    var unique: [UUID: DriverRecord] = [:]
    for record in records where unique[record.id].map({ $0.revision <= record.revision }) ?? true {
      unique[record.id] = record
    }
    let selected = valid ? unique.values.filter {
      !$0.deleted && date($0.dateLabel) != nil && $0.dateLabel >= firstDay && $0.dateLabel <= lastDay
    }.sorted { $0.dateLabel == $1.dateLabel ? $0.id.uuidString < $1.id.uuidString : $0.dateLabel < $1.dateLabel } : []
    let supported = selected.filter { record in
      switch record.payload {
      case .income(let income): return income.currency == "USD"
      case .expense(let expense): return expense.currency == "USD"
      case .trip: return true
      }
    }
    let insights = DrivingInsights(records: supported, goals: goals, from: firstDay, through: lastDay)
    let rides = insights.rides.sorted {
      $0.date == $1.date ? $0.id.uuidString < $1.id.uuidString : $0.date < $1.date
    }
    let priced = rides.filter { $0.estimatedNetCents != nil && !$0.needsMileageReview }
    let ranked = priced.sorted {
      $0.estimatedNetCents == $1.estimatedNetCents
        ? $0.id.uuidString < $1.id.uuidString : $0.estimatedNetCents! > $1.estimatedNetCents!
    }
    let trips = selected.compactMap { record -> Trip? in
      if case .trip(let trip) = record.payload { return trip }; return nil
    }
    let expenseReview = selected.filter {
      if case .expense(let expense) = $0.payload { return !expense.reviewNotes.isEmpty }; return false
    }.count
    return CoachAnalysis(from: firstDay, through: lastDay, scopeIsValid: valid, records: selected,
      days: insights.days, rides: rides,
      lossMakingJobs: ranked.filter { ($0.estimatedNetCents ?? 0) < 0 }.sorted {
        $0.estimatedNetCents == $1.estimatedNetCents
          ? $0.id.uuidString < $1.id.uuidString : $0.estimatedNetCents! < $1.estimatedNetCents!
      }, bestJobs: ranked, platforms: groups(rides, key: { $0.platform }),
      areas: groups(rides, key: { $0.workArea }),
      startHours: groups(rides, key: { String(format: "%02d:00", $0.startHour) }),
      recordedIncomeCents: insights.days.reduce(0) { $0 + $1.incomeCents },
      recordedBusinessExpenseCents: insights.days.reduce(0) { $0 + $1.businessExpenseCents },
      tripFareCents: rides.compactMap(\.earningsCents).reduce(0, +),
      knownEstimatedRideNetCents: priced.compactMap(\.estimatedNetCents).reduce(0, +),
      missingFareCount: insights.missingFareCount,
      missingFeeCount: rides.filter { !$0.feesRecorded }.count,
      missingVehicleCostCount: rides.filter { $0.estimatedVehicleCents == nil }.count,
      gpsGapCount: trips.filter { $0.classification == .business && $0.hasGaps }.count,
      unfinishedTripCount: trips.filter { $0.classification == .business && $0.endedAt == nil }.count,
      unclassifiedTripCount: insights.unreviewedTrips, expenseReviewCount: expenseReview,
      unsupportedCurrencyCount: selected.count - supported.count)
  }

  private static func groups(_ rides: [RideProfit], key: (RideProfit) -> String) -> [CoachGroupSummary] {
    Dictionary(grouping: rides, by: key).map { label, jobs in
      let priced = jobs.filter { $0.estimatedNetCents != nil && !$0.needsMileageReview }
      return CoachGroupSummary(id: label, label: label, jobCount: jobs.count, pricedJobCount: priced.count,
        knownEstimatedNetCents: priced.compactMap(\.estimatedNetCents).reduce(0, +),
        miles: jobs.reduce(0) { $0 + $1.miles }, minutes: jobs.reduce(0) { $0 + $1.minutes },
        hasCompleteDurations: jobs.allSatisfy { $0.minutes >= 1 },
        recordIds: jobs.map(\.id).sorted { $0.uuidString < $1.uuidString })
    }.sorted {
      // Incomplete groups cannot outrank complete groups as a profitability recommendation.
      if ($0.estimatedNetCents != nil) != ($1.estimatedNetCents != nil) { return $0.estimatedNetCents != nil }
      return $0.knownEstimatedNetCents == $1.knownEstimatedNetCents
        ? $0.label < $1.label : $0.knownEstimatedNetCents > $1.knownEstimatedNetCents
    }
  }

  static func date(_ day: String) -> Date? {
    guard day.count == 10 else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
    guard let result = formatter.date(from: day), formatter.string(from: result) == day else { return nil }
    return result
  }
}
