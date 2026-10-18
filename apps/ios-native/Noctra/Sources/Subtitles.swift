import AVKit
import UIKit

/// Réplique de sous-titres (secondes).
struct SubtitleCue {
    let start: Double
    let end: Double
    let text: String
}

/// Lecture des fichiers WebVTT (et SRT) convertis par Jellyfin.
enum WebVTT {
    static func parse(_ raw: String) -> [SubtitleCue] {
        let text = raw.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        var cues: [SubtitleCue] = []
        for block in text.components(separatedBy: "\n\n") {
            let lines = block.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            guard let timing = lines.firstIndex(where: { $0.contains("-->") }) else { continue }
            let parts = lines[timing].components(separatedBy: "-->")
            guard parts.count == 2,
                  let start = seconds(parts[0]),
                  let end = seconds(parts[1].trimmingCharacters(in: .whitespaces).components(separatedBy: " ").first ?? "") else { continue }
            let body = lines[(timing + 1)...].map(clean).filter { !$0.isEmpty }.joined(separator: "\n")
            if !body.isEmpty, end > start { cues.append(SubtitleCue(start: start, end: end, text: body)) }
        }
        return cues.sorted { $0.start < $1.start }
    }

    /// « 01:02:03.456 », « 02:03.456 » ou « 01:02:03,456 » (SRT).
    static func seconds(_ value: String) -> Double? {
        let fields = value.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".").split(separator: ":")
        guard (2...3).contains(fields.count) else { return nil }
        var total = 0.0
        for field in fields {
            guard let number = Double(field) else { return nil }
            total = total * 60 + number
        }
        return total
    }

    /// Balises (<i>, <c.color>, {\an8}…) et entités retirées.
    private static func clean(_ line: String) -> String {
        line.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\{[^}]*\\}", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "\\N", with: "\n")
            .trimmingCharacters(in: .whitespaces)
    }
}

/// Taille des sous-titres choisie dans le compte (comme le réglage du site).
enum SubtitleSize: Int, CaseIterable, Identifiable {
    case small, medium, large
    var id: Int { rawValue }
    var label: String { ["Petits", "Moyens", "Grands"][rawValue] }
    var points: CGFloat {
        let base: CGFloat = [16, 20, 25][rawValue]
        return UIDevice.current.userInterfaceIdiom == .pad ? base * 1.4 : base
    }
    static var current: SubtitleSize { SubtitleSize(rawValue: UserDefaults.standard.integer(forKey: "noctra.subtitles.size")) ?? .medium }
}

/// Sous-titres affichés par l'appli au-dessus de la vidéo, sous les commandes
/// du lecteur d'Apple : fonctionnent en lecture directe comme en flux HLS.
@MainActor
final class SubtitleOverlay {
    private let label = UILabel()
    private var cues: [SubtitleCue] = []
    private var observer: Any?
    private weak var player: AVPlayer?
    private var shown = ""

    func attach(to controller: AVPlayerViewController, player: AVPlayer) {
        controller.loadViewIfNeeded()
        guard let overlay = controller.contentOverlayView else { return }
        self.player = player
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        label.layer.shadowColor = UIColor.black.cgColor
        label.layer.shadowOpacity = 1
        label.layer.shadowRadius = 3
        label.layer.shadowOffset = CGSize(width: 0, height: 1)
        overlay.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: overlay.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: overlay.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            label.bottomAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.bottomAnchor, constant: -28)
        ])
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 10), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.update(time.seconds) }
        }
    }

    func load(_ url: URL, headers: [String: String]) async {
        if url.isFileURL {
            if let data = try? Data(contentsOf: url) { cues = WebVTT.parse(String(decoding: data, as: UTF8.self)) }
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0) else { return }
        let text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
        cues = WebVTT.parse(text)
    }

    func detach() {
        if let observer, let player { player.removeTimeObserver(observer) }
        observer = nil
        label.removeFromSuperview()
    }

    private func update(_ time: Double) {
        guard time.isFinite, !cues.isEmpty else { return }
        // Dernière réplique commencée, puis celles qui se chevauchent encore.
        var low = 0, high = cues.count - 1, found = -1
        while low <= high {
            let middle = (low + high) / 2
            if cues[middle].start <= time { found = middle; low = middle + 1 } else { high = middle - 1 }
        }
        var lines: [String] = []
        var index = found
        while index >= 0 && index > found - 6 {
            if cues[index].end > time { lines.insert(cues[index].text, at: 0) }
            index -= 1
        }
        let text = lines.joined(separator: "\n")
        guard text != shown else { return }
        shown = text
        let size = SubtitleSize.current.points
        label.attributedText = NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: .semibold),
            .foregroundColor: UIColor.white,
            .strokeColor: UIColor.black.withAlphaComponent(0.85),
            .strokeWidth: -2.5
        ])
    }
}
