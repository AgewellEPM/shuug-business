import Foundation

/// LinkKit 7 resumes native OAuth itself. Keep the server's registered return
/// URI aligned with the associated domain in the signed app; do not add a
/// second WebView flow or put a bank/session token into a return link.
enum BankLinkReturn {
  static let domain = "gigtax.pro"
  static let redirectURI = "https://gigtax.pro/bank-return"

  static func validateConfiguration(_ redirect: String, appDomain: String?) throws {
    guard appDomain == domain, redirect == redirectURI else {
      throw ConfigurationError()
    }
  }

  struct ConfigurationError: LocalizedError {
    var errorDescription: String? {
      "Bank linking needs this app’s signed gigtax.pro return link. Ask your firm to finish the iPhone setup before connecting a bank."
    }
  }
}
