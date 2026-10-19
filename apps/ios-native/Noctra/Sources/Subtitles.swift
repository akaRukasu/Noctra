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

/// Sous-titres affichés par l'appli au-dessus de la vidéo (lecture directe
/// comme flux HLS). Le texte est posé sur la vue du lecteur d'Apple, au-dessus
/// de tout, sans capter les gestes : il reste visible en plein écran.
@MainActor
final class SubtitleOverlay {
    private let label = UILabel()
    private let status = UILabel()
    private var cues: [SubtitleCue] = []
    private var observer: Any?
    private weak var player: AVPlayer?
    private var shown = ""

    func attach(to controller: AVPlayerViewController, player: AVPlayer) {
        controller.loadViewIfNeeded()
        guard let host = controller.view else { return }
        self.player = player
        for view in [label, status] {
            view.numberOfLines = 0
            view.textAlignment = .center
            view.isUserInteractionEnabled = false
            view.translatesAutoresizingMaskIntoConstraints = false
            view.layer.shadowColor = UIColor.black.cgColor
            view.layer.shadowOpacity = 1
            view.layer.shadowRadius = 3
            view.layer.shadowOffset = CGSize(width: 0, height: 1)
            host.addSubview(view)
        }
        status.font = .systemFont(ofSize: 13, weight: .semibold)
        status.textColor = UIColor.white.withAlphaComponent(0.75)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: host.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            label.trailingAnchor.constraint(lessThanOrEqualTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -28),
            label.bottomAnchor.constraint(equalTo: host.safeAreaLayoutGuide.bottomAnchor, constant: -64),
            status.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            status.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 58)
        ])
        observer = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 10), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.update(time.seconds) }
        }
    }

    /// Fichier WebVTT : sur l'iPhone, ou préparé par le serveur (la première
    /// fois, il extrait la piste du fichier vidéo : cela peut prendre une minute).
    func load(_ url: URL, headers: [String: String], alternates: [URL] = []) async {
        if url.isFileURL {
            if let data = try? Data(contentsOf: url) { cues = WebVTT.parse(String(decoding: data, as: UTF8.self)) }
            if cues.isEmpty { flash("Sous-titres illisibles") }
            return
        }
        status.text = "Sous-titres en préparation…"
        for candidate in [url] + alternates {
            for attempt in 0..<2 {
                var request = URLRequest(url: candidate)
                request.timeoutInterval = attempt == 0 ? 240 : 120
                for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
                guard let (data, response) = try? await URLSession.shared.data(for: request) else { continue }
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if code == 404 { break }
                guard (200..<300).contains(code) else { continue }
                let parsed = WebVTT.parse(String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self))
                if !parsed.isEmpty {
                    cues = parsed
                    status.text = nil
                    if let player { update(player.currentTime().seconds) }
                    return
                }
            }
        }
        flash("Sous-titres indisponibles pour ce titre")
    }

    private func flash(_ text: String) {
        status.text = text
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            self?.status.text = nil
        }
    }

    func detach() {
        if let observer, let player { player.removeTimeObserver(observer) }
        observer = nil
        label.removeFromSuperview()
        status.removeFromSuperview()
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
        // Le lecteur d'Apple peut poser ses propres vues par-dessus après la présentation.
        if let host = label.superview, host.subviews.last !== label {
            host.bringSubviewToFront(label)
            host.bringSubviewToFront(status)
        }
        let size = SubtitleSize.current.points
        label.attributedText = NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: .semibold),
            .foregroundColor: UIColor.white,
            .strokeColor: UIColor.black.withAlphaComponent(0.85),
            .strokeWidth: -2.5
        ])
    }
}

/// Bouton « Audio et sous-titres » posé sur le lecteur d'Apple : menu des pistes
/// du titre (langues, sous-titres texte ou incrustés). Il apparaît avec les
/// commandes (toucher l'image) et s'efface tout seul.
@MainActor
final class TrackMenuButton: NSObject, UIGestureRecognizerDelegate {
    private let button = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)
    private var tap: UITapGestureRecognizer?
    private weak var host: UIView?
    private var hideTask: Task<Void, Never>?

    func attach(to controller: AVPlayerViewController) {
        controller.loadViewIfNeeded()
        guard let host = controller.view else { return }
        self.host = host
        var config = UIButton.Configuration.glass()
        config.image = UIImage(systemName: "captions.bubble.fill")
        config.title = nil
        config.imagePadding = 7
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var updated = attributes
            updated.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
            return updated
        }
        button.configuration = config
        button.tintColor = .white
        button.showsMenuAsPrimaryAction = true
        button.translatesAutoresizingMaskIntoConstraints = false
        button.accessibilityLabel = "Langue audio et sous-titres"
        button.accessibilityHint = "Choisir une langue audio ou une piste de sous-titres"
        spinner.color = .white
        spinner.hidesWhenStopped = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        host.addSubview(button)
        host.addSubview(spinner)
        NSLayoutConstraint.activate([
            button.trailingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            button.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 68),
            button.widthAnchor.constraint(equalToConstant: 48),
            button.heightAnchor.constraint(equalToConstant: 48),
            spinner.centerYAnchor.constraint(equalTo: button.centerYAnchor),
            spinner.centerXAnchor.constraint(equalTo: button.centerXAnchor)
        ])
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        host.addGestureRecognizer(tap)
        self.tap = tap
        show()
    }

    func setMenu(_ menu: UIMenu) { button.menu = menu }

    func setBusy(_ busy: Bool) {
        button.isEnabled = !busy
        button.configuration?.showsActivityIndicator = busy
        if busy { show(keep: true) } else { show() }
    }

    func bringToFront() {
        guard let host else { return }
        host.bringSubviewToFront(button)
        host.bringSubviewToFront(spinner)
    }

    func detach() {
        hideTask?.cancel()
        if let tap { host?.removeGestureRecognizer(tap) }
        button.removeFromSuperview()
        spinner.removeFromSuperview()
    }

    @objc private func tapped() {
        if button.alpha < 0.5 { show() } else { hide() }
    }

    private func show(keep: Bool = false) {
        bringToFront()
        UIView.animate(withDuration: 0.2) { self.button.alpha = 1 }
        button.isUserInteractionEnabled = true
        hideTask?.cancel()
        guard !keep else { return }
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.hide()
        }
    }

    private func hide() {
        hideTask?.cancel()
        UIView.animate(withDuration: 0.25) { self.button.alpha = 0 }
        button.isUserInteractionEnabled = false
    }

    nonisolated func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    nonisolated func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // Les touchers sur le bouton lui-même ouvrent le menu.
        MainActor.assumeIsolated { touch.view !== button && touch.view?.isDescendant(of: button) != true }
    }
}
