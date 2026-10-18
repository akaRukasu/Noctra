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

    /// Image décodée ; plusieurs vues qui demandent la même image partagent un seul chargement.
    func image(for url: URL, maxPixels: CGFloat = 1600) async -> UIImage? {
        if let image = cached(url) { return image }
        let task: Task<UIImage?, Never> = lock.withLock {
            if let existing = running[url] { return existing }
            let created = Task.detached(priority: .userInitiated) { [session] () -> UIImage? in
                let data: Data?
                if url.isFileURL {
                    data = try? Data(contentsOf: url, options: .mappedIfSafe)
                } else {
                    data = try? await session.data(from: url).0
                }
                guard let data else { return nil }
                return ImagePipeline.decode(data, maxPixels: maxPixels)
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
