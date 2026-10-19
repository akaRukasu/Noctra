import SwiftUI

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
                NoctraMark(size: 84)
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
