import Foundation

public struct CoachSource: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var title: String
  public var url: String
  public init(id: String, title: String, url: String) {
    self.id = id; self.title = title; self.url = url
  }
}

public struct CoachMessage: Codable, Equatable, Identifiable, Sendable {
  public var id: UUID
  public var role: String
  public var text: String
  public var createdAt: Date
  public var engine: String?
  public var sources: [CoachSource]?
  public var recordIds: [UUID]?
  public init(id: UUID = UUID(), role: String, text: String, createdAt: Date = Date(),
              engine: String? = nil, sources: [CoachSource]? = nil, recordIds: [UUID]? = nil) {
    self.id = id; self.role = role; self.text = text; self.createdAt = createdAt
    self.engine = engine; self.sources = sources; self.recordIds = recordIds
  }
}

/// User-selected operating goals. A vehicle cost is an operating estimate, not an IRS rate.
public struct CoachPreferences: Codable, Equatable, Sendable {
  public var dailyNetCents: Int?
  public var weeklyNetCents: Int?
  public var targetHourlyCents: Int?
  public var vehicleCostCentsPerMile: Double?
  public init(dailyNetCents: Int? = nil, weeklyNetCents: Int? = nil,
              targetHourlyCents: Int? = nil, vehicleCostCentsPerMile: Double? = nil) {
    self.dailyNetCents = dailyNetCents; self.weeklyNetCents = weeklyNetCents
    self.targetHourlyCents = targetHourlyCents
    self.vehicleCostCentsPerMile = vehicleCostCentsPerMile
  }
  public init(goals: DriverGoals) {
    self.init(dailyNetCents: goals.dailyNetCents, weeklyNetCents: goals.weeklyNetCents,
      targetHourlyCents: goals.targetHourlyCents, vehicleCostCentsPerMile: goals.vehicleCostCentsPerMile)
  }
  public var goals: DriverGoals {
    DriverGoals(dailyNetCents: dailyNetCents, weeklyNetCents: weeklyNetCents,
      targetHourlyCents: targetHourlyCents, vehicleCostCentsPerMile: vehicleCostCentsPerMile)
  }
}

public struct CoachIntake: Codable, Equatable, Sendable {
  public var taxYear: Int?
  public var jurisdiction: String?
  public var businessType: String?
  public init(taxYear: Int? = nil, jurisdiction: String? = nil, businessType: String? = nil) {
    self.taxYear = taxYear; self.jurisdiction = jurisdiction; self.businessType = businessType
  }
}

public struct CoachMilestone: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var title: String
  public var detail: String
  /// `todo` and `done` describe record preparation only, never filing or deductibility.
  public var status: String
  public var recordIds: [UUID]
  public init(id: String, title: String, detail: String, status: String = "todo", recordIds: [UUID] = []) {
    self.id = id; self.title = title; self.detail = detail; self.status = status
    self.recordIds = recordIds
  }
}

public struct CoachEngine: Codable, Equatable, Sendable {
  public var mode: String
  public var peelAvailable: Bool
  public var llmAvailable: Bool
  public init(mode: String = "record-rules", peelAvailable: Bool = false, llmAvailable: Bool = false) {
    self.mode = mode; self.peelAvailable = peelAvailable; self.llmAvailable = llmAvailable
  }
}

public struct CoachState: Codable, Equatable, Sendable {
  public var apiVersion: Int
  public var messages: [CoachMessage]
  public var preferences: CoachPreferences
  public var intake: CoachIntake
  public var milestones: [CoachMilestone]
  public var engine: CoachEngine
  public init(apiVersion: Int = 1, messages: [CoachMessage] = [], preferences: CoachPreferences = .init(),
              intake: CoachIntake = .init(), milestones: [CoachMilestone] = [], engine: CoachEngine = .init()) {
    self.apiVersion = apiVersion; self.messages = messages; self.preferences = preferences
    self.intake = intake; self.milestones = milestones; self.engine = engine
  }
}

/// A retry uses the original user message ID and preference/date snapshot.
public struct CoachPendingMessage: Codable, Equatable, Identifiable, Sendable {
  public var id: UUID
  public var text: String
  public var from: String
  public var through: String
  public var preferences: CoachPreferences
  public var localReplyId: UUID
  public init(id: UUID, text: String, from: String, through: String,
              preferences: CoachPreferences, localReplyId: UUID) {
    self.id = id; self.text = text; self.from = from; self.through = through
    self.preferences = preferences; self.localReplyId = localReplyId
  }
}

public struct CoachGroupSummary: Identifiable, Sendable {
  public let id: String
  public let label: String
  public let jobCount: Int
  public let pricedJobCount: Int
  public let knownEstimatedNetCents: Int
  public let miles: Double
  public let minutes: Double
  public let hasCompleteDurations: Bool
  public let recordIds: [UUID]
  public var estimatedNetCents: Int? { pricedJobCount == jobCount ? knownEstimatedNetCents : nil }
  public var hourlyCents: Double? {
    guard estimatedNetCents != nil, hasCompleteDurations, minutes >= 1 else { return nil }
    return Double(knownEstimatedNetCents) / (minutes / 60)
  }
}

/// Operating views remain separate: saved income/expense entries are never added to trip fares.
public struct CoachAnalysis: Sendable {
  public let from: String
  public let through: String
  public let scopeIsValid: Bool
  public let records: [DriverRecord]
  public let days: [DrivingDay]
  public let rides: [RideProfit]
  public let lossMakingJobs: [RideProfit]
  public let bestJobs: [RideProfit]
  public let platforms: [CoachGroupSummary]
  public let areas: [CoachGroupSummary]
  public let startHours: [CoachGroupSummary]
  public let recordedIncomeCents: Int
  public let recordedBusinessExpenseCents: Int
  public let tripFareCents: Int
  public let knownEstimatedRideNetCents: Int
  public let missingFareCount: Int
  public let missingFeeCount: Int
  public let missingVehicleCostCount: Int
  public let gpsGapCount: Int
  public let unfinishedTripCount: Int
  public let unclassifiedTripCount: Int
  public let expenseReviewCount: Int
  public let unsupportedCurrencyCount: Int
  public var recordCount: Int { records.count }
  public var recordedOperatingBalanceCents: Int { recordedIncomeCents - recordedBusinessExpenseCents }
  public var pricedJobs: [RideProfit] { rides.filter { $0.estimatedNetCents != nil && !$0.needsMileageReview } }
  public var estimatedRideNetCents: Int? {
    !rides.isEmpty && pricedJobs.count == rides.count ? knownEstimatedRideNetCents : nil
  }
}

public struct CoachReply: Sendable {
  public let message: CoachMessage
  public let milestones: [CoachMilestone]
  public let analysis: CoachAnalysis
  public init(message: CoachMessage, milestones: [CoachMilestone], analysis: CoachAnalysis) {
    self.message = message; self.milestones = milestones; self.analysis = analysis
  }
}
