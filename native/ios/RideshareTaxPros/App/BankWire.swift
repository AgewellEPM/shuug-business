import DriverCore
import Foundation

struct BankItem: Decodable, Identifiable {
  var id: String, label: String, environment: String
  var lastSync: Date?, error: String?
  var connected: Int
}
struct BankStatusReply: Decodable { var ready: Bool; var environment: String, reason: String; var items: [BankItem] }
struct BankLinkReply: Decodable { var linkToken: String, sessionId: String, environment: String, redirectUri: String }
struct BankFeedReply: Decodable { var transactions: [BankTransaction]; var cursor: Int; var hasMore: Bool }
struct BankActionReply: Decodable { var itemId: String? }
