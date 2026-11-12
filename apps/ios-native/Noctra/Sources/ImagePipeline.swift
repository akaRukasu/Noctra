import ImageIO
import UIKit

/// Images de l'appli : téléchargées une seule fois (cache d'URLSession sur le
/// disque), décodées et réduites hors du fil principal, gardées décodées en
/// mémoire. Le défilement n'attend jamais un décodage d'image.
final class ImagePipeline: @unchecked Sendable {
    static let shared = ImagePipeline()

    private let memory = NSCache<NSURL, UIImage>()
    private let lock = NSLock()
    private var running: [URL: Task<UIImage?, Never>] = [:]
    /// Images reçues mais illisibles ici (SVG, format inconnu) : pas de nouvel essai à chaque défilement.
    private var unreadable: Set<URL> = []
    private let session: URLSession

    private init() {
        memory.totalCostLimit = 160 << 20
        memory.countLimit = 600
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache.shared
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.httpMaximumConnectionsPerHost = 6
        session = URLSession(configuration: configuration)
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: nil) { [weak self] _ in
            self?.memory.removeAllObjects()
        }
    }

    func cached(_ url: URL) -> UIImage? {
        memory.object(forKey: url as NSURL)
    }

    /// Image déjà reçue sans pouvoir être affichée (ex. logo SVG) : la vue montre son remplacement.
    func failed(_ url: URL) -> Bool {
        lock.withLock { unreadable.contains(url) }
    }

    /// Image décodée ; plusieurs vues qui demandent la même image partagent un seul chargement.
    func image(for url: URL, maxPixels: CGFloat = 1600) async -> UIImage? {
        if let image = cached(url) { return image }
        let task: Task<UIImage?, Never> = lock.withLock {
            if let existing = running[url] { return existing }
            let created = Task.detached(priority: .userInitiated) { [session, weak self] () -> UIImage? in
                // Deux essais : un serveur d'images occupé ne laisse plus de case vide.
                for attempt in 0..<2 {
                    if attempt > 0 { try? await Task.sleep(for: .milliseconds(700)) }
                    let data: Data?
                    if url.isFileURL {
                        data = try? Data(contentsOf: url, options: .mappedIfSafe)
                    } else if let (body, response) = try? await session.data(from: url),
                              (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true {
                        data = body
                    } else {
                        data = nil
                    }
                    if let data {
                        if let image = ImagePipeline.decode(data, maxPixels: maxPixels) ?? UIImage(data: data) { return image }
                        // Reçue mais illisible (SVG…) : un second essai donnerait la même chose.
                        self?.lock.withLock { _ = self?.unreadable.insert(url) }
                        return nil
                    }
                    if url.isFileURL { return nil }
                }
                return nil
            }
            running[url] = created
            return created
        }
        let image = await task.value
        lock.withLock { running[url] = nil }
        if let image {
            let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
            memory.setObject(image, forKey: url as NSURL, cost: cost)
        }
        return image
    }

    /// Décodage immédiat (ImageIO) à la taille d'affichage : pas de décodage
    /// différé au moment du dessin, mémoire limitée pour les grandes images.
    private static func decode(_ data: Data, maxPixels: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}
