import SwiftUI

/// Connexion : carte Liquid Glass sur l'aurore animée de Noctra.
struct LoginView: View {
    @Environment(Session.self) private var session
    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var working = false
    @State private var error: String?
    @State private var failures = 0
    @State private var appeared = false
    @FocusState private var field: Field?

    enum Field { case server, username, password }

    var body: some View {
        ZStack {
            AuroraBackground(animated: true)
            ScrollView {
                VStack(spacing: 28) {
                    Spacer(minLength: 60)
                    VStack(spacing: 10) {
                        Image(systemName: "sparkles.tv.fill")
                            .font(.system(size: 54, weight: .semibold))
                            .foregroundStyle(LinearGradient(colors: [Theme.accent, Theme.violet], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .symbolEffect(.bounce, value: appeared)
                        Text("Noctra")
                            .font(.system(size: 44, weight: .heavy, design: .rounded))
                        Text("Films, séries et TV en direct")
                            .foregroundStyle(Theme.muted)
                    }
                    .scaleEffect(appeared ? 1 : 0.9)
                    .opacity(appeared ? 1 : 0)

                    GlassEffectContainer(spacing: 14) {
                        VStack(spacing: 14) {
                            input("Serveur", text: $server, icon: "server.rack", field: .server)
                                .keyboardType(.URL)
                                .textContentType(.URL)
                            input("Nom d’utilisateur", text: $username, icon: "person.fill", field: .username)
                                .textContentType(.username)
                            input("Mot de passe", text: $password, icon: "lock.fill", field: .password, secure: true)
                                .textContentType(.password)

                            if let error {
                                Label(error, systemImage: "exclamationmark.triangle.fill")
                                    .font(.footnote)
                                    .foregroundStyle(.orange)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .transition(.move(edge: .top).combined(with: .opacity))
                            }

                            Button {
                                Task { await signIn() }
                            } label: {
                                HStack {
                                    if working { ProgressView().tint(.black) }
                                    Text(working ? "Connexion…" : "Se connecter").fontWeight(.semibold)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.glassProminent)
                            .controlSize(.large)
                            .disabled(working || username.isEmpty)
                        }
                    }
                    .padding(20)
                    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .modifier(Shake(amount: CGFloat(failures)))
                    .padding(.horizontal, 20)
                    .frame(maxWidth: 520)
                    .offset(y: appeared ? 0 : 40)
                    .opacity(appeared ? 1 : 0)

                    Spacer(minLength: 40)
                }
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .sensoryFeedback(.error, trigger: failures)
        .animation(Theme.spring, value: error)
        .onAppear {
            if server.isEmpty { server = session.lastServer }
            withAnimation(.spring(response: 0.7, dampingFraction: 0.78).delay(0.1)) { appeared = true }
        }
    }

    private func input(_ title: String, text: Binding<String>, icon: String, field: Field, secure: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Theme.accent)
                .frame(width: 22)
            Group {
                if secure {
                    SecureField(title, text: text)
                } else {
                    TextField(title, text: text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .focused($field, equals: field)
            .submitLabel(field == .password ? .go : .next)
            .onSubmit {
                switch field {
                case .server: self.field = .username
                case .username: self.field = .password
                case .password: Task { await signIn() }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .glassEffect(.regular.interactive(), in: Capsule())
    }

    private func signIn() async {
        guard !working, !username.isEmpty else { return }
        working = true
        error = nil
        field = nil
        do {
            try await session.signIn(server: server, username: username, password: password)
        } catch {
            self.error = error.localizedDescription
            withAnimation(.spring(response: 0.3, dampingFraction: 0.3)) { failures += 1 }
        }
        working = false
    }
}

/// Secousse de la carte quand la connexion échoue (comme le déverrouillage d'iOS).
struct Shake: GeometryEffect {
    var amount: CGFloat
    var animatableData: CGFloat {
        get { amount }
        set { amount = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 10 * sin(amount * .pi * 4), y: 0))
    }
}
