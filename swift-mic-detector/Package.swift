// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "mic-detector",
    platforms: [
        .macOS(.v12)
    ],
    targets: [
        .executableTarget(
            name: "mic-detector",
            path: "Sources",
            linkerSettings: [
                .linkedFramework("CoreAudio")
            ]
        )
    ]
)
