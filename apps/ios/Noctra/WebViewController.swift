import UIKit
import WebKit

/// Noctra pour iPhone et iPad.
///
/// L'appli affiche l'écran de connexion partagé (dossier « launcher »), puis
/// charge l'interface web du serveur Noctra choisi dans une WKWebView : même
/// session et mêmes cookies que dans Safari. Le script
/// public/noctra-app-bridge.js du serveur dialogue avec l'appli par le
/// gestionnaire de messages « noctra ».
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let defaults = UserDefaults.standard
    private static let background = UIColor(red: 5 / 255, green: 7 / 255, blue: 17 / 255, alpha: 1)

    private var serverBase: String? {
        guard let value = defaults.string(forKey: "server"), Self.isHttp(value) else { return nil }
        return value
    }

    private var autoConnect: Bool {
        defaults.object(forKey: "auto") as? Bool ?? true
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()
        if #available(iOS 16.4, *) {
            configuration.preferences.isElementFullscreenEnabled = true
        }
        // Agent utilisateur de Safari (détection iOS de Noctra et de Jellyfin) + marqueur de l'appli.
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let system = UIDevice.current.systemVersion.split(separator: ".").prefix(2).joined(separator: ".")
        configuration.applicationNameForUserAgent = "Version/\(system) Mobile/15E148 Safari/604.1 NoctraApp/\(version) (ios)"

        let contentController = WKUserContentController()
        contentController.add(WeakMessageHandler(self), name: "noctra")
        configuration.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = Self.background
        webView.scrollView.backgroundColor = Self.background
        // Noctra gère lui-même les zones sûres (viewport-fit=cover), comme en PWA.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadLauncher(manual: false)
    }

    // MARK: Écran de connexion

    private func loadLauncher(manual: Bool, error: String? = nil) {
        guard let directory = Bundle.main.url(forResource: "launcher", withExtension: nil) else { return }
        let index = directory.appendingPathComponent("index.html")
        var components = URLComponents(url: index, resolvingAgainstBaseURL: false)
        var items = [
            URLQueryItem(name: "platform", value: "ios"),
            URLQueryItem(name: "server", value: serverBase ?? ""),
            URLQueryItem(name: "auto", value: autoConnect ? "1" : "0")
        ]
        if manual { items.append(URLQueryItem(name: "manual", value: "1")) }
        if let error { items.append(URLQueryItem(name: "error", value: error)) }
        components?.queryItems = items
        webView.loadFileURL(components?.url ?? index, allowingReadAccessTo: directory)
    }

    // MARK: Messages du lanceur et du pont web

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        let origin = message.frameInfo.securityOrigin
        let fromLauncher = origin.protocol == "file"
        let fromServer = Self.sameOrigin(origin, serverBase)
        guard fromLauncher || fromServer else { return }
        let data = body["data"]

        switch action {
        case "saveServer":
            guard fromLauncher, let data = data as? [String: Any], let url = data["url"] as? String else { return }
            saveServer(url, auto: data["auto"] as? Bool ?? true)
        case "openServer":
            guard fromLauncher, let data = data as? [String: Any],
                  let base = data["base"] as? String, let target = data["url"] as? String,
                  Self.isHttp(base), let url = URL(string: target), Self.sameOrigin(url, base) else { return }
            saveServer(base, auto: autoConnect)
            webView.load(URLRequest(url: url))
        case "changeServer":
            loadLauncher(manual: true)
        case "keepScreenOn":
            UIApplication.shared.isIdleTimerDisabled = data as? Bool ?? false
        default:
            // « exit » : une appli iOS ne se ferme pas elle-même.
            break
        }
    }

    private func saveServer(_ url: String, auto: Bool) {
        guard Self.isHttp(url) else { return }
        var base = url
        while base.hasSuffix("/") { base.removeLast() }
        defaults.set(base, forKey: "server")
        defaults.set(auto, forKey: "auto")
    }

    // MARK: Navigation

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        let scheme = url.scheme?.lowercased() ?? ""
        let mainFrame = navigationAction.targetFrame?.isMainFrame ?? false

        if scheme == "file" || scheme == "about" || scheme == "blob" || scheme == "data" {
            return decisionHandler(.allow)
        }
        if scheme != "http" && scheme != "https" {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        // Un lien suivi vers un autre site s'ouvre dans Safari ; les
        // redirections du serveur et les iframes restent dans l'appli.
        if mainFrame && navigationAction.navigationType == .linkActivated && !Self.sameOrigin(url, serverBase) {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Redirection du serveur (http → https, autre chemin) : l'adresse réellement servie est gardée.
        guard let url = webView.url?.absoluteString, Self.isHttp(url),
              let range = url.range(of: "/client/index.html") else { return }
        let base = String(url[..<range.lowerBound])
        if base != serverBase { saveServer(base, auto: autoConnect) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        guard let url = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL, Self.sameOrigin(url, serverBase) else { return }
        loadLauncher(manual: true, error: "Impossible de joindre le serveur Noctra. Vérifiez la connexion Internet ou l’adresse du serveur.")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: Fenêtres et boîtes de dialogue

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    // MARK: Outils

    private static func isHttp(_ value: String) -> Bool {
        value.hasPrefix("http://") || value.hasPrefix("https://")
    }

    private static func defaultPort(_ scheme: String?) -> Int {
        scheme?.lowercased() == "https" ? 443 : 80
    }

    private static func sameOrigin(_ url: URL, _ base: String?) -> Bool {
        guard let base, let server = URL(string: base) else { return false }
        return url.scheme?.lowercased() == server.scheme?.lowercased()
            && url.host?.lowercased() == server.host?.lowercased()
            && (url.port ?? defaultPort(url.scheme)) == (server.port ?? defaultPort(server.scheme))
    }

    private static func sameOrigin(_ origin: WKSecurityOrigin, _ base: String?) -> Bool {
        guard let base, let server = URL(string: base) else { return false }
        let port = origin.port == 0 ? defaultPort(origin.protocol) : origin.port
        return origin.protocol.lowercased() == server.scheme?.lowercased()
            && origin.host.lowercased() == server.host?.lowercased()
            && port == (server.port ?? defaultPort(server.scheme))
    }
}

/// Évite le cycle de rétention entre WKUserContentController et le contrôleur.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
