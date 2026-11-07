import DriverCore
import Foundation

extension DriverModel {
  /// One user/reconnect action retries each account-scoped data channel.
  /// Channel status remains separate so a partial success is never reported as all shared.
  func syncAll() async {
    let scope = journalScope
    let today = DriverRecord.day(Date())
    await syncCoach(from: String(today.prefix(4)) + "-01-01", through: today)
    guard scope == journalScope else { return }
    _ = await syncReputation()
  }
}
