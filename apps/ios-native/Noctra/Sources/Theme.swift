import SwiftUI

enum Theme {
    static let accent = Color(red: 112 / 255, green: 217 / 255, blue: 194 / 255)
    static let violet = Color(red: 170 / 255, green: 145 / 255, blue: 232 / 255)
    static let blue = Color(red: 114 / 255, green: 185 / 255, blue: 232 / 255)
    static let background = Color(red: 5 / 255, green: 7 / 255, blue: 15 / 255)
    static let surface = Color.white.opacity(0.06)
    static let muted = Color.white.opacity(0.62)

    /// Ressort des interactions (proche de celui du système).
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.82)
}

/// Fond « aurore » de Noctra : dégradé maillé, animé lentement s'il le faut.
struct AuroraBackground: View {
    var animated = false

    var body: some View {
        Group {
            if animated {
                TimelineView(.animation(minimumInterval: 1 / 20)) { timeline in
                    mesh(time: timeline.date.timeIntervalSinceReferenceDate)
                }
            } else {
                mesh(time: 0)
            }
        }
        .ignoresSafeArea()
    }

    private func mesh(time: Double) -> some View {
        let x = Float(0.5 + 0.16 * sin(time * 0.23))
        let y = Float(0.42 + 0.10 * cos(time * 0.19))
        return MeshGradient(
            width: 3,
            height: 3,
            points: [
                SIMD2<Float>(0, 0), SIMD2<Float>(0.5, 0), SIMD2<Float>(1, 0),
                SIMD2<Float>(0, 0.5), SIMD2<Float>(x, y), SIMD2<Float>(1, 0.5),
                SIMD2<Float>(0, 1), SIMD2<Float>(0.5, 1), SIMD2<Float>(1, 1)
            ],
            colors: [
                Color(red: 0.06, green: 0.08, blue: 0.16), Color(red: 0.10, green: 0.07, blue: 0.20), Color(red: 0.04, green: 0.11, blue: 0.14),
                Color(red: 0.04, green: 0.06, blue: 0.11), Theme.accent.opacity(0.20), Theme.violet.opacity(0.22),
                Theme.background, Theme.background, Theme.background
            ]
        )
    }
}

/// Appui « physique » : léger enfoncement à ressort, comme les cartes d'iOS.
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.95

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .brightness(configuration.isPressed ? -0.04 : 0)
            .animation(.spring(response: 0.28, dampingFraction: 0.62), value: configuration.isPressed)
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
