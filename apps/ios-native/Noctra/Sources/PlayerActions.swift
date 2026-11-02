import AVFoundation
import AVKit
import UIKit

/// Générique marqué dans le titre (début, récap, aperçu, générique de fin), en secondes.
struct MediaMarker: Hashable {
    enum Kind: String { case intro, outro, recap, preview }
    let kind: Kind
    let start: Double
    let end: Double

    /// Texte du bouton (jamais « Jellyfin »).
    var label: String {
        switch kind {
        case .intro: return "Passer le générique"
        case .outro: return "Passer le générique de fin"
        case .recap: return "Passer le récap"
        case .preview: return "Passer l’aperçu"
        }
    }

    /// Marqueur en cours à cette position (bouton retiré 1,5 s avant sa fin).
    func covers(_ position: Double) -> Bool { position >= start - 0.5 && position < end - 1.5 }
}

/// Marqueurs réellement fournis, par ordre de préférence : segments du serveur
/// Jellyfin (/MediaSegments : extension de détection ou segments créés depuis
/// les chapitres), sinon chapitres nommés du fichier (« Intro », « Opening »,
/// « Générique de fin »…). Aucune durée fixe ni détection approximative : sans
/// marqueur, pas de bouton.
enum Markers {
    private static let serverKinds: [String: MediaMarker.Kind] = ["Intro": .intro, "Outro": .outro, "Recap": .recap, "Preview": .preview]

    static func fromServer(_ data: Data) -> [MediaMarker] {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let items = root["Items"] as? [[String: Any]] else { return [] }
        return items.compactMap { segment -> MediaMarker? in
            guard let kind = serverKinds[segment["Type"] as? String ?? ""],
                  let start = (segment["StartTicks"] as? NSNumber)?.doubleValue,
                  let end = (segment["EndTicks"] as? NSNumber)?.doubleValue, end > start else { return nil }
            return MediaMarker(kind: kind, start: start / 10_000_000, end: end / 10_000_000)
        }.sorted { $0.start < $1.start }
    }

    static func kind(ofChapter raw: String) -> MediaMarker.Kind? {
        let name = raw.trimmingCharacters(in: .whitespaces)
        func has(_ pattern: String) -> Bool { name.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil }
        if has("(end ?credits|credits|crédits|ending|outro|générique de fin|generique de fin)") || has("^ed[0-9]*$") { return .outro }
        if has("(^intro|introduction|opening|générique|generique|ouverture)") || has("^op[0-9]*$") { return .intro }
        if has("(recap|récap|previously|précédemment)") { return .recap }
        if has("(preview|aperçu|prochainement|next time)") { return .preview }
        return nil
    }

    /// Chapitres nommés : du début du chapitre au suivant (5 s à 15 min).
    static func fromChapters(_ data: Data) -> [MediaMarker] {
        guard let item = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        let chapters = ((item["Chapters"] as? [[String: Any]]) ?? [])
            .compactMap { chapter -> (String, Double)? in
                guard let ticks = (chapter["StartPositionTicks"] as? NSNumber)?.doubleValue else { return nil }
                return ((chapter["Name"] as? String) ?? "", ticks / 10_000_000)
            }
            .sorted { $0.1 < $1.1 }
        let runtime = ((item["RunTimeTicks"] as? NSNumber)?.doubleValue ?? 0) / 10_000_000
        var out: [MediaMarker] = []
        for (index, chapter) in chapters.enumerated() {
            guard let kind = kind(ofChapter: chapter.0) else { continue }
            let end = index + 1 < chapters.count ? chapters[index + 1].1 : runtime
            if end - chapter.1 >= 5 && end - chapter.1 <= 15 * 60 { out.append(MediaMarker(kind: kind, start: chapter.1, end: end)) }
        }
        return out
    }

    /// Marqueurs du titre (vide sans marqueur). Chargés pendant la lecture :
    /// aucune attente avant le démarrage.
    @MainActor
    static func load(_ item: BaseItem, session: Session) async -> [MediaMarker] {
        if let data = try? await session.data("GET", "/MediaSegments/\(item.id)") {
            let server = fromServer(data)
            if !server.isEmpty { return server }
        }
        guard let user = session.userId, let data = try? await session.data("GET", "/Users/\(user)/Items/\(item.id)", ["Fields": "Chapters"]) else { return [] }
        return fromChapters(data)
    }

    /// Épisode qui suit dans la série (ordre de Jellyfin), ou nil.
    @MainActor
    static func nextEpisode(_ item: BaseItem, session: Session) async -> BaseItem? {
        guard item.type == "Episode", let series = item.seriesId else { return nil }
        guard let data = try? await session.data("GET", "/Shows/\(series)/Episodes", ["UserId": session.userId, "StartItemId": item.id, "Limit": "2"]),
              let list = try? JSONDecoder.jellyfin.decode(ItemsResponse.self, from: data).items else { return nil }
        func plain(_ id: String) -> String { id.replacingOccurrences(of: "-", with: "").lowercased() }
        guard let first = list.first, plain(first.id) == plain(item.id), list.count > 1 else { return nil }
        return list[1]
    }
}

/// Commandes ajoutées au lecteur d'Apple : −15 s / +15 s (avec retour visuel
/// cumulé) et « Épisode suivant ». Apparaissent avec les commandes (toucher).
/// En direct : ±15 s seulement si le flux a une vraie fenêtre de retour.
final class PlayerActionsBar: NSObject, UIGestureRecognizerDelegate {
    private let stack = UIStackView()
    private let back = UIButton(type: .system)
    private let forward = UIButton(type: .system)
    private let next = UIButton(type: .system)
    private let note = UILabel()
    private var tap: UITapGestureRecognizer?
    private weak var host: UIView?
    private var hideTask: Task<Void, Never>?
    private var noteTask: Task<Void, Never>?
    private var total: Double = 0
    private var lastSeek = Date.distantPast
    var onSeek: ((Double) -> Double?)?
    var onNext: (() -> Void)?

    func attach(to controller: AVPlayerViewController) {
        controller.loadViewIfNeeded()
        guard let host = controller.view else { return }
        self.host = host
        func style(_ button: UIButton, _ symbol: String?, _ title: String?, _ label: String) {
            var config = UIButton.Configuration.glass()
            if let symbol { config.image = UIImage(systemName: symbol) }
            config.title = title
            config.imagePadding = 6
            config.cornerStyle = .capsule
            config.contentInsets = NSDirectionalEdgeInsets(top: 11, leading: 14, bottom: 11, trailing: 14)
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
                var updated = attributes
                updated.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
                return updated
            }
            button.configuration = config
            button.tintColor = .white
            button.accessibilityLabel = label
        }
        style(back, "gobackward.15", nil, "Reculer de 15 secondes")
        style(forward, "goforward.15", nil, "Avancer de 15 secondes")
        style(next, "forward.end.fill", "Épisode suivant", "Épisode suivant")
        back.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        forward.addTarget(self, action: #selector(forwardTapped), for: .touchUpInside)
        next.addTarget(self, action: #selector(nextTapped), for: .touchUpInside)
        next.isHidden = true
        stack.axis = .horizontal
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        [back, forward, next].forEach { stack.addArrangedSubview($0) }
        note.font = UIFont.monospacedDigitSystemFont(ofSize: 20, weight: .bold)
        note.textColor = .white
        note.textAlignment = .center
        note.backgroundColor = UIColor(white: 0.04, alpha: 0.8)
        note.layer.cornerRadius = 14
        note.layer.masksToBounds = true
        note.alpha = 0
        note.translatesAutoresizingMaskIntoConstraints = false
        note.isAccessibilityElement = true
        host.addSubview(stack)
        host.addSubview(note)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: host.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            stack.topAnchor.constraint(equalTo: host.safeAreaLayoutGuide.topAnchor, constant: 68),
            note.centerXAnchor.constraint(equalTo: host.centerXAnchor),
            note.centerYAnchor.constraint(equalTo: host.centerYAnchor, constant: -90),
            note.heightAnchor.constraint(equalToConstant: 44),
            note.widthAnchor.constraint(greaterThanOrEqualToConstant: 150)
        ])
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        host.addGestureRecognizer(tap)
        self.tap = tap
        show()
    }

    /// ±15 s visibles (titre, ou direct avec fenêtre) ; « Épisode suivant » s'il existe.
    func update(canSeek: Bool, hasNext: Bool) {
        if back.isHidden == canSeek { back.isHidden = !canSeek; forward.isHidden = !canSeek }
        if next.isHidden == hasNext { next.isHidden = !hasNext }
    }

    func detach() {
        hideTask?.cancel()
        noteTask?.cancel()
        if let tap { host?.removeGestureRecognizer(tap) }
        stack.removeFromSuperview()
        note.removeFromSuperview()
    }

    @objc private func backTapped() { seek(-15) }
    @objc private func forwardTapped() { seek(15) }
    @objc private func nextTapped() { onNext?() }

    private func seek(_ delta: Double) {
        show()
        // onSeek renvoie le déplacement réel (borné au titre ou à la fenêtre du direct).
        guard let moved = onSeek?(delta) else { return }
        let now = Date()
        total = now.timeIntervalSince(lastSeek) < 1.5 && (total < 0) == (delta < 0) ? total + moved : moved
        lastSeek = now
        let seconds = Int(abs(total).rounded())
        note.text = (delta < 0 ? "  ⟲ " : "  ⟳ ") + (seconds == 0 ? (delta < 0 ? "Début" : "Fin") : (total < 0 ? "−" : "+") + "\(seconds) s") + "  "
        UIAccessibility.post(notification: .announcement, argument: note.text)
        host?.bringSubviewToFront(note)
        note.alpha = 1
        noteTask?.cancel()
        noteTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            self?.hideNote()
        }
    }

    private func hideNote() {
        UIView.animate(withDuration: 0.25) { self.note.alpha = 0 }
    }

    @objc private func tapped() {
        if stack.alpha < 0.5 { show() } else { hide() }
    }

    private func show() {
        host?.bringSubviewToFront(stack)
        UIView.animate(withDuration: 0.2) { self.stack.alpha = 1 }
        stack.isUserInteractionEnabled = true
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.hide()
        }
    }

    private func hide() {
        hideTask?.cancel()
        UIView.animate(withDuration: 0.25) { self.stack.alpha = 0 }
        stack.isUserInteractionEnabled = false
    }

    nonisolated func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    nonisolated func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        MainActor.assumeIsolated { touch.view?.isDescendant(of: stack) != true }
    }
}
