import Foundation

/// Deterministic local analysis of saved records. This engine makes no model or tax-filing calls.
public enum TaxCoach {
  public static let sources: [CoachSource] = [
    .init(id: "irs-gig-work", title: "IRS: Manage taxes for your gig work",
      url: "https://www.irs.gov/businesses/small-businesses-self-employed/manage-taxes-for-your-gig-work"),
    .init(id: "irs-recordkeeping", title: "IRS: Recordkeeping",
      url: "https://www.irs.gov/businesses/small-businesses-self-employed/recordkeeping"),
    .init(id: "irs-business-car", title: "IRS: Business use of car",
      url: "https://www.irs.gov/taxtopics/tc510"),
    .init(id: "irs-publication-463", title: "IRS: Publication 463 — check the applicable tax year",
      url: "https://www.irs.gov/publications/p463"),
    .init(id: "irs-estimated-taxes", title: "IRS: Estimated taxes",
      url: "https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes")
  ]

  public static func respond(to query: String, records: [DriverRecord], goals: DriverGoals,
                             from firstDay: String, through lastDay: String,
                             intake: CoachIntake = .init(), now: Date = Date()) -> CoachReply {
    let analysis = analyze(records: records, goals: goals, from: firstDay, through: lastDay)
    let milestones = milestones(for: analysis, intake: intake)
    guard analysis.scopeIsValid else {
      return CoachReply(message: CoachMessage(role: "assistant",
        text: "Choose a valid record range using yyyy-MM-dd dates, with From on or before Through. No records were analyzed.",
        createdAt: now, engine: "record-rules", recordIds: []), milestones: [], analysis: analysis)
    }
    let normalized = query.folding(options: [.caseInsensitive, .diacriticInsensitive],
      locale: Locale(identifier: "en_US_POSIX"))
    func asks(_ phrases: [String]) -> Bool { phrases.contains { normalized.contains($0) } }
    let tax = asks(["tax", "irs", "deduct", "1099", "w-2", "w2", "filing", "filed", "return", "mileage rate"])
    let missing = asks(["missing", "document", "receipt", "checklist", "prepare", "prep", "review", "gap"])
    var paragraphs = ["Records for \(firstDay) through \(lastDay)."]
    var evidence = analysis.records.map(\.id)
    if tax {
      paragraphs.append(taxGuidance(analysis, intake: intake))
      if missing { paragraphs.append(milestoneText(milestones)) }
    } else if missing {
      paragraphs.append(reviewText(analysis))
      paragraphs.append(milestoneText(milestones))
    } else if asks(["losing", "loosing", "lose money", "loss", "negative", "unprofitable", "lost money"]) {
      paragraphs.append(lossText(analysis))
      paragraphs.append(economicsLimits(analysis))
      evidence = analysis.lossMakingJobs.prefix(5).map(\.id)
    } else if asks(["goal", "target", "progress", "saving"]) {
      paragraphs.append(goalText(analysis, goals: goals))
      paragraphs.append(economicsLimits(analysis))
      evidence = analysis.pricedJobs.map(\.id)
    } else if asks(["waiting", "wait time", "idle", "downtime", "online time", "shift time"]) {
      paragraphs.append(waitingText(analysis))
    } else if asks(["area", "neighborhood", "zone", "where", "location"]) {
      paragraphs.append(groupText(analysis.areas, name: "work area"))
      paragraphs.append(economicsLimits(analysis))
      evidence = analysis.areas.prefix(8).flatMap(\.recordIds)
    } else if asks(["start hour", "start-hour", "time of day", "when", "morning", "evening", "hour"]) {
      paragraphs.append(groupText(analysis.startHours, name: "recorded start hour"))
      paragraphs.append("Start hours use each trip's saved time zone. These observations do not establish a best future shift or include time outside saved trips.")
      paragraphs.append(economicsLimits(analysis))
      evidence = analysis.startHours.prefix(8).flatMap(\.recordIds)
    } else if asks(["platform", "uber", "lyft", "doordash", "instacart", "spark", "amazon"]) {
      paragraphs.append(groupText(analysis.platforms, name: "platform"))
      paragraphs.append(economicsLimits(analysis))
      evidence = analysis.platforms.prefix(8).flatMap(\.recordIds)
    } else if asks(["best", "top", "highest", "most profitable", "most money"]) {
      paragraphs.append(bestText(analysis))
      paragraphs.append(economicsLimits(analysis))
      evidence = analysis.bestJobs.prefix(5).map(\.id)
    } else {
      paragraphs.append(balanceText(analysis))
      if !analysis.rides.isEmpty {
        paragraphs.append(bestText(analysis))
        paragraphs.append(lossText(analysis))
      }
      paragraphs.append(economicsLimits(analysis))
      if !asks(["revenue", "income", "expense", "cost", "profit", "net", "earn", "balance", "money"]) {
        paragraphs.append("Ask about loss-making trips, best individual jobs, platforms, work areas, start hours, missing records, goals, or tax preparation.")
      }
    }
    if analysis.unsupportedCurrencyCount > 0 {
      paragraphs.append("\(analysis.unsupportedCurrencyCount) income or expense records use another currency and are excluded from USD totals; no currency conversion was assumed.")
    }
    return CoachReply(message: CoachMessage(role: "assistant", text: paragraphs.joined(separator: "\n\n"),
      createdAt: now, engine: "record-rules", sources: tax || missing ? sources : nil,
      recordIds: evidence), milestones: milestones, analysis: analysis)
  }

  public static func milestones(for analysis: CoachAnalysis, intake: CoachIntake) -> [CoachMilestone] {
    guard analysis.scopeIsValid else { return [] }
    let tripRecords = analysis.records.filter { if case .trip = $0.payload { return true }; return false }
    let tripReview = tripRecords.filter { record in
      guard case .trip(let trip) = record.payload else { return false }
      return trip.classification == .unclassified || (trip.classification == .business
        && (trip.hasGaps || trip.endedAt == nil || clean(trip.purpose).isEmpty))
    }
    let expenseRecords = analysis.records.filter {
      if case .expense(let expense) = $0.payload { return expense.classification != .personal }; return false
    }
    let expenseReview = expenseRecords.filter {
      if case .expense(let expense) = $0.payload { return !expense.reviewNotes.isEmpty }; return false
    }
    let economicsReview = analysis.rides.filter {
      $0.estimatedNetCents == nil || $0.needsMileageReview
    }
    let hasYear = intake.taxYear.map { (1900...2200).contains($0) } ?? false
    let workStatus = clean(intake.businessType)
    let hasWorkStatus = !workStatus.isEmpty
      && !["unsure", "unknown", "not sure"].contains(workStatus.lowercased())
    return [
      .init(id: "tax-year", title: "Confirm tax year", detail: hasYear
        ? "Tax year \(intake.taxYear!) is recorded. The displayed record range remains \(analysis.from) through \(analysis.through)."
        : "Choose the tax year before applying year-specific rules, rates, or deadlines.", status: hasYear ? "done" : "todo"),
      .init(id: "jurisdiction", title: "Confirm tax jurisdiction", detail: clean(intake.jurisdiction).isEmpty
        ? "Add the country and relevant state or local jurisdiction. The linked IRS guidance covers U.S. federal taxes."
        : "Recorded jurisdiction: \(clean(intake.jurisdiction)). Relevant local rules still require review.",
        status: clean(intake.jurisdiction).isEmpty ? "todo" : "done"),
      .init(id: "work-status", title: "Confirm work and business status", detail: !hasWorkStatus
        ? "Confirm employee, independent contractor, or other business arrangement."
        : "Recorded work or business status: \(workStatus).", status: hasWorkStatus ? "done" : "todo"),
      .init(id: "trip-records", title: "Review trip records", detail: tripRecords.isEmpty
        ? "No trips are saved in this range. Add applicable business driving records or confirm none are needed."
        : "\(tripReview.count) trip records need classification, business purpose, completion, or GPS-gap review. This checks saved fields only.",
        status: !tripRecords.isEmpty && tripReview.isEmpty ? "done" : "todo", recordIds: tripReview.map(\.id)),
      .init(id: "job-economics", title: "Complete job economics", detail: analysis.rides.isEmpty
        ? "No completed business trips are available to compare."
        : "\(economicsReview.count) completed business trips need fare, explicit fees, an operating vehicle-cost estimate, or mileage review.",
        status: !analysis.rides.isEmpty && economicsReview.isEmpty ? "done" : "todo", recordIds: economicsReview.map(\.id)),
      .init(id: "expense-evidence", title: "Review expense evidence", detail: expenseRecords.isEmpty
        ? "No business or unclassified expenses are saved in this range. Add applicable records or confirm none are needed."
        : "\(expenseReview.count) expenses have review prompts. Add available evidence and purpose; meals also need participants or travel context. A completed record does not establish deductibility.",
        status: !expenseRecords.isEmpty && expenseReview.isEmpty ? "done" : "todo", recordIds: expenseReview.map(\.id)),
      .init(id: "income-reconciliation", title: "Reconcile income and tax forms",
        detail: "Compare saved income with platform statements, cash income, and applicable W-2 or 1099 forms. Documents not added here may exist elsewhere. Reconciliation and form receipt are not tracked here.",
        recordIds: analysis.records.filter { if case .income = $0.payload { return true }; return false }.map(\.id)),
      .init(id: "vehicle-method", title: "Review vehicle expense method",
        detail: "Confirm vehicle ownership or lease, first business-use year, previous methods, total and business miles, and costs before comparing tax methods. The operating cost goal is not an IRS mileage rate.", recordIds: tripRecords.map(\.id)),
      .init(id: "estimated-payment-review", title: "Prepare estimated-payment review",
        detail: "Gather the prior return, projected household income, withholding, payments, deductions, and credits for the applicable worksheet. Saving toward a goal does not record a tax payment."),
      .init(id: "return-review", title: "Review filing with your preparer",
        detail: "Tax-return preparation, submission, acceptance, and payment confirmation are not established by this checklist or chat.")
    ]
  }

  private static func balanceText(_ analysis: CoachAnalysis) -> String {
    let incomeCount = analysis.records.filter {
      if case .income(let income) = $0.payload { return income.currency == "USD" }; return false
    }.count
    let first = incomeCount == 0 ? "No USD income entries are saved in this range."
      : "Saved income entries total \(money(analysis.recordedIncomeCents))."
    return "\(first) Business-classified expense shares total \(money(analysis.recordedBusinessExpenseCents)), leaving a recorded operating balance of \(money(analysis.recordedOperatingBalanceCents)). This is saved income minus those expense shares, before tax review. Separately, completed business trips contain \(money(analysis.tripFareCents)) in known fare entries. Trip fares are not added to saved income because a payout may already include them. Vehicle-cost estimates are not subtracted again from the operating balance."
  }

  private static func bestText(_ analysis: CoachAnalysis) -> String {
    guard !analysis.bestJobs.isEmpty else {
      return "No individual trip can be ranked yet. Complete fare, explicit fees, and a vehicle-cost estimate, and review any GPS gaps."
    }
    return "Best individual recorded trips by estimated trip net:\n" + analysis.bestJobs.prefix(5).map(rideLine).joined(separator: "\n")
      + "\nThis ranks the saved sample; it does not predict future offers."
  }

  private static func lossText(_ analysis: CoachAnalysis) -> String {
    guard !analysis.lossMakingJobs.isEmpty else {
      return analysis.pricedJobs.isEmpty
        ? "The records do not yet establish which trips lost money; no completed business trip has all required economics and reviewed mileage."
        : "No negative estimated trip net appears among the \(analysis.pricedJobs.count) fully priced business trips without flagged GPS gaps. Incomplete records and time outside recorded trips can change the overall result."
    }
    return "\(analysis.lossMakingJobs.count) recorded business trips have negative estimated trip net:\n"
      + analysis.lossMakingJobs.prefix(5).map(rideLine).joined(separator: "\n")
      + "\nTrip net uses recorded fare minus recorded platform fees and your estimated vehicle cost. It excludes other saved expenses and unrecorded work."
  }

  private static func rideLine(_ ride: RideProfit) -> String {
    "• \(ride.title) · \(ride.date) · \(ride.platform) · \(ride.role.label): \(money(ride.estimatedNetCents ?? 0)) estimated net, \(decimal(ride.miles)) mi, \(decimal(ride.minutes)) min"
  }

  private static func groupText(_ groups: [CoachGroupSummary], name: String) -> String {
    guard !groups.isEmpty else { return "No completed business trips are saved for a \(name) summary." }
    return "Recorded trips by \(name):\n" + groups.prefix(8).map { group in
      let net = group.estimatedNetCents.map { money($0) + " estimated net" }
        ?? "\(money(group.knownEstimatedNetCents)) known subtotal; incomplete"
      let hourly = group.hourlyCents.map { ", \(money(Int($0.rounded())))/recorded trip hour" } ?? ""
      return "• \(group.label): \(group.jobCount) trips, \(group.pricedJobCount) fully priced, \(net)\(hourly)"
    }.joined(separator: "\n") + "\nThese are saved observations, with no adjustment for sample size or future demand."
  }

  private static func economicsLimits(_ analysis: CoachAnalysis) -> String {
    var items: [String] = []
    if analysis.missingFareCount > 0 { items.append("\(analysis.missingFareCount) missing fares") }
    if analysis.missingFeeCount > 0 { items.append("\(analysis.missingFeeCount) unknown platform fees") }
    if analysis.missingVehicleCostCount > 0 { items.append("\(analysis.missingVehicleCostCount) without a valid operating vehicle-cost estimate") }
    if analysis.gpsGapCount > 0 { items.append("\(analysis.gpsGapCount) business trips with GPS gaps") }
    if analysis.unfinishedTripCount > 0 { items.append("\(analysis.unfinishedTripCount) unfinished business trips") }
    if analysis.unclassifiedTripCount > 0 { items.append("\(analysis.unclassifiedTripCount) unclassified trips") }
    let review = items.isEmpty ? "No missing fare, fee, vehicle-cost, completion, classification, or GPS flags were found in these saved trip fields."
      : "Review: " + items.joined(separator: "; ") + ". Jobs with unknown economics or flagged GPS gaps are excluded from net rankings."
    return review + " Recorded trip time can include waiting inside a trip; waiting, idle time, and driving outside saved trips are not fully measured. Hourly figures use recorded trip time only. These operating estimates do not establish taxable income, deductions, or tax owed."
  }

  private static func waitingText(_ analysis: CoachAnalysis) -> String {
    let minutes = analysis.rides.reduce(0) { $0 + $1.minutes }
    return "Completed business trips contain \(decimal(minutes)) recorded minutes. The records supplied to this coach do not separate driving from waiting inside those trips or capture all between-job idle and online time. I cannot determine total shift hours, idle cost, or a true shift hourly rate from these records. Record the missing work and waiting periods before comparing full shifts."
  }

  private static func reviewText(_ analysis: CoachAnalysis) -> String {
    "\(analysis.recordCount) records are saved in this range. \(analysis.expenseReviewCount) expenses have review prompts. " + economicsLimits(analysis)
  }

  private static func milestoneText(_ milestones: [CoachMilestone]) -> String {
    "Next preparation steps:\n" + milestones.filter { $0.status == "todo" }.prefix(6)
      .map { "• \($0.title): \($0.detail)" }.joined(separator: "\n")
  }

  private static func taxGuidance(_ analysis: CoachAnalysis, intake: CoachIntake) -> String {
    var parts = [balanceText(analysis)]
    if intake.taxYear == nil || clean(intake.jurisdiction).isEmpty || clean(intake.businessType).isEmpty {
      parts.append("Before applying tax rules, confirm the tax year, country and state/local jurisdiction, and employee, independent-contractor, or other business status.")
    } else {
      parts.append("Recorded intake: tax year \(intake.taxYear!), \(clean(intake.jurisdiction)), \(clean(intake.businessType)). The linked IRS guidance covers U.S. federal taxes; use the guidance for the applicable year and review local requirements.")
    }
    parts.append("IRS guidance calls for reporting gig income even without a 1099 and keeping supporting records. Review business purpose, evidence, and any personal use before assessing expenses. Vehicle-method review needs ownership or lease and prior-method history; your operating cost estimate is not an IRS mileage rate. For meals, add the receipt or supporting evidence, business purpose, and participants or travel context for review.")
    parts.append("Estimated-tax planning also needs projected household income, withholding, payments, deductions, credits, and the applicable worksheet. This chat does not calculate tax liability or approve deductions, and it has not submitted a return or payment. It cannot confirm filing or payment status.")
    return parts.joined(separator: "\n\n")
  }

  private static func goalText(_ analysis: CoachAnalysis, goals: DriverGoals) -> String {
    let priced = analysis.pricedJobs
    func isPartial(from firstDay: String, through lastDay: String, pricedCount: Int) -> Bool {
      let candidates = analysis.records.filter { record in
        guard record.dateLabel >= firstDay && record.dateLabel <= lastDay,
              case .trip(let trip) = record.payload else { return false }
        return trip.classification != .personal
      }
      return candidates.count > pricedCount
    }
    var lines: [String] = []
    if let target = goals.dailyNetCents, target > 0 {
      let daily = priced.filter { $0.date == analysis.through }
      let net = daily.compactMap(\.estimatedNetCents).reduce(0, +)
      if daily.isEmpty {
        lines.append("Daily goal for \(analysis.through): progress unavailable; no eligible, fully priced trips are recorded for this day. Your target is \(money(target)).")
      } else if isPartial(from: analysis.through, through: analysis.through, pricedCount: daily.count) {
        lines.append("Daily goal for \(analysis.through): \(money(net)) recorded estimated trip net is the known portion from \(daily.count) fully priced trips against your \(money(target)) target. Other trip records need review; full progress and remaining earnings are unknown.")
      } else {
        lines.append("Daily goal for \(analysis.through): \(money(net)) recorded estimated trip net toward your \(money(target)) target (\(daily.count) fully priced trips).")
      }
    }
    if let target = goals.weeklyNetCents, target > 0, let end = date(analysis.through) {
      let prior = end.addingTimeInterval(-6 * 86_400)
      let windowStart = max(analysis.from, DriverRecord.day(prior, timeZone: TimeZone(secondsFromGMT: 0)!))
      let weekly = priced.filter { $0.date >= windowStart }
      let net = weekly.compactMap(\.estimatedNetCents).reduce(0, +)
      if weekly.isEmpty {
        lines.append("Weekly target reference: progress unavailable; no eligible, fully priced trips are recorded in \(windowStart) through \(analysis.through). Your target is \(money(target)).")
      } else if isPartial(from: windowStart, through: analysis.through, pricedCount: weekly.count) {
        lines.append("Weekly target reference: \(money(net)) recorded estimated trip net is the known portion against your \(money(target)) target. Other trip records need review; full progress and remaining earnings are unknown. This view covers \(windowStart) through \(analysis.through), up to seven selected days.")
      } else {
        lines.append("Weekly target reference: \(money(net)) recorded estimated trip net against your \(money(target)) target. This view covers \(windowStart) through \(analysis.through), up to seven selected days.")
      }
    }
    if let target = goals.targetHourlyCents, target > 0 {
      let minutes = priced.reduce(0) { $0 + $1.minutes }
      if !priced.isEmpty, priced.allSatisfy({ $0.minutes >= 1 }), minutes >= 1 {
        let hourly = Int((Double(analysis.knownEstimatedRideNetCents) / (minutes / 60)).rounded())
        lines.append("Recorded trip-hour rate: \(money(hourly))/hour against your \(money(target))/hour target; full shift and idle hours are not known.")
      } else { lines.append("Hourly goal comparison unavailable. Each contributing fully priced trip needs at least one recorded minute before comparing your hourly target.") }
    }
    if lines.isEmpty { lines.append("Set a daily net, weekly net, or hourly operating target to compare with your recorded trips.") }
    lines.append("Progress uses fully priced trips without flagged GPS gaps and excludes unrecorded work. Savings contributions and account balances are not recorded in these goal fields; I cannot infer money saved or taxes paid.")
    return lines.joined(separator: "\n")
  }

  private static func clean(_ value: String?) -> String {
    (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  }
  private static func money(_ cents: Int) -> String {
    let formatter = NumberFormatter(); formatter.locale = Locale(identifier: "en_US")
    formatter.numberStyle = .currency; formatter.currencyCode = "USD"
    return formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "USD \(Double(cents) / 100)"
  }
  private static func decimal(_ value: Double) -> String {
    String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), value)
  }
}
