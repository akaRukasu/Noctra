import SwiftUI
import UIKit

/// Identité visuelle de Noctra Web (« Aurora 2 », public/noctra-aurora.css) :
/// fond nuit, dégradé lilas → rose → ciel, police de titre Sora, liserés
/// dégradés et halos violets. Les comportements restent ceux d'iOS 26.
enum Theme {
    // Jetons de couleur repris de --na-* (noctra-aurora.css).
    static let background = Color(hex: 0x05060D)
    static let ink = Color(hex: 0xF5F3FF)
    static let muted = Color(hex: 0xA9ADC6)
    static let violet = Color(hex: 0xA78BFA)
    static let lilac = Color(hex: 0xC4B5FD)
    static let pink = Color(hex: 0xF0ABFC)
    static let cyan = Color(hex: 0x7DD3FC)
    static let teal = Color(hex: 0x5EEAD4)
    static let deepViolet = Color(hex: 0x8B5CF6)
    static let fuchsia = Color(hex: 0xD946EF)
    /// Texte sombre des boutons en dégradé (#140f2a).
    static let onAccent = Color(hex: 0x140F2A)
    /// Couleur d'accent (contrôles, sélections) : le lilas du site.
    static let accent = lilac
    static let blue = cyan
    static let line = Color(red: 196 / 255, green: 181 / 255, blue: 253 / 255).opacity(0.14)
    static let lineStrong = Color(red: 214 / 255, green: 200 / 255, blue: 255 / 255).opacity(0.28)
    static let surface = Color(red: 16 / 255, green: 18 / 255, blue: 34 / 255).opacity(0.62)

    /// --na-grad : linear-gradient(115deg, #c4b5fd, #f0abfc 42%, #7dd3fc).
    static let gradient = LinearGradient(stops: [.init(color: lilac, location: 0), .init(color: pink, location: 0.42), .init(color: cyan, location: 1)],
                                         startPoint: UnitPoint(x: 0, y: 0.3), endPoint: UnitPoint(x: 1, y: 0.7))
    /// Titres de l'accueil : blanc → lilas → rose → ciel.
    static let titleGradient = LinearGradient(stops: [.init(color: .white, location: 0), .init(color: Color(hex: 0xF5F0FF), location: 0.34),
                                                      .init(color: lilac, location: 0.62), .init(color: pink, location: 0.84), .init(color: cyan, location: 1)],
                                              startPoint: .leading, endPoint: .trailing)
    /// Titres de section : blanc → lilas pâle.
    static let sectionGradient = LinearGradient(colors: [.white, Color(hex: 0xF1EDFF), Color(hex: 0xCDBFFF)], startPoint: .leading, endPoint: .trailing)
    /// Titre de la carte « à l'affiche » : blanc → lavande → bleu pâle.
    static let posterTitleGradient = LinearGradient(stops: [.init(color: .white, location: 0), .init(color: .white, location: 0.4),
                                                            .init(color: Color(hex: 0xE9E2FF), location: 0.7), .init(color: Color(hex: 0xC7D8FF), location: 1)],
                                                    startPoint: .leading, endPoint: .trailing)
    /// Anneau de la carte « à l'affiche ».
    static let ringGradient = LinearGradient(stops: [.init(color: Color(hex: 0xDDD6FE).opacity(0.62), location: 0), .init(color: pink.opacity(0.22), location: 0.35),
                                                     .init(color: cyan.opacity(0.10), location: 0.6), .init(color: cyan.opacity(0.55), location: 1)],
                                             startPoint: .topLeading, endPoint: .bottomTrailing)

    /// Animations : courbes du système (« snappy » d'iOS), pas de ressort maison.
    static let spring = Animation.snappy(duration: 0.4)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: opacity)
    }
}

// MARK: Police Sora (titres)

enum NoctraFont {
    static func name(_ weight: Font.Weight) -> String {
        switch weight {
        case .heavy, .black: return "NoctraSora-ExtraBold"
        case .bold: return "NoctraSora-Bold"
        case .semibold, .medium: return "NoctraSora-SemiBold"
        default: return "NoctraSora-Regular"
        }
    }

    /// Barres de navigation : titres en Sora, comme les titres du site.
    static func applyToNavigationBars() {
        let large = UIFont(name: "NoctraSora-Bold", size: 34) ?? .systemFont(ofSize: 34, weight: .bold)
        let inline = UIFont(name: "NoctraSora-SemiBold", size: 17) ?? .systemFont(ofSize: 17, weight: .semibold)
        let appearance = UINavigationBar.appearance()
        appearance.largeTitleTextAttributes = [.font: large, .foregroundColor: UIColor(Theme.ink), .kern: -0.6]
        appearance.titleTextAttributes = [.font: inline, .foregroundColor: UIColor(Theme.ink)]
    }
}

extension Font {
    /// Police de titre de Noctra (Sora), adaptée à la taille du texte choisie dans iOS.
    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(NoctraFont.name(weight), size: size, relativeTo: style)
    }
}

// MARK: Fond « aurore »

/// Teintes d'un espace (comme les panneaux du site : TV en vert d'eau, demandes en pêche…).
struct AuroraPalette {
    let k1: Color
    let k2: Color
    let k3: Color

    static let main = AuroraPalette(k1: Theme.lilac, k2: Theme.pink, k3: Theme.cyan)
    static let tv = AuroraPalette(k1: Theme.teal, k2: Theme.cyan, k3: Theme.lilac)
    static let requests = AuroraPalette(k1: Color(hex: 0xFDBA74), k2: Color(hex: 0xF9A8D4), k3: Theme.lilac)
    static let roulette = AuroraPalette(k1: Color(hex: 0xFCD34D), k2: Color(hex: 0xFDA4AF), k3: Theme.lilac)
}

/// Fond du site : nuit #05060d, quatre nappes de lumière (violet, ciel, fuchsia,
/// vert d'eau) et poussière d'étoiles qui s'efface vers le bas.
struct AuroraBackground: View {
    var animated = false
    var palette: AuroraPalette = .main

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let unit = max(size.width, size.height)
            ZStack {
                Theme.background
                RadialGradient(colors: [Color(red: 76 / 255, green: 29 / 255, blue: 149 / 255).opacity(0.22), .clear],
                               center: UnitPoint(x: 0.5, y: 1.2), startRadius: 0, endRadius: unit * 0.7)
                RadialGradient(colors: [Color(red: 30 / 255, green: 27 / 255, blue: 75 / 255).opacity(0.6), .clear],
                               center: UnitPoint(x: 0.5, y: -0.1), startRadius: 0, endRadius: unit * 0.55)
                if animated {
                    TimelineView(.animation(minimumInterval: 1 / 20)) { timeline in
                        blobs(unit: unit, time: timeline.date.timeIntervalSinceReferenceDate)
                    }
                } else {
                    blobs(unit: unit, time: 0)
                }
                StarDust()
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black.opacity(0.5), location: 0.55), .init(color: .clear, location: 1)],
                                         startPoint: .top, endPoint: .bottom))
                    .opacity(0.55)
            }
            // Sept nappes plein écran réunies en une seule image : rien à
            // recomposer à chaque image pendant le défilement.
            .drawingGroup()
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private func blobs(unit: CGFloat, time: Double) -> some View {
        let drift = CGFloat(sin(time * 0.18)) * 0.03
        return ZStack {
            blob(palette.k1 == Theme.lilac ? Color(red: 139 / 255, green: 92 / 255, blue: 246 / 255) : palette.k1, opacity: 0.36,
                 at: UnitPoint(x: 0.18 + drift, y: 0.22), radius: unit * 0.38)
            blob(palette.k3 == Theme.cyan ? Color(red: 56 / 255, green: 189 / 255, blue: 248 / 255) : palette.k3, opacity: 0.24,
                 at: UnitPoint(x: 0.82 - drift, y: 0.16), radius: unit * 0.34)
            blob(palette.k2 == Theme.pink ? Color(red: 217 / 255, green: 70 / 255, blue: 239 / 255) : palette.k2, opacity: 0.20,
                 at: UnitPoint(x: 0.70, y: 0.82 + drift), radius: unit * 0.40)
            blob(Color(red: 45 / 255, green: 212 / 255, blue: 191 / 255), opacity: 0.14,
                 at: UnitPoint(x: 0.12, y: 0.86), radius: unit * 0.30)
        }
    }

    private func blob(_ color: Color, opacity: Double, at center: UnitPoint, radius: CGFloat) -> some View {
        RadialGradient(colors: [color.opacity(opacity), .clear], center: center, startRadius: 0, endRadius: radius)
    }
}

/// Poussière d'étoiles statique (motif du site, répété).
struct StarDust: View {
    private static let stars: [(x: CGFloat, y: CGFloat, r: CGFloat, color: Color)] = [
        (0.12, 0.18, 1.0, .white.opacity(0.6)), (0.72, 0.12, 1.0, .white.opacity(0.53)), (0.38, 0.62, 1.4, Color(hex: 0xE9E3FF).opacity(0.6)),
        (0.86, 0.48, 1.0, .white.opacity(0.47)), (0.22, 0.84, 1.2, Color(hex: 0xDBEAFE).opacity(0.53)), (0.58, 0.32, 1.0, .white.opacity(0.4)),
        (0.92, 0.88, 1.3, Color(hex: 0xF5D0FE).opacity(0.53)), (0.04, 0.52, 1.0, .white.opacity(0.4))
    ]

    var body: some View {
        Canvas { context, size in
            let tile: CGFloat = 310
            var y: CGFloat = 0
            while y < size.height {
                var x: CGFloat = 0
                while x < size.width {
                    for star in Self.stars {
                        let rect = CGRect(x: x + star.x * tile - star.r, y: y + star.y * tile - star.r, width: star.r * 2, height: star.r * 2)
                        context.fill(Path(ellipseIn: rect), with: .color(star.color))
                    }
                    x += tile
                }
                y += tile
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: Logo, titres, pastilles

/// Logo de Noctra (public/noctra-mark.svg) dessiné nativement.
struct NoctraMark: View {
    var size: CGFloat = 64

    var body: some View {
        Canvas { context, canvas in
            let scale = canvas.width / 64
            context.scaleBy(x: scale, y: scale)
            let tile = Path(roundedRect: CGRect(x: 2, y: 2, width: 60, height: 60), cornerRadius: 18)
            context.fill(tile, with: .radialGradient(Gradient(colors: [Color(hex: 0x242B50), Color(hex: 0x080B17)]),
                                                     center: CGPoint(x: 19, y: 14), startRadius: 0, endRadius: 54))
            var letter = Path()
            letter.move(to: CGPoint(x: 17, y: 45))
            letter.addLine(to: CGPoint(x: 17, y: 19))
            letter.addLine(to: CGPoint(x: 47, y: 45))
            letter.addLine(to: CGPoint(x: 47, y: 19))
            context.stroke(letter, with: .linearGradient(Gradient(stops: [.init(color: Color(hex: 0x78A8FF), location: 0), .init(color: Color(hex: 0x8B6CFF), location: 0.52),
                                                                         .init(color: Color(hex: 0xD070FF), location: 1)]),
                                                        startPoint: CGPoint(x: 9, y: 9), endPoint: CGPoint(x: 55, y: 55)),
                           style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
            context.fill(Path(ellipseIn: CGRect(x: 43, y: 14, width: 8, height: 8)), with: .color(Color(hex: 0x72E8FF)))
        }
        .frame(width: size, height: size)
        .shadow(color: Theme.violet.opacity(0.7), radius: size / 8)
    }
}

/// Titre de section du site : dégradé discret et trait lumineux dessous.
struct SectionTitle: View {
    let text: String
    var detail: String?

    init(_ text: String, detail: String? = nil) {
        self.text = text
        self.detail = detail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(text)
                    .font(.display(21, .bold, relativeTo: .title3))
                    .kerning(-0.4)
                    .foregroundStyle(Theme.sectionGradient)
                if let detail {
                    Text(detail).font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            Capsule()
                .fill(Theme.gradient)
                .frame(width: 44, height: 3)
                .shadow(color: Theme.lilac.opacity(0.7), radius: 7)
        }
    }
}

/// Pastille « œil » des cartes du site (point vert d'eau lumineux).
struct Eyebrow: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Theme.teal)
                .frame(width: 7, height: 7)
                .shadow(color: Theme.teal.opacity(0.9), radius: 6)
                .overlay(Circle().stroke(Theme.teal.opacity(0.18), lineWidth: 3).frame(width: 13, height: 13))
            Text(text)
                .font(.caption.weight(.bold))
                .tracking(1.6)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .glassEffect(.regular.tint(Color(hex: 0x0F1122).opacity(0.4)), in: Capsule())
        .overlay(Capsule().stroke(Color(hex: 0xDDD6FE).opacity(0.28), lineWidth: 1))
        .shadow(color: Theme.violet.opacity(0.5), radius: 10, y: 6)
    }
}

// MARK: Boutons et cartes

extension View {
    /// Bouton principal : verre « prominent » natif d'iOS 26 (reflet sous le
    /// doigt, déformation, fusion avec les boutons voisins), teinté du lilas
    /// du site avec son texte sombre et son halo violet.
    func auroraPrimary() -> some View {
        buttonStyle(.glassProminent)
            .tint(Theme.lilac)
            .foregroundStyle(Theme.onAccent)
            .shadow(color: Theme.violet.opacity(0.55), radius: 16, y: 8)
            .shadow(color: Theme.cyan.opacity(0.25), radius: 10, y: 3)
    }

    /// Bouton secondaire : verre natif d'iOS 26.
    func auroraSecondary() -> some View {
        buttonStyle(.glass)
    }
}

/// Appui des cartes : léger enfoncement au ressort du système (comme l'App Store).
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.96

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(configuration.isPressed ? .snappy(duration: 0.18) : .bouncy(duration: 0.38, extraBounce: 0.08), value: configuration.isPressed)
    }
}

extension View {
    /// Image d'une carte du site : liseré lilas très fin, ombre profonde.
    /// L'ombre est celle d'une forme pleine placée derrière l'image (tracé
    /// connu d'avance) : pas de rendu hors écran de l'image à chaque défilement.
    func auroraCard(cornerRadius: CGFloat = 18) -> some View {
        overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).stroke(Color(hex: 0xDDD6FE).opacity(0.10), lineWidth: 1))
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.black)
                    .shadow(color: .black.opacity(0.9), radius: 15, y: 14)
            }
    }

    /// Anneau dégradé et halo ambiant de la carte « à l'affiche », avec la lueur qui tourne (9 s).
    func auroraRing(cornerRadius: CGFloat = 30, orbit: Bool = true) -> some View {
        modifier(AuroraRing(cornerRadius: cornerRadius, orbit: orbit))
    }

    /// Bordure dégradée d'un panneau (verre de nuit + liseré lilas → ciel).
    func auroraPanel(cornerRadius: CGFloat = 24, palette: AuroraPalette = .main) -> some View {
        background(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(Color(hex: 0x0C0F1F).opacity(0.72)))
            .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(LinearGradient(colors: [palette.k1.opacity(0.5), .white.opacity(0.05), palette.k3.opacity(0.4)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1))
    }
}

/// Anneau de la carte « à l'affiche ». Les halos sont dessinés une fois sur
/// une forme fixe ; seule la lueur fine de l'anneau tourne, et seulement
/// quand c'est demandé (page visible du carrousel), jamais en mode économie
/// d'énergie ni avec « Réduire les animations ».
struct AuroraRing: ViewModifier {
    let cornerRadius: CGFloat
    let orbit: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var spinning: Bool { orbit && !reduceMotion && !ProcessInfo.processInfo.isLowPowerModeEnabled }

    func body(content: Content) -> some View {
        content
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .padding(2)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius + 2, style: .continuous).fill(Theme.ringGradient)
                    if spinning {
                        TimelineView(.animation(minimumInterval: 1 / 30)) { timeline in
                            let angle = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 9) / 9 * 360
                            RoundedRectangle(cornerRadius: cornerRadius + 2, style: .continuous)
                                .fill(AngularGradient(stops: [.init(color: .clear, location: 0), .init(color: .clear, location: 0.55),
                                                              .init(color: Theme.lilac, location: 0.74), .init(color: Theme.pink, location: 0.85),
                                                              .init(color: Theme.cyan, location: 0.95), .init(color: .clear, location: 1)],
                                                      center: .center, angle: .degrees(angle)))
                        }
                    }
                }
            }
            .background {
                // Halos violet et ciel : formes fixes, ombre calculée une fois.
                ZStack {
                    RoundedRectangle(cornerRadius: cornerRadius + 2, style: .continuous)
                        .fill(Color(hex: 0x0C0F1F))
                        .shadow(color: Color(red: 124 / 255, green: 58 / 255, blue: 237 / 255).opacity(0.55), radius: 40, y: 30)
                    RoundedRectangle(cornerRadius: cornerRadius + 2, style: .continuous)
                        .fill(Color(hex: 0x0C0F1F))
                        .shadow(color: Color(red: 14 / 255, green: 165 / 255, blue: 233 / 255).opacity(0.35), radius: 26, y: 16)
                }
                .padding(60)
                .drawingGroup()
                .padding(-60)
                .allowsHitTesting(false)
            }
    }
}

extension EnvironmentValues {
    /// Espace des transitions zoom (affiche → fiche) de la pile en cours.
    @Entry var zoomNamespace: Namespace.ID? = nil
}

extension View {
    /// Source d'une transition zoom vers la fiche, si la pile en propose une.
    @ViewBuilder
    func zoomSource(id: String, in namespace: Namespace.ID?) -> some View {
        if let namespace {
            matchedTransitionSource(id: id, in: namespace) { source in
                source.clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        } else {
            self
        }
    }
}
