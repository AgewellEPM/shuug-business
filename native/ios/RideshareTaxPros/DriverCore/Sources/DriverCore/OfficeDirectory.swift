import Foundation

public struct OfficeCoordinate: Codable, Equatable, Sendable {
  public let latitude: Double, longitude: Double
  public init(latitude: Double, longitude: Double) { self.latitude = latitude; self.longitude = longitude }
  public var valid: Bool { latitude.isFinite && longitude.isFinite && (-90...90).contains(latitude) && (-180...180).contains(longitude) }
  public func miles(to other: Self) -> Double {
    let radians = Double.pi / 180, dLat = (other.latitude - latitude) * radians, dLon = (other.longitude - longitude) * radians
    let a = pow(sin(dLat / 2), 2) + cos(latitude * radians) * cos(other.latitude * radians) * pow(sin(dLon / 2), 2)
    return 3958.7613 * 2 * atan2(sqrt(min(1, max(0, a))), sqrt(max(0, 1 - a)))
  }
}
public struct OfficeContact: Codable, Sendable {
  public var phone: String, hours: String, available24x7: Bool, appointmentURL: String
  public var callURL: URL? {
    guard !phone.isEmpty, phone.range(of: #"^\+?[0-9 () .-]+$"#, options: .regularExpression) != nil else { return nil }
    let digits = phone.filter { $0.isASCII && $0.isNumber }
    guard (7...15).contains(digits.count) else { return nil }
    return URL(string: "tel:" + (phone.hasPrefix("+") ? "+" : "") + digits)
  }
  public var bookingURL: URL? {
    Self.publicURL(appointmentURL)
  }
  public static func publicURL(_ address: String) -> URL? {
    guard let value = URLComponents(string: address), value.scheme == "https", let host = value.host,
      host.contains("."), value.user == nil, value.password == nil, value.port == nil,
      !host.hasSuffix(".local"), !host.hasSuffix(".internal"), !host.hasSuffix(".localhost"),
      !host.allSatisfy({ $0.isNumber || $0 == "." }) else { return nil }
    return value.url
  }
  public var shows24x7: Bool { available24x7 && callURL != nil }
}
public struct DirectoryOffice: Codable, Identifiable, Sendable {
  public let id: String, name: String, address: String, city: String, state: String, postalCode: String
  public let latitude: Double, longitude: Double
  public let phone: String, hours: String, available24x7: Bool, appointmentURL: String
  public let exteriorImageURL: String?
  public var exteriorURL: URL? { exteriorImageURL.flatMap(OfficeContact.publicURL) }
  public var coordinate: OfficeCoordinate { OfficeCoordinate(latitude: latitude, longitude: longitude) }
  public var contact: OfficeContact { OfficeContact(phone: phone, hours: hours, available24x7: available24x7, appointmentURL: appointmentURL) }
  public var fullAddress: String { "\(address), \(city), \(state) \(postalCode)" }
}
public struct OfficeDirectory: Codable, Sendable {
  public let version: Int, updatedAt: String, support: OfficeContact, offices: [DirectoryOffice]
  public func ranked(near point: OfficeCoordinate?) -> [DirectoryOffice] {
    var seen = Set<String>()
    let valid = offices.filter { !$0.id.isEmpty && !$0.name.isEmpty && !$0.address.isEmpty && $0.coordinate.valid && seen.insert($0.id).inserted }
    return valid.sorted { a, b in
      if let point, point.valid {
        let first = point.miles(to: a.coordinate), second = point.miles(to: b.coordinate)
        if abs(first - second) > 0.001 { return first < second }
      }
      return a.name == b.name ? a.id < b.id : a.name.localizedStandardCompare(b.name) == .orderedAscending
    }
  }
}
