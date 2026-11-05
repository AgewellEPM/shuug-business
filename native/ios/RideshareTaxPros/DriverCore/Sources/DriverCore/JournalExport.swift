import Foundation

public enum JournalExport {
    public static func cents(_ text: String) -> Int? {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.range(of: #"^(0|[1-9]\d{0,6})(\.\d{1,2})?$"#, options: .regularExpression) != nil else { return nil }
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard let dollars = Int(parts[0]) else { return nil }
        let minor = parts.count == 2 ? Int((String(parts[1]) + "00").prefix(2)) ?? 0 : 0
        let value = dollars * 100 + minor; return value > 0 && value <= 100_000_000 ? value : nil
    }
    public static func csv(_ records: [DriverRecord]) -> String {
        func field(_ value: String) -> String {
            let stripped = value.trimmingCharacters(in: .whitespacesAndNewlines)
            let safe = stripped.first.map({ "=+-@".contains($0) }) == true ? "'" + value : value
            return "\"" + safe.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        var rows = [["Record ID", "Type", "Date", "Description", "Classification", "Distance miles", "Amount USD", "Notes", "Receipt ID", "Source", "Location gaps"]]
        for record in records where !record.deleted {
            var row = [record.id.uuidString.lowercased(), record.kind, record.dateLabel, record.title]
            switch record.payload {
            case .trip(let t): row += [t.classification.rawValue, String(format: "%.3f", t.distanceMeters / 1609.344), "", t.notes, "", t.source, t.hasGaps ? "Review gaps" : ""]
            case .expense(let e): row += [e.classification.rawValue, "", String(format: "%.2f", Double(e.amountCents)/100), e.notes, e.receiptId?.uuidString.lowercased() ?? "", "Client entry", ""]
            case .income(let i): row += ["", "", String(format: "%.2f", Double(i.amountCents)/100), i.notes, "", "Client entry · " + i.platform, ""]
            }
            rows.append(row)
        }
        return rows.map { $0.map(field).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
    }
}
