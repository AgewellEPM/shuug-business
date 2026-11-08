import AVKit
import SwiftUI

private struct TourChapter: Decodable, Identifiable {
  let id: String, title: String, narration: String
  let start: Double, duration: Double
}
private struct GettingStartedTour: Decodable {
  let duration: Double, chapters: [TourChapter]
  static var bundled: Self? {
    guard let url = Bundle.main.url(forResource: "GettingStartedTour", withExtension: "json"),
      let bytes = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(Self.self, from: bytes)
  }
}
private struct TourPlayback: Identifiable {
  let id = UUID()
  let url: URL, start: Double
}

struct GettingStartedView: View {
  var onFinish: (() -> Void)?
  @State private var playback: TourPlayback?
  private let tour = GettingStartedTour.bundled
  private let video = Bundle.main.url(forResource: "GettingStarted", withExtension: "mp4")
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        BrandHeader()
        Text("Let’s get you started").font(.largeTitle.bold())
        Text("A tour of your app, from your first driving record to finding an office. Watch now or come back from Get help.")
          .foregroundStyle(Brand.muted)
        if let url = Bundle.main.url(forResource: "GettingStartedPoster", withExtension: "jpg"),
          let poster = UIImage(contentsOfFile: url.path) {
          Image(uiImage: poster).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 20))
            .accessibilityLabel("Preview of the Gig Tax Pros getting-started video")
        }
        if let video {
          VStack(alignment: .leading, spacing: 8) {
            Label("Turn your iPhone sideways", systemImage: "rotate.right")
              .font(.headline).accessibilityIdentifier("tour.rotate")
            Text("Watch in landscape to see the app and captions more clearly. If the screen stays upright, turn off Portrait Orientation Lock in Control Center.")
              .font(.subheadline).foregroundStyle(Brand.muted)
          }.gigCard(highlight: true)
          Button { playback = TourPlayback(url: video, start: 0) } label: {
            Label("Watch the getting-started video", systemImage: "play.circle.fill")
          }.buttonStyle(BrandActionStyle()).accessibilityIdentifier("tour.watch")
          if let tour {
            Text("About \(Int(ceil(tour.duration / 60))) minutes · Narration and captions · Available offline")
              .font(.footnote).foregroundStyle(Brand.muted)
          }
        }
        if let tour {
          Text("Jump to a topic").font(.title2.bold())
          ForEach(tour.chapters) { chapter in
            VStack(alignment: .leading, spacing: 8) {
              Button {
                if let video { playback = TourPlayback(url: video, start: chapter.start) }
              } label: {
                HStack {
                  Text(chapter.title).multilineTextAlignment(.leading)
                  Spacer(); Text(timestamp(chapter.start)).font(.caption.monospacedDigit()); Image(systemName: "play.circle")
                }
              }.accessibilityIdentifier("tour.chapter.\(chapter.id)")
              DisclosureGroup("Read this part") { Text(chapter.narration).font(.subheadline).foregroundStyle(Brand.muted) }
            }.gigCard()
          }
        }
        NavigationLink { OfferScreenshotGuide() } label: {
          Label("Try the interactive screenshot guide", systemImage: "hand.tap.fill")
        }.buttonStyle(BrandActionStyle(primary: false))
        if let onFinish {
          Button("Start using the app", action: onFinish).buttonStyle(BrandActionStyle()).accessibilityIdentifier("tour.finish")
        }
      }.padding(20).frame(maxWidth: 650).frame(maxWidth: .infinity)
    }.driverScreen().navigationTitle("Getting started").navigationBarTitleDisplayMode(.inline)
      .toolbar {
        if let onFinish {
          ToolbarItem(placement: .topBarTrailing) { Button("Skip for now", action: onFinish).accessibilityIdentifier("tour.skip") }
        }
      }
      .fullScreenCover(item: $playback) { selected in
        NavigationStack {
          GeometryReader { geometry in
            VStack(spacing: 0) {
              if geometry.size.width < geometry.size.height {
                Label("Turn your iPhone sideways", systemImage: "rotate.right")
                  .font(.subheadline.bold()).frame(maxWidth: .infinity).padding(12)
                  .background(Brand.panel).accessibilityIdentifier("tour.rotate.player")
              }
              NativeTourPlayer(url: selected.url, start: selected.start).ignoresSafeArea(edges: .bottom)
            }
          }
            .navigationTitle("Getting started").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { playback = nil }.accessibilityIdentifier("tour.player.done") } }
        }.preferredColorScheme(.dark).tint(Brand.pink)
      }
  }
  private func timestamp(_ seconds: Double) -> String { String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60) }
}

private struct NativeTourPlayer: UIViewControllerRepresentable {
  let url: URL, start: Double
  func makeUIViewController(context: Context) -> AVPlayerViewController {
    let controller = AVPlayerViewController(), player = AVPlayer(url: url)
    // The app fills the picture. Show one native caption at a time so viewers
    // can resize or turn off the synchronized instructions.
    player.appliesMediaSelectionCriteriaAutomatically = false
    controller.player = player; controller.showsPlaybackControls = true
    controller.view.accessibilityIdentifier = "tour.player"
    Task { @MainActor [weak player] in
      guard let player, let item = player.currentItem else { return }
      if let group = try? await item.asset.loadMediaSelectionGroup(for: .legible) {
        item.select(group.defaultOption ?? group.options.first, in: group)
      }
      guard player.currentItem === item else { return }
      let ready = await player.seek(to: CMTime(seconds: start, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
      if ready && player.currentItem === item { player.play() }
    }
    return controller
  }
  func updateUIViewController(_ controller: AVPlayerViewController, context: Context) { }
  static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: ()) {
    controller.player?.pause(); controller.player?.replaceCurrentItem(with: nil); controller.player = nil
  }
}
