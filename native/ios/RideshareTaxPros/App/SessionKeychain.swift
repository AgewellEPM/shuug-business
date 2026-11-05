import DriverCore
import Foundation
import Security

enum SessionKeychain {
  private static let item: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.ridesharetaxpros.driver",
    kSecAttrAccount as String: "client-session",
  ]
  static func read() throws -> ConnectionProfile? {
    var query = item
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw WorkspaceError.message("Unlock your phone to access your workspace connection.")
    }
    return try WireJSON.decoder().decode(ConnectionProfile.self, from: data)
  }
  static func save(_ profile: ConnectionProfile) throws {
    let data = try WireJSON.encoder().encode(profile)
    let status = SecItemUpdate(
      item as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
      var value = item
      value[kSecValueData as String] = data
      value[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      guard SecItemAdd(value as CFDictionary, nil) == errSecSuccess else {
        throw WorkspaceError.message("The workspace connection could not be saved securely.")
      }
      return
    }
    guard status == errSecSuccess else {
      throw WorkspaceError.message("The workspace connection could not be saved securely.")
    }
  }
  static func remove() throws {
    let status = SecItemDelete(item as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw WorkspaceError.message("The saved connection could not be removed.")
    }
  }
}
