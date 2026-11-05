// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "DriverCore", platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "DriverCore", targets: ["DriverCore"])],
    targets: [.target(name: "DriverCore"), .testTarget(name: "DriverCoreTests", dependencies: ["DriverCore"])]
)
