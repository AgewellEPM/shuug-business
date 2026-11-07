import Foundation

/// Launcher metadata is separate from the five offer-reading platforms.
/// Icons are original publisher artwork. Universal links are publisher-declared
/// associations; actual launches require the provider app on a physical device.
struct GigAppCatalogEntry: Identifiable {
  let id: String
  let name: String
  let iconAsset: String
  let appStoreURL: URL
  let appURL: URL?
  let universalLink: URL?

  init(id: String, name: String, iconAsset: String, appStoreURL: URL,
       appURL: URL? = nil, universalLink: URL? = nil) {
    self.id = id; self.name = name; self.iconAsset = iconAsset
    self.appStoreURL = appStoreURL; self.appURL = appURL; self.universalLink = universalLink
  }

  var openingSupport: String {
    if appURL != nil { return "verified-scheme-and-universal-link" }
    return universalLink == nil ? "app-store-only" : "publisher-declared-universal-link"
  }
}

enum GigAppCatalog {
  // No unverified custom schemes. App Store fallback remains available for
  // every entry, including apps without a published general launch link.
  static let apps: [GigAppCatalogEntry] = [
    .init(id: "lyft-driver", name: "Lyft Driver", iconAsset: "PlatformLyftIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/lyft-driver/id1203077485")!, universalLink: URL(string: "https://www.lyft.com/driver-stats")!),
    .init(id: "uber-driver", name: "Uber Driver", iconAsset: "PlatformUberIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/uber-driver-drive-deliver/id1131342792")!, appURL: URL(string: "uberdriver://")!, universalLink: URL(string: "https://drivers.uber.com/open-mobile-app/partner")!),
    .init(id: "doordash-dasher", name: "Dasher", iconAsset: "PlatformDoorDashIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/doordash-dasher/id1451754591")!, universalLink: URL(string: "https://driver.doordash.com/")!),
    .init(id: "spark-driver", name: "Spark Driver", iconAsset: "PlatformSparkIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/spark-driver/id1483998235")!),
    .init(id: "instacart-shopper", name: "Instacart Shopper", iconAsset: "PlatformInstacartIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/instacart-shopper-earn-money/id1454056744")!, universalLink: URL(string: "https://instashopper.app.link/appdownload")!),
    .init(id: "amazon-flex", name: "Amazon Flex", iconAsset: "GigAppAmazonFlexIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/amazon-flex/id1454725763")!),
    .init(id: "grubhub-driver", name: "Grubhub Driver", iconAsset: "GigAppGrubhubDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/grubhub-for-drivers/id1452071632")!, universalLink: URL(string: "https://driver.grubhub.com/launch/")!),
    .init(id: "roadie-driver", name: "Roadie Driver", iconAsset: "GigAppRoadieDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/roadie-driver/id1436325695")!),
    .init(id: "shipt-shopper", name: "Shipt Shopper", iconAsset: "GigAppShiptShopperIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/drive-and-shop-with-shipt/id976353472")!, universalLink: URL(string: "https://shiptshopper.app.link/")!),
    .init(id: "gopuff-driver", name: "Gopuff Driver", iconAsset: "GigAppGopuffDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/gopuff-driver/id1600718400")!),
    .init(id: "taskrabbit-tasker", name: "Tasker", iconAsset: "GigAppTaskrabbitTaskerIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/tasker-by-taskrabbit/id1455415833")!, universalLink: URL(string: "https://taskrabbit.com/tasker/")!),
    .init(id: "rover", name: "Rover", iconAsset: "GigAppRoverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/rover-pet-sitters/id547320928")!),
    .init(id: "wag-caregiver", name: "Wag! Caregiver", iconAsset: "GigAppWagCaregiverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/wag-pet-caregiver/id940738731")!, universalLink: URL(string: "https://wagwalker.app.link/")!),
    .init(id: "favor-runner", name: "Favor Runner", iconAsset: "GigAppFavorRunnerIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/favor-runner-deliver-earn/id1295308505")!),
    .init(id: "curri-driver", name: "Curri Driver", iconAsset: "GigAppCurriDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/curri-driver/id1480866255")!, universalLink: URL(string: "https://curri.app.link/")!),
    .init(id: "goshare-driver", name: "GoShare Driver", iconAsset: "GigAppGoShareDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/goshare-drive-deliver-earn/id978279500")!, universalLink: URL(string: "https://goshare.co/app/n/")!),
    .init(id: "veho-driver", name: "Veho Driver", iconAsset: "GigAppVehoDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/veho-driver/id1457078986")!),
    .init(id: "dispatch-driver", name: "Dispatch", iconAsset: "GigAppDispatchDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/dispatch-deliver-more/id1175097181")!),
    .init(id: "skipcart-driver", name: "Skipcart", iconAsset: "GigAppSkipcartDriverIcon", appStoreURL: URL(string: "https://apps.apple.com/us/app/skipcart-delivery-driver/id1514854357")!),
  ]

  static var querySchemes: [String] {
    Array(Set(apps.compactMap { $0.appURL?.scheme })).sorted()
  }
}
