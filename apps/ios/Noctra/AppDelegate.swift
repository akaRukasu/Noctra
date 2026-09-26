import AVFoundation
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Son même en mode silencieux, lecture en arrière-plan et image dans l'image.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 5 / 255, green: 7 / 255, blue: 17 / 255, alpha: 1)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
