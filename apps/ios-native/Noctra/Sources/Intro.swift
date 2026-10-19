import SwiftUI

/// Logo Noctra (public/noctra-mark.svg) dessiné en natif : tuile nuit, « N » en dégradé, point ciel.
struct NoctraMark: View {
    var body: some View {
        Canvas { context, size in
            let scale = min(size.width, size.height) / 64
            context.scaleBy(x: scale, y: scale)
            let tile = Path(roundedRect: CGRect(x: 2, y: 2, width: 60, height: 60), cornerRadius: 18)
            context.fill(tile, with: .radialGradient(Gradient(colors: [Color(hex: 0x242B50), Color(hex: 0x080B17)]),
                                                     center: CGPoint(x: 19, y: 14), startRadius: 0, endRadius: 54))
            var letter = Path()
            letter.move(to: CGPoint(x: 17, y: 45))
            letter.addLine(to: CGPoint(x: 17, y: 19))
            letter.addLine(to: CGPoint(x: 47, y: 45))
            letter.addLine(to: CGPoint(x: 47, y: 19))
            let stops: [Gradient.Stop] = [.init(color: Color(hex: 0x78A8FF), location: 0), .init(color: Color(hex: 0x8B6CFF), location: 0.52),
                                          .init(color: Color(hex: 0xD070FF), location: 1)]
            context.stroke(letter, with: .linearGradient(Gradient(stops: stops), startPoint: CGPoint(x: 9, y: 9), endPoint: CGPoint(x: 55, y: 55)),
                           style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
            context.fill(Path(ellipseIn: CGRect(x: 43, y: 14, width: 8, height: 8)), with: .color(Color(hex: 0x72E8FF)))
        }
    }
}

/// Intro animée à l'ouverture, comme sur le site : le logo arrive en tournant
/// avec un halo violet, « NOCTRA » se resserre en dégradé, puis tout s'efface.
struct NoctraIntro: View {
    var finished: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var markIn = false
    @State private var wordIn = false

    var body: some View {
        // letter-spacing du site : 1,2 em → 0,5 em (police de 22 pt).
        let spacing: CGFloat = wordIn ? 11 : 26.4
        ZStack {
            RadialGradient(colors: [Color(hex: 0x12112A), Theme.background], center: .center, startRadius: 0, endRadius: 420)
                .ignoresSafeArea()
            VStack(spacing: 18) {
                NoctraMark()
                    .frame(width: 84, height: 84)
                    .shadow(color: Theme.violet.opacity(markIn ? 0.9 : 0), radius: 30)
                    .scaleEffect(markIn ? 1 : 0.4)
                    .rotationEffect(.degrees(markIn ? 0 : -12))
                    .opacity(markIn ? 1 : 0)
                Text("NOCTRA")
                    .font(.display(22, .bold))
                    .tracking(spacing)
                    .padding(.leading, spacing)
                    .foregroundStyle(Theme.gradient)
                    .opacity(wordIn ? 1 : 0)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task {
            if reduceMotion {
                markIn = true
                wordIn = true
            } else {
                // cubic-bezier(.2, 1.3, .3, 1) du site : léger rebond du logo.
                withAnimation(.spring(response: 0.8, dampingFraction: 0.62)) { markIn = true }
                withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.9).delay(0.25)) { wordIn = true }
            }
            try? await Task.sleep(for: .seconds(reduceMotion ? 0.4 : 1.25))
            finished()
        }
    }
}
