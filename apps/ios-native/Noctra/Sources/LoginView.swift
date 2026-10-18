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
                        NoctraMark(size: 84)
                            .scaleEffect(appeared ? 1 : 0.7)
                        Text("Noctra")
                            .font(.display(46, .bold, relativeTo: .largeTitle))
                            .kerning(-1.4)
                            .foregroundStyle(LinearGradient(stops: [.init(color: .white, location: 0), .init(color: Color(hex: 0xF5F0FF), location: 0.4),
                                                                    .init(color: Theme.lilac, location: 0.75), .init(color: Theme.cyan, location: 1)],
                                                            startPoint: .leading, endPoint: .trailing))
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
                            .buttonStyle(.aurora)
                            .controlSize(.large)
                            .disabled(working || username.isEmpty)
                        }
                    }
                    .padding(20)
                    .glassEffect(.regular.tint(Color(hex: 0x0C0E1C).opacity(0.5)), in: RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous)
                        .stroke(LinearGradient(colors: [Color(hex: 0xDDD6FE).opacity(0.6), .white.opacity(0.05), Theme.cyan.opacity(0.45)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1))
                    .shadow(color: Theme.deepViolet.opacity(0.55), radius: 40, y: 24)
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
        .glassEffect(.regular.tint(Color(hex: 0x0C0E1C).opacity(0.6)).interactive(), in: Capsule())
        .overlay(Capsule().stroke(Color(hex: 0xDDD6FE).opacity(self.field == field ? 0.65 : 0.20), lineWidth: 1))
        .shadow(color: Theme.violet.opacity(self.field == field ? 0.55 : 0), radius: 14, y: 8)
        .animation(Theme.spring, value: self.field)
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
