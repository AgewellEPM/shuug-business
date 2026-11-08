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
  @State private var captionsEnabled = true
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
              NativeTourPlayer(url: selected.url, start: selected.start, captionsEnabled: captionsEnabled).ignoresSafeArea(edges: .bottom)
            }
          }
            .navigationTitle("Getting started").navigationBarTitleDisplayMode(.inline)
            .toolbar {
              ToolbarItem(placement: .topBarLeading) {
                Button { captionsEnabled.toggle() } label: {
                  Label(captionsEnabled ? "Hide captions" : "Show captions", systemImage: captionsEnabled ? "captions.bubble.fill" : "captions.bubble")
                }.accessibilityIdentifier("tour.captions")
              }
              ToolbarItem(placement: .topBarTrailing) { Button("Done") { playback = nil }.accessibilityIdentifier("tour.player.done") }
            }
        }.preferredColorScheme(.dark).tint(Brand.pink)
      }
  }
  private func timestamp(_ seconds: Double) -> String { String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60) }
}

private struct NativeTourPlayer: UIViewControllerRepresentable {
  let url: URL, start: Double, captionsEnabled: Bool
  func makeCoordinator() -> Coordinator { Coordinator() }
  func makeUIViewController(context: Context) -> AVPlayerViewController {
    let controller = AVPlayerViewController(), player = AVPlayer(url: url)
    // Some native renderers select mov_text without displaying it. Render the
    // identical bundled SRT once, with a selectable native caption overlay.
    player.appliesMediaSelectionCriteriaAutomatically = false
    controller.player = player; controller.showsPlaybackControls = true
    controller.view.accessibilityIdentifier = "tour.player"
    context.coordinator.attach(to: controller, player: player, enabled: captionsEnabled)
    let coordinator = context.coordinator
    coordinator.playbackTask = Task { @MainActor [weak player, weak coordinator] in
      guard let player, let item = player.currentItem else { return }
      if let group = try? await item.asset.loadMediaSelectionGroup(for: .legible) {
        coordinator?.legibleGroup = group
        item.select(nil, in: group)
      }
      guard !Task.isCancelled, player.currentItem === item else { return }
      let ready = await player.seek(to: CMTime(seconds: start, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
      if !Task.isCancelled && ready && player.currentItem === item { player.play() }
    }
    return controller
  }
  func updateUIViewController(_ controller: AVPlayerViewController, context: Context) {
    context.coordinator.enabled = captionsEnabled
    context.coordinator.refresh(controller.player?.currentTime().seconds ?? 0)
  }
  static func dismantleUIViewController(_ controller: AVPlayerViewController, coordinator: Coordinator) {
    coordinator.dispose()
    controller.player?.pause(); controller.player?.replaceCurrentItem(with: nil); controller.player = nil
  }

  @MainActor final class Coordinator {
    let label = PaddedTourCaption()
    let cues = TourCaption.bundled
    var enabled = true
    var playbackTask: Task<Void, Never>?
    private weak var player: AVPlayer?
    private var observer: Any?
    private var selectionObserver: NSObjectProtocol?
    var legibleGroup: AVMediaSelectionGroup?
    func attach(to controller: AVPlayerViewController, player: AVPlayer, enabled: Bool) {
      self.player = player; self.enabled = enabled
      label.font = .preferredFont(forTextStyle: .callout)
      label.adjustsFontForContentSizeCategory = true
      label.textColor = .white; label.backgroundColor = .black.withAlphaComponent(0.88)
      label.textAlignment = .center; label.numberOfLines = 0
      label.layer.cornerRadius = 10; label.clipsToBounds = true
      label.accessibilityIdentifier = "tour.caption"
      label.translatesAutoresizingMaskIntoConstraints = false
      if let overlay = controller.contentOverlayView {
        overlay.addSubview(label)
        NSLayoutConstraint.activate([
          label.leadingAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.leadingAnchor, constant: 24),
          label.trailingAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.trailingAnchor, constant: -24),
          // Leave space for AVKit's playback timeline when controls are open.
          label.bottomAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.bottomAnchor, constant: -100),
        ])
      }
      refresh(player.currentTime().seconds)
      observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { [weak self] time in
        MainActor.assumeIsolated { self?.refresh(time.seconds) }
      }
      selectionObserver = NotificationCenter.default.addObserver(forName: AVPlayerItem.mediaSelectionDidChangeNotification, object: player.currentItem, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let self, let item = self.player?.currentItem, let group = self.legibleGroup,
            item.currentMediaSelection.selectedMediaOption(in: group) != nil else { return }
          item.select(nil, in: group)
        }
      }
    }
    func refresh(_ seconds: Double) {
      let text = enabled && seconds.isFinite ? cues.first { $0.start <= seconds && seconds < $0.end }?.text : nil
      label.text = text; label.isHidden = text == nil
    }
    func dispose() {
      playbackTask?.cancel(); playbackTask = nil
      if let observer { player?.removeTimeObserver(observer) }
      if let selectionObserver { NotificationCenter.default.removeObserver(selectionObserver) }
      selectionObserver = nil; legibleGroup = nil
      observer = nil; player = nil; label.removeFromSuperview()
    }
  }
}

private final class PaddedTourCaption: UILabel {
  private let padding = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
  override func drawText(in rect: CGRect) { super.drawText(in: rect.inset(by: padding)) }
  override var intrinsicContentSize: CGSize {
    let size = super.intrinsicContentSize
    return CGSize(width: size.width + padding.left + padding.right, height: size.height + padding.top + padding.bottom)
  }
  override func textRect(forBounds bounds: CGRect, limitedToNumberOfLines count: Int) -> CGRect {
    let rect = super.textRect(forBounds: bounds.inset(by: padding), limitedToNumberOfLines: count)
    return rect.inset(by: UIEdgeInsets(top: -padding.top, left: -padding.left, bottom: -padding.bottom, right: -padding.right))
  }
}

private struct TourCaption {
  let start: Double, end: Double, text: String
  static let bundled: [Self] = {
    guard let url = Bundle.main.url(forResource: "GettingStarted.en", withExtension: "srt"),
      let bytes = try? Data(contentsOf: url), bytes.count <= 1_000_000,
      let source = String(data: bytes, encoding: .utf8) else { return [] }
    func seconds(_ value: String) -> Double? {
      let parts = value.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".").split(separator: ":")
      guard parts.count == 3, let hours = Double(parts[0]), let minutes = Double(parts[1]), let seconds = Double(parts[2]),
        hours >= 0, hours < 24, minutes >= 0, minutes < 60, seconds >= 0, seconds < 60 else { return nil }
      return hours * 3600 + minutes * 60 + seconds
    }
    return source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n\n").prefix(2000).compactMap { block in
      let lines = block.components(separatedBy: "\n")
      guard lines.count >= 3 else { return nil }
      let range = lines[1].components(separatedBy: " --> ")
      guard range.count == 2, let start = seconds(range[0]), let end = seconds(range[1]), end > start else { return nil }
      let text = lines.dropFirst(2).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty, text.count <= 2000 else { return nil }
      return Self(start: start, end: end, text: text)
    }
  }()
}
