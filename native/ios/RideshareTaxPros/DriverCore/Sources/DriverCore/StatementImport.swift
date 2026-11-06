import CryptoKit
import Foundation

public enum StatementError: Error, LocalizedError {
  case invalid(String)
  public var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}
public enum StatementDateFormat: String, CaseIterable, Identifiable {
  case iso = "yyyy-MM-dd", us = "MM/dd/yyyy", international = "dd/MM/yyyy"
  public var id: String { rawValue }
}
public struct StatementColumns {
  public var date: Int, merchant: Int, amount: Int?, debit: Int?, credit: Int?, reference: Int?
  public var positiveMeansSpending: Bool
  public var dateFormat: StatementDateFormat
  public init(date: Int, merchant: Int, amount: Int? = nil, debit: Int? = nil, credit: Int? = nil,
              reference: Int? = nil, positiveMeansSpending: Bool = false, dateFormat: StatementDateFormat = .iso) {
    self.date = date; self.merchant = merchant; self.amount = amount; self.debit = debit
    self.credit = credit; self.reference = reference; self.positiveMeansSpending = positiveMeansSpending
    self.dateFormat = dateFormat
  }
}
public struct StatementPreview {
  public var transactions: [BankTransaction]
  public var issues: [String]
}

public enum StatementImport {
  public static func text(_ data: Data) throws -> String {
    guard data.count <= 5 * 1024 * 1024 else { throw StatementError.invalid("Use a statement export under 5 MB.") }
    let decoded = String(data: data, encoding: .utf8)
      ?? String(data: data, encoding: .utf16)
      ?? String(data: data, encoding: .windowsCP1252)
    guard let value = decoded else { throw StatementError.invalid("Choose a CSV, OFX or QFX text statement.") }
    return value.replacingOccurrences(of: "\u{FEFF}", with: "")
  }
  public static func csv(_ text: String) throws -> [[String]] {
    var rows: [[String]] = [], row: [String] = [], field = "", quoted = false
    let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
    let chars = Array(normalized), delimiter: Character = normalized.split(separator: "\n").first?.contains("\t") == true ? "\t" : ","
    var i = 0
    while i < chars.count {
      let c = chars[i]
      if c == "\"" {
        if quoted && i + 1 < chars.count && chars[i + 1] == "\"" { field.append("\""); i += 1 }
        else if quoted || field.isEmpty { quoted.toggle() }
        else { throw StatementError.invalid("A quoted CSV field could not be read.") }
      } else if c == delimiter && !quoted { row.append(field); field = "" }
      else if (c == "\n" || c == "\r") && !quoted {
        if c == "\r" && i + 1 < chars.count && chars[i+1] == "\n" { i += 1 }
        row.append(field)
        if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
        row = []; field = ""
      } else { field.append(c) }
      guard rows.count <= 20_000, row.count <= 80, field.count <= 16_000 else {
        throw StatementError.invalid("This export has too many rows, columns or an oversized field.")
      }
      i += 1
    }
    guard !quoted else { throw StatementError.invalid("The CSV ends inside a quoted field.") }
    if !field.isEmpty || !row.isEmpty { row.append(field); rows.append(row) }
    guard rows.count >= 2 else { throw StatementError.invalid("Choose a CSV with a header and at least one transaction.") }
    return rows
  }
  public static func signedCents(_ raw: String) -> Int? {
    var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "$", with: "")
    let parentheses = value.hasPrefix("(") && value.hasSuffix(")")
    if parentheses { value.removeFirst(); value.removeLast() }
    let negative = parentheses || value.hasPrefix("-")
    if value.hasPrefix("-") || value.hasPrefix("+") { value.removeFirst() }
    guard value.range(of: #"^(?:\d{1,7}|\d{1,3}(?:,\d{3}){1,2})(\.\d{1,2})?$"#, options: .regularExpression) != nil else { return nil }
    value = value.replacingOccurrences(of: ",", with: "")
    let pieces = value.split(separator: ".", omittingEmptySubsequences: false)
    guard let dollars = Int(pieces[0]) else { return nil }
    let fraction = pieces.count == 2 ? String(pieces[1]) : ""
    let cents = dollars * 100 + (Int(fraction.padding(toLength: 2, withPad: "0", startingAt: 0)) ?? 0)
    guard cents <= 100_000_000 else { return nil }
    return negative ? -cents : cents
  }
  private static func key(_ text: String) -> String {
    SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
  }
  private static func day(_ text: String, format: StatementDateFormat) -> String? {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = format.rawValue; formatter.isLenient = false
    guard let date = formatter.date(from: text.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
    return DriverRecord.day(date, timeZone: TimeZone(secondsFromGMT: 0)!)
  }
  public static func preview(rows: [[String]], columns: StatementColumns, account: String, fileIdentity: String) -> StatementPreview {
    var result: [BankTransaction] = [], issues: [String] = []
    for (index, row) in rows.dropFirst().enumerated() {
      func cell(_ column: Int?) -> String {
        guard let column, row.indices.contains(column) else { return "" }
        return row[column].trimmingCharacters(in: .whitespacesAndNewlines)
      }
      let merchant = cell(columns.merchant)
      var amount: Int?
      if let column = columns.amount, let parsed = signedCents(cell(column)) {
        amount = columns.positiveMeansSpending ? parsed : -parsed
      } else if columns.amount == nil {
        let debitText = cell(columns.debit), creditText = cell(columns.credit)
        let debit = debitText.isEmpty ? 0 : signedCents(debitText)
        let credit = creditText.isEmpty ? 0 : signedCents(creditText)
        if let debit, let credit, debit == 0 || credit == 0 { amount = abs(debit) - abs(credit) }
      }
      guard let date = day(cell(columns.date), format: columns.dateFormat), let amount, amount != 0,
            !merchant.isEmpty, merchant.count <= 160 else {
        issues.append("Row \(index + 2): check its date, description and amount."); continue
      }
      let reference = cell(columns.reference)
      let identity = reference.isEmpty ? fileIdentity + "|row:" + String(index) : "reference:" + reference
      let id = "file:" + key(account.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) + "|" + identity)
      result.append(BankTransaction(id: id, provider: "statement", accountLabel: String(account.prefix(80)),
                                    date: date, merchant: merchant, amountCents: amount))
    }
    return StatementPreview(transactions: result, issues: issues)
  }
  public static func fileIdentity(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

  public static func ofx(_ text: String, account: String) throws -> StatementPreview {
    func value(_ tag: String, in text: String) -> String? {
      guard let expression = try? NSRegularExpression(pattern: "<" + tag + ">\\s*([^<\\r\\n]+)", options: .caseInsensitive),
            let match = expression.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
            let range = Range(match.range(at: 1), in: text) else { return nil }
      return String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    guard let expression = try? NSRegularExpression(pattern: "<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|(?=</BANKTRANLIST>))", options: [.caseInsensitive, .dotMatchesLineSeparators]) else { throw StatementError.invalid("Cannot read this statement.") }
    let matches = expression.matches(in: text, range: NSRange(text.startIndex..., in: text))
    guard !matches.isEmpty, matches.count <= 20_000 else { throw StatementError.invalid("No readable OFX/QFX transactions were found.") }
    let currency = value("CURDEF", in: text) ?? "UNKNOWN"
    var transactions: [BankTransaction] = [], issues: [String] = []
    for (index, match) in matches.enumerated() {
      guard let range = Range(match.range(at: 1), in: text) else { continue }
      let block = String(text[range]), rawDay = String((value("DTPOSTED", in: block) ?? "").prefix(8))
      let formatted = rawDay.count == 8 ? String(rawDay.prefix(4)) + "-" + rawDay.dropFirst(4).prefix(2) + "-" + rawDay.suffix(2) : ""
      guard let date = day(formatted, format: .iso), let amount = signedCents(value("TRNAMT", in: block) ?? ""), amount != 0,
            let reference = value("FITID", in: block), !reference.isEmpty else {
        issues.append("Transaction \(index + 1): missing date, amount or bank reference."); continue
      }
      let name = value("NAME", in: block) ?? value("MEMO", in: block) ?? "Bank transaction"
      let id = "ofx:" + key(account.lowercased() + "|" + reference)
      transactions.append(BankTransaction(id: id, provider: "statement", accountLabel: String(account.prefix(80)),
                                         date: date, merchant: String(name.prefix(160)), amountCents: -amount, currency: currency))
    }
    return StatementPreview(transactions: transactions, issues: issues)
  }
}
