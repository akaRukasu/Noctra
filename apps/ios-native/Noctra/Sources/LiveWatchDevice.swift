import SwiftUI
import WebKit

/// Compte LiveWatch ouvert sur cet appareil, comme dans un navigateur : le lecteur officiel
/// LiveWatch lit alors la chaîne avec ce compte (VIP, sans publicité) et c'est l'appareil, pas le
/// serveur Noctra, qui demande le flux. Ne dépend d'aucune fonction du serveur.
enum LiveWatchDevice {
    private static let key = "noctra.livewatch.device"
    static let site = URL(string: "https://livewatch.icu/")!

    static var enabled: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }

    static func isLiveWatchHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return ["livewatch.icu", "livewatch.top"].contains { host == $0 || host.hasSuffix("." + $0) }
    }

    /// Lecteur officiel d'une chaîne (…/embed/…) sur le domaine actuel de LiveWatch.
    static func embedURL(_ value: String?) -> URL? {
        guard let value, var parts = URLComponents(string: value), isLiveWatchHost(parts.host), parts.path.hasPrefix("/embed/") else { return nil }
        parts.scheme = "https"
        parts.host = site.host
        return parts.url
    }

    /// Lecteur officiel déduit du résolveur VIP du serveur (/api/tv/livewatch/resolve/<famille>/<id>)
    /// quand la fiche ne donne pas l'adresse du lecteur.
    static func resolverEmbed(_ resolver: String?) -> URL? {
        guard let resolver, let range = resolver.range(of: "/api/tv/livewatch/resolve/(main|daddy|north|frame)/[^?/]+", options: .regularExpression) else { return nil }
        let parts = resolver[range].split(separator: "/").suffix(2).map(String.init)
        guard parts.count == 2 else { return nil }
        return URL(string: site.absoluteString + "embed/" + (parts[0] == "main" ? "" : parts[0] + "/") + parts[1])
    }

    /// Session Supabase du site LiveWatch présente dans la page (stockage local ou cookie).
    static let loggedInScript = """
    (function(){try{var k=Object.keys(localStorage);for(var i=0;i<k.length;i++){if(/^sb-.*-auth-token/.test(k[i])&&localStorage.getItem(k[i]))return true}}catch(e){}
    return /(?:^|;\\s*)sb-[^=]*-auth-token/.test(document.cookie)})()
    """

    /// Lecteurs « mon compte » d'une fiche de chaîne LiveWatch : la chaîne et ses variantes publiées.
    static func servers(_ raw: [String: Any], prefix: String, provider: String) -> [LiveServer] {
        guard enabled else { return [] }
        var pages: [(String, URL)] = []
        if let main = [raw["vipFallbackUrl"], raw["externalUrl"], raw["embedUrl"]].compactMap({ embedURL($0 as? String) }).first ?? resolverEmbed(raw["resolverUrl"] as? String) {
            pages.append(("mon compte LiveWatch", main))
        }
        for variant in (raw["liveWatchVariants"] as? [[String: Any]]) ?? [] {
            guard let url = [variant["externalUrl"], variant["embedUrl"]].compactMap({ embedURL($0 as? String) }).first else { continue }
            pages.append(((variant["label"] as? String).flatMap { $0.isEmpty ? nil : $0 }.map { $0 + " · mon compte" } ?? "variante · mon compte", url))
        }
        var seen: Set<String> = []
        return pages.filter { seen.insert($0.1.absoluteString).inserted }.prefix(12).map { name, url in
            var server = LiveServer(label: prefix + " · " + name, provider: provider, kind: .web, pageURL: url, vip: true)
            server.framed = false
            server.sandbox = nil
            server.device = true
            return server
        }
    }

    /// Données du site LiveWatch effacées de l'appareil (déconnexion).
    @MainActor
    static func signOut() async {
        let store = WKWebsiteDataStore.default()
        let records = await store.dataRecords(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes())
        let targets = records.filter { $0.displayName.lowercased().contains("livewatch") }
        await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), for: targets)
        enabled = false
    }
}

/// Réglage « LiveWatch sur cet appareil » : connexion au site, état, utilisation pour la TV.
struct LiveWatchDeviceView: View {
    @State private var enabled = LiveWatchDevice.enabled
    @State private var signingIn = false
    @State private var note: String?

    var body: some View {
        List {
            Section {
                Button { signingIn = true } label: { Label("Se connecter sur LiveWatch", systemImage: "person.crop.circle.badge.checkmark") }
                Toggle("Utiliser ce compte pour la TV", isOn: $enabled)
                    .onChange(of: enabled) { _, value in LiveWatchDevice.enabled = value }
                if let note { Text(note).foregroundStyle(Theme.accent) }
            } header: {
                Text("LiveWatch sur cet appareil")
            } footer: {
                Text("Connectez-vous avec votre compte LiveWatch VIP comme sur le site. Les chaînes LiveWatch proposent alors « mon compte LiveWatch » : le lecteur officiel, sans publicité, lu directement par cet appareil.")
            }
            Section {
                Button("Se déconnecter de LiveWatch sur cet appareil", role: .destructive) {
                    Task {
                        await LiveWatchDevice.signOut()
                        enabled = false
                        note = "Compte LiveWatch retiré de cet appareil."
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .tv))
        .navigationTitle("LiveWatch")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $signingIn) {
            LiveWatchLoginSheet { loggedIn in
                if loggedIn {
                    enabled = true
                    LiveWatchDevice.enabled = true
                    note = "Compte LiveWatch connecté : il sera proposé en premier sur les chaînes LiveWatch."
                } else {
                    note = "Connexion non détectée. Si vous êtes bien connecté sur le site, activez « Utiliser ce compte pour la TV »."
                }
            }
        }
    }
}

/// Site LiveWatch dans l'appli : la session reste dans les données web de l'appareil.
struct LiveWatchLoginSheet: View {
    let onDone: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var holder = WebViewHolder()

    final class WebViewHolder { var view: WKWebView? }

    var body: some View {
        NavigationStack {
            LoginWebView(holder: holder)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle("LiveWatch")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Terminé") {
                            guard let view = holder.view else { onDone(false); dismiss(); return }
                            view.evaluateJavaScript(LiveWatchDevice.loggedInScript) { result, _ in
                                onDone(result as? Bool == true)
                                dismiss()
                            }
                        }
                    }
                }
        }
    }

    private struct LoginWebView: UIViewRepresentable {
        let holder: WebViewHolder
        func makeUIView(context: Context) -> WKWebView {
            let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
            // Même navigateur que le lecteur des chaînes (session reconnue par le lecteur officiel).
            view.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
            view.allowsBackForwardNavigationGestures = true
            view.load(URLRequest(url: LiveWatchDevice.site))
            holder.view = view
            return view
        }
        func updateUIView(_ uiView: WKWebView, context: Context) {}
    }
}
