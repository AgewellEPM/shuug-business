import Foundation

public struct BankReference: Codable, Equatable, Sendable {
  public var transactionId: String, provider: String, accountLabel: String
  public init(transactionId: String, provider: String, accountLabel: String) {
    self.transactionId = transactionId; self.provider = provider; self.accountLabel = accountLabel
  }
}
public struct BankTransaction: Codable, Equatable, Identifiable, Sendable {
  public var id: String, provider: String, accountLabel: String, date: String, merchant: String, currency: String
  // Positive is money spent; negative is money received. Zero is not a posting.
  public var amountCents: Int
  public var pending: Bool, removed: Bool
  public var suggestedCategory: ExpenseCategory?
  public var reviewedRecordId: UUID?
  public var ignored: Bool?
  public var needsUpdateReview: Bool?
  public var isTestData: Bool?
  public init(id: String, provider: String, accountLabel: String, date: String, merchant: String,
              amountCents: Int, currency: String = "USD", pending: Bool = false, removed: Bool = false,
              suggestedCategory: ExpenseCategory? = nil) {
    self.id = id; self.provider = provider; self.accountLabel = accountLabel; self.date = date
    self.merchant = merchant; self.amountCents = amountCents; self.currency = currency
    self.pending = pending; self.removed = removed
    self.suggestedCategory = suggestedCategory ?? MerchantCategory.suggest(merchant)
  }
  public var reference: BankReference { BankReference(transactionId: id, provider: provider, accountLabel: accountLabel) }
  public var readyForReview: Bool {
    !pending && !removed && ignored != true && reviewedRecordId == nil && amountCents != 0
  }
}

public enum BankInbox {
  /// Provider revisions update the inbox, never silently rewrite an approved expense.
  public static func merging(_ incoming: [BankTransaction], into existing: [BankTransaction]) -> [BankTransaction] {
    var rows = Dictionary(existing.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    for var transaction in incoming {
      if let old = rows[transaction.id] {
        transaction.reviewedRecordId = old.reviewedRecordId
        transaction.ignored = old.ignored
        transaction.needsUpdateReview = old.needsUpdateReview == true || (old.reviewedRecordId != nil &&
          (old.amountCents != transaction.amountCents || old.date != transaction.date || old.removed != transaction.removed
            || old.currency != transaction.currency || old.merchant != transaction.merchant))
      }
      rows[transaction.id] = transaction
    }
    return rows.values.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date > $1.date }
  }
}

public enum MerchantCategory {
  public static func suggest(_ merchant: String, providerCategory: String = "") -> ExpenseCategory? {
    let name = (merchant + " " + providerCategory).lowercased()
    let rules: [(ExpenseCategory, [String])] = [
      (.evCharging, ["ev charg", "supercharg", "chargepoint", "electrify america"]),
      (.fuel, ["gas station", "gasoline", "gas_and_energy", "shell", "chevron", "exxon", "sunoco", "mobil", "speedway", "circle k"]),
      (.tires, ["tire", "tyre", "goodyear"]),
      (.maintenance, ["jiffy lube", "oil change", "valvoline", "take 5 oil"]),
      (.repairs, ["auto repair", "automotive", "autozone", "advance auto", "o'reilly", "napa auto", "dealership", "car service"]),
      (.cleaning, ["car wash", "carwash", "auto detail"]),
      (.meals, ["food_and_drink", "restaurant", "mcdonald", "wendy", "burger king", "taco bell", "subway", "starbucks", "dunkin", "cafe", "pizza"]),
      (.tolls, ["toll", "e-zpass", "ezpass", "sunpass", "fastrak"]),
      (.parking, ["parking", "parkmobile", "spothero"]),
      (.insurance, ["insurance", "geico", "progressive", "state farm"]),
      (.phone, ["wireless", "verizon", "t-mobile", "at&t"])
    ]
    return rules.first { _, terms in
      terms.contains { term in
        if term.contains("_") { return name.contains(term) }
        return name.range(of: #"\b"# + NSRegularExpression.escapedPattern(for: term) + #"\b"#,
                          options: .regularExpression) != nil
      }
    }?.0
  }
}
