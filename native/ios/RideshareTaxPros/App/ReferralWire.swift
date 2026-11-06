import Foundation

struct ReferralProgram: Decodable {
  var name: String, terms: String
  var referralBonusCents: Int, pointsPerReferral: Int, milestonePoints: Int, milestoneCreditCents: Int
}
struct ReferralClaim: Decodable, Identifiable { var id: String, status: String; var createdAt: Date; var qualifiedAt: Date? }
struct ReferralReward: Decodable, Identifiable {
  var id: String, kind: String, status: String, method: String?
  var amountCents: Int, createdAt: Date, fulfilledAt: Date?
}
struct ReferredBy: Decodable { var status: String }
struct ReferralSummary: Decodable {
  var program: ReferralProgram, code: String, shareUrl: String
  var points: Int, nextMilestone: Int
  var claims: [ReferralClaim], rewards: [ReferralReward], referredBy: ReferredBy?
}
