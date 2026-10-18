import SwiftUI
import UIKit

// Tableau de bord complet, en natif : toutes les rubriques d'administration
// du serveur (réglages, transcodage, réseau, médiathèques, appareils, clés,
// extensions, tâches, activité, journaux) et la TV en direct de Noctra.

/// Accueil de l'administration (comme les Réglages d'iOS).
struct AdminHomeView: View {
    @Environment(Session.self) private var session

    var body: some View {
        List {
            Section("Serveur") {
                link("Vue d’ensemble", "gauge.with.dots.needle.67percent", Theme.lilac) { AdminDashboardView() }
                link("Paramètres généraux", "gearshape.fill", Theme.cyan) { ConfigFormView(title: "Paramètres généraux", path: "/System/Configuration", sections: AdminForms.general) }
                link("Lecture et transcodage", "film.stack.fill", Theme.pink) { ConfigFormView(title: "Lecture et transcodage", path: "/System/Configuration/encoding", sections: AdminForms.encoding) }
                link("Réseau", "network", Theme.teal) {
                    ConfigFormView(title: "Réseau", path: "/System/Configuration/network", sections: AdminForms.network,
                                   warning: "Une erreur ici peut rendre le serveur injoignable. Les changements s’appliquent après un redémarrage du serveur.")
                }
                link("Personnalisation", "paintbrush.fill", Color(hex: 0xFCD34D)) { ConfigFormView(title: "Personnalisation", path: "/System/Configuration/branding", sections: AdminForms.branding) }
            }
            Section("Contenu") {
                link("Médiathèques", "square.stack.fill", Theme.lilac) { LibrariesAdminView() }
                link("Tâches planifiées", "clock.arrow.2.circlepath", Theme.cyan) { ScheduledTasksView() }
                if session.hasNoctra {
                    link("Téléchargements", "arrow.down.circle.fill", Color(hex: 0xFDBA74)) { DownloadsView() }
                    link("TV en direct et accès VIP", "dot.radiowaves.left.and.right", Theme.teal) { LiveAdminView() }
                }
            }
            Section("Comptes et appareils") {
                link("Utilisateurs", "person.2.fill", Theme.pink) { UsersAdminView() }
                link("Appareils", "iphone.gen3", Theme.cyan) { DevicesAdminView() }
                link("Clés d’API", "key.fill", Color(hex: 0xFCD34D)) { ApiKeysView() }
            }
            Section("Extensions") {
                link("Extensions installées", "puzzlepiece.extension.fill", Theme.lilac) { PluginsView() }
                link("Catalogue", "square.grid.2x2.fill", Theme.teal) { PluginCatalogView() }
                link("Dépôts", "shippingbox.fill", Theme.cyan) { RepositoriesView() }
            }
            Section("Surveillance") {
                link("Activité", "list.bullet.rectangle.fill", Theme.pink) { ActivityView() }
                link("Journaux", "doc.text.fill", Theme.muted) { LogsView() }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Tableau de bord")
    }

    private func link<Destination: View>(_ title: String, _ icon: String, _ color: Color, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink {
            destination()
        } label: {
            Label {
                Text(title)
            } icon: {
                Image(systemName: icon)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 28, height: 28)
                    .background(color.gradient, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            }
        }
    }
}

// MARK: Formulaire de réglages générique

struct ConfigField: Identifiable {
    enum Kind {
        case toggle
        case number(suffix: String)
        case decimal
        case text
        case textArea
        case choice([(String, String)])
        case readOnly
    }

    let key: String
    let label: String
    let kind: Kind
    var id: String { key }

    init(_ key: String, _ label: String, _ kind: Kind = .toggle) {
        self.key = key
        self.label = label
        self.kind = kind
    }
}

struct ConfigSection: Identifiable {
    let title: String
    let fields: [ConfigField]
    var footer: String?
    var id: String { title }
}

/// Réglages lus puis renvoyés en entier au serveur (seules les rubriques
/// présentes dans sa version sont affichées).
struct ConfigFormView: View {
    @Environment(Session.self) private var session
    let title: String
    let path: String
    let sections: [ConfigSection]
    var warning: String?
    @State private var config: [String: Any] = [:]
    @State private var loaded = false
    @State private var dirty = false
    @State private var saving = false
    @State private var note: String?
    @State private var confirm = false

    var body: some View {
        Form {
            if let warning {
                Section { Label(warning, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange) }
            }
            if !loaded { Section { ProgressView() } }
            ForEach(sections) { section in
                let fields = section.fields.filter { config[$0.key] != nil }
                if !fields.isEmpty {
                    Section {
                        ForEach(fields) { field in fieldView(field) }
                    } header: {
                        Text(section.title)
                    } footer: {
                        if let footer = section.footer { Text(footer) }
                    }
                }
            }
            if let note { Section { Text(note).foregroundStyle(Theme.accent) } }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    if warning != nil { confirm = true } else { Task { await save() } }
                } label: {
                    if saving { ProgressView() } else { Text("Enregistrer") }
                }
                .disabled(!dirty || saving)
            }
        }
        .confirmationDialog("Enregistrer ces réglages ?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Enregistrer", role: .destructive) { Task { await save() } }
        } message: {
            Text(warning ?? "")
        }
        .sensoryFeedback(.success, trigger: note)
        .task { await load() }
    }

    @ViewBuilder
    private func fieldView(_ field: ConfigField) -> some View {
        switch field.kind {
        case .toggle:
            Toggle(field.label, isOn: Binding(get: { config[field.key] as? Bool ?? false }, set: { config[field.key] = $0; dirty = true }))
        case .number(let suffix):
            LabeledContent(field.label) {
                HStack(spacing: 4) {
                    TextField("", value: Binding(get: { (config[field.key] as? NSNumber)?.intValue ?? 0 }, set: { config[field.key] = $0; dirty = true }), format: .number)
                        .keyboardType(.numbersAndPunctuation)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 110)
                    if !suffix.isEmpty { Text(suffix).foregroundStyle(Theme.muted) }
                }
            }
        case .decimal:
            LabeledContent(field.label) {
                TextField("", value: Binding(get: { (config[field.key] as? NSNumber)?.doubleValue ?? 0 }, set: { config[field.key] = $0; dirty = true }), format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110)
            }
        case .text:
            LabeledContent(field.label) {
                TextField(field.label, text: Binding(get: { config[field.key] as? String ?? "" }, set: { config[field.key] = $0; dirty = true }))
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        case .textArea:
            VStack(alignment: .leading, spacing: 6) {
                Text(field.label).font(.subheadline.weight(.semibold))
                TextEditor(text: Binding(get: { config[field.key] as? String ?? "" }, set: { config[field.key] = $0; dirty = true }))
                    .font(.system(.footnote, design: .monospaced))
                    .frame(minHeight: 140)
                    .scrollContentBackground(.hidden)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        case .choice(let options):
            choice(field, options)
        case .readOnly:
            LabeledContent(field.label, value: describe(config[field.key]))
        }
    }

    /// Liste de choix ; garde l'écriture du serveur (« none » ou « None » selon sa version).
    private func choice(_ field: ConfigField, _ options: [(String, String)]) -> some View {
        let current = config[field.key] as? String ?? ""
        let capitalized = current.first?.isUppercase == true && options.allSatisfy { $0.0.first?.isLowercase ?? true }
        var list = options
        if !current.isEmpty, !options.contains(where: { $0.0.caseInsensitiveCompare(current) == .orderedSame }) { list.append((current, current)) }
        return Picker(field.label, selection: Binding(
            get: { list.first { $0.0.caseInsensitiveCompare(current) == .orderedSame }?.0 ?? current },
            set: { value in
                config[field.key] = capitalized ? value.prefix(1).uppercased() + value.dropFirst() : value
                dirty = true
            })) {
            ForEach(list, id: \.0) { option in Text(option.1).tag(option.0) }
        }
    }

    private func describe(_ value: Any?) -> String {
        if let list = value as? [Any] { return list.isEmpty ? "—" : list.map { "\($0)" }.joined(separator: ", ") }
        if let number = value as? NSNumber { return number.stringValue }
        if let text = value as? String { return text.isEmpty ? "—" : text }
        return "—"
    }

    private func load() async {
        if let json = try? await session.jellyfinJSON(path) as? [String: Any] { config = json }
        loaded = true
        dirty = false
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            _ = try await session.data("POST", path, json: config)
            dirty = false
            note = "Réglages enregistrés."
        } catch {
            note = error.localizedDescription
        }
    }
}

/// Rubriques des réglages du serveur.
enum AdminForms {
    static let languages: [(String, String)] = [("fr", "Français"), ("en", "Anglais"), ("de", "Allemand"), ("es", "Espagnol"), ("it", "Italien"), ("ja", "Japonais"), ("pt", "Portugais")]
    static let countries: [(String, String)] = [("FR", "France"), ("BE", "Belgique"), ("CA", "Canada"), ("CH", "Suisse"), ("US", "États-Unis"), ("GB", "Royaume-Uni"), ("DE", "Allemagne"), ("ES", "Espagne"), ("IT", "Italie"), ("JP", "Japon")]

    static let general: [ConfigSection] = [
        ConfigSection(title: "Serveur", fields: [
            ConfigField("ServerName", "Nom du serveur", .text),
            ConfigField("UICulture", "Langue de l’interface", .choice([("fr", "Français"), ("en-US", "Anglais"), ("de", "Allemand"), ("es", "Espagnol"), ("it", "Italien")])),
            ConfigField("QuickConnectAvailable", "Connexion rapide (code)")
        ]),
        ConfigSection(title: "Métadonnées", fields: [
            ConfigField("PreferredMetadataLanguage", "Langue préférée", .choice(languages)),
            ConfigField("MetadataCountryCode", "Pays", .choice(countries))
        ]),
        ConfigSection(title: "Médiathèques", fields: [
            ConfigField("EnableFolderView", "Afficher la vue Dossiers"),
            ConfigField("EnableGroupingIntoCollections", "Regrouper les films en collections"),
            ConfigField("DisplaySpecialsWithinSeasons", "Épisodes spéciaux dans les saisons"),
            ConfigField("EnableExternalContentInSuggestions", "Contenu externe dans les suggestions"),
            ConfigField("LibraryMonitorDelay", "Délai de surveillance", .number(suffix: "s")),
            ConfigField("LibraryScanFanoutConcurrency", "Analyses en parallèle", .number(suffix: "")),
            ConfigField("LibraryMetadataRefreshConcurrency", "Actualisations en parallèle", .number(suffix: "")),
            ConfigField("ParallelImageEncodingLimit", "Images encodées en parallèle", .number(suffix: ""))
        ], footer: "0 : valeur automatique."),
        ConfigSection(title: "Reprise de lecture", fields: [
            ConfigField("MinResumePct", "Reprise à partir de", .number(suffix: "%")),
            ConfigField("MaxResumePct", "Vu au-delà de", .number(suffix: "%")),
            ConfigField("MinResumeDurationSeconds", "Durée minimale", .number(suffix: "s")),
            ConfigField("MinAudiobookResume", "Livres audio : reprise après", .number(suffix: "min")),
            ConfigField("MaxAudiobookResume", "Livres audio : terminé à moins de", .number(suffix: "min"))
        ]),
        ConfigSection(title: "Journal et performances", fields: [
            ConfigField("ActivityLogRetentionDays", "Conserver l’activité", .number(suffix: "j")),
            ConfigField("LogFileRetentionDays", "Conserver les journaux", .number(suffix: "j")),
            ConfigField("EnableSlowResponseWarning", "Signaler les réponses lentes"),
            ConfigField("SlowResponseThresholdMs", "Seuil des réponses lentes", .number(suffix: "ms"))
        ]),
        ConfigSection(title: "Dossiers", fields: [
            ConfigField("CachePath", "Cache", .readOnly),
            ConfigField("MetadataPath", "Métadonnées", .readOnly)
        ])
    ]

    static let encoding: [ConfigSection] = [
        ConfigSection(title: "Accélération matérielle", fields: [
            ConfigField("HardwareAccelerationType", "Accélération", .choice([("none", "Aucune"), ("qsv", "Intel Quick Sync"), ("vaapi", "VA-API"), ("nvenc", "NVIDIA NVENC"),
                                                                            ("amf", "AMD AMF"), ("videotoolbox", "Apple VideoToolbox"), ("v4l2m2m", "V4L2"), ("rkmpp", "Rockchip MPP")])),
            ConfigField("VaapiDevice", "Périphérique VA-API", .text),
            ConfigField("EnableHardwareEncoding", "Encodage matériel"),
            ConfigField("EnableDecodingColorDepth10Hevc", "Décodage HEVC 10 bits"),
            ConfigField("EnableDecodingColorDepth10Vp9", "Décodage VP9 10 bits"),
            ConfigField("PreferSystemNativeHwDecoder", "Décodeur matériel du système"),
            ConfigField("EnableEnhancedNvdecDecoder", "Décodeur NVDEC amélioré"),
            ConfigField("EnableIntelLowPowerH264HwEncoder", "Encodeur Intel basse consommation H.264"),
            ConfigField("EnableIntelLowPowerHevcHwEncoder", "Encodeur Intel basse consommation HEVC")
        ]),
        ConfigSection(title: "Encodage", fields: [
            ConfigField("EncodingThreadCount", "Fils d’encodage", .number(suffix: "")),
            ConfigField("EncoderPreset", "Préréglage", .choice([("auto", "Automatique"), ("veryslow", "Très lent"), ("slower", "Plus lent"), ("slow", "Lent"), ("medium", "Moyen"),
                                                                 ("fast", "Rapide"), ("faster", "Plus rapide"), ("veryfast", "Très rapide"), ("superfast", "Super rapide"), ("ultrafast", "Ultra rapide")])),
            ConfigField("H264Crf", "Qualité H.264 (CRF)", .number(suffix: "")),
            ConfigField("H265Crf", "Qualité HEVC (CRF)", .number(suffix: "")),
            ConfigField("AllowHevcEncoding", "Autoriser l’encodage HEVC"),
            ConfigField("AllowAv1Encoding", "Autoriser l’encodage AV1"),
            ConfigField("DeinterlaceMethod", "Désentrelacement", .choice([("yadif", "YADIF"), ("bwdif", "BWDIF")])),
            ConfigField("DeinterlaceDoubleRate", "Doubler la fréquence d’images"),
            ConfigField("MaxMuxingQueueSize", "File de multiplexage", .number(suffix: ""))
        ], footer: "Fils d’encodage : -1 pour automatique. CRF : plus bas = meilleure qualité."),
        ConfigSection(title: "HDR", fields: [
            ConfigField("EnableTonemapping", "Conversion HDR → SDR (tone mapping)"),
            ConfigField("EnableVppTonemapping", "Tone mapping VPP (Intel)"),
            ConfigField("TonemappingAlgorithm", "Algorithme", .choice([("bt2390", "BT.2390"), ("hable", "Hable"), ("reinhard", "Reinhard"), ("mobius", "Mobius"), ("linear", "Linéaire"), ("clip", "Écrêtage"), ("none", "Aucun")])),
            ConfigField("TonemappingRange", "Plage", .choice([("auto", "Automatique"), ("tv", "TV"), ("pc", "PC")]))
        ]),
        ConfigSection(title: "Audio et sous-titres", fields: [
            ConfigField("DownMixAudioBoost", "Amplification du mixage stéréo", .decimal),
            ConfigField("EnableSubtitleExtraction", "Extraire les sous-titres à la volée"),
            ConfigField("EnableFallbackFont", "Police de secours"),
            ConfigField("FallbackFontPath", "Dossier de la police", .text)
        ], footer: "« Extraire les sous-titres » doit rester activé pour lire les sous-titres intégrés aux fichiers MKV dans l’appli."),
        ConfigSection(title: "Fichiers temporaires", fields: [
            ConfigField("EnableThrottling", "Ralentir le transcodage en avance"),
            ConfigField("ThrottleDelaySeconds", "Avance avant ralentissement", .number(suffix: "s")),
            ConfigField("EnableSegmentDeletion", "Supprimer les anciens segments"),
            ConfigField("SegmentKeepSeconds", "Garder les segments", .number(suffix: "s")),
            ConfigField("TranscodingTempPath", "Dossier temporaire", .text),
            ConfigField("EncoderAppPathDisplay", "FFmpeg", .readOnly)
        ])
    ]

    static let network: [ConfigSection] = [
        ConfigSection(title: "Accès", fields: [
            ConfigField("EnableRemoteAccess", "Accès hors du réseau local"),
            ConfigField("BaseUrl", "Adresse de base", .text),
            ConfigField("AutoDiscovery", "Découverte automatique"),
            ConfigField("EnableUPnP", "UPnP"),
            ConfigField("EnableIPv4", "IPv4"),
            ConfigField("EnableIPv6", "IPv6")
        ]),
        ConfigSection(title: "Ports et HTTPS", fields: [
            ConfigField("InternalHttpPort", "Port HTTP local", .number(suffix: "")),
            ConfigField("InternalHttpsPort", "Port HTTPS local", .number(suffix: "")),
            ConfigField("PublicHttpPort", "Port HTTP public", .number(suffix: "")),
            ConfigField("PublicHttpsPort", "Port HTTPS public", .number(suffix: "")),
            ConfigField("EnableHttps", "HTTPS"),
            ConfigField("RequireHttps", "Exiger HTTPS")
        ]),
        ConfigSection(title: "Réseaux et relais", fields: [
            ConfigField("LocalNetworkSubnets", "Réseaux locaux", .readOnly),
            ConfigField("LocalNetworkAddresses", "Adresses d’écoute", .readOnly),
            ConfigField("KnownProxies", "Relais connus", .readOnly),
            ConfigField("RemoteIPFilter", "Filtre d’adresses", .readOnly)
        ])
    ]

    static let branding: [ConfigSection] = [
        ConfigSection(title: "Écran de connexion", fields: [
            ConfigField("LoginDisclaimer", "Message", .textArea),
            ConfigField("SplashscreenEnabled", "Écran d’accueil animé")
        ]),
        ConfigSection(title: "Apparence du site", fields: [
            ConfigField("CustomCss", "CSS personnalisé", .textArea)
        ])
    ]
}

// MARK: Médiathèques

struct LibrariesAdminView: View {
    @Environment(Session.self) private var session
    @State private var folders: [[String: Any]] = []
    @State private var adding = false
    @State private var note: String?

    private static let types: [String: (String, String)] = [
        "movies": ("Films", "film.fill"), "tvshows": ("Séries", "tv.fill"), "music": ("Musique", "music.note"), "musicvideos": ("Clips", "music.note.tv"),
        "homevideos": ("Vidéos et photos", "photo.on.rectangle"), "boxsets": ("Collections", "square.stack.3d.up.fill"), "books": ("Livres", "book.fill"),
        "mixed": ("Mixte", "square.grid.2x2.fill")
    ]

    var body: some View {
        List {
            Section {
                Button {
                    Task { await scanAll() }
                } label: {
                    Label("Analyser toutes les médiathèques", systemImage: "arrow.triangle.2.circlepath")
                }
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
            }
            Section("Médiathèques") {
                ForEach(folders.indices, id: \.self) { index in
                    let folder = folders[index]
                    let type = (folder["CollectionType"] as? String ?? "mixed").lowercased()
                    let info = Self.types[type] ?? ("Mixte", "folder.fill")
                    NavigationLink {
                        LibraryAdminDetail(folder: folder) { Task { await load() } }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: info.1).foregroundStyle(Theme.accent).frame(width: 26)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(folder["Name"] as? String ?? "").font(.headline)
                                Text([info.0, "\((folder["Locations"] as? [String])?.count ?? 0) dossier(s)"].joined(separator: " · "))
                                    .font(.caption).foregroundStyle(Theme.muted)
                                if (folder["RefreshStatus"] as? String) == "Active", let progress = folder["RefreshProgress"] as? Double {
                                    ProgressView(value: progress, total: 100).tint(Theme.lilac)
                                }
                            }
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Médiathèques")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $adding) { NewLibrarySheet { Task { await load() } } }
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(6))
            }
        }
    }

    private func load() async {
        if let list = try? await session.jellyfinJSON("/Library/VirtualFolders") as? [[String: Any]] { folders = list }
    }

    private func scanAll() async {
        do {
            _ = try await session.data("POST", "/Library/Refresh")
            note = "Analyse de toutes les médiathèques lancée."
        } catch { note = error.localizedDescription }
    }
}

struct LibraryAdminDetail: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let folder: [String: Any]
    let changed: () -> Void
    @State private var name = ""
    @State private var locations: [String] = []
    @State private var options: [String: Any] = [:]
    @State private var optionsDirty = false
    @State private var picking = false
    @State private var confirmDelete = false
    @State private var confirmReplace = false
    @State private var note: String?

    private var folderName: String { folder["Name"] as? String ?? "" }
    private var itemId: String { folder["ItemId"] as? String ?? "" }

    private static let optionFields: [ConfigField] = [
        ConfigField("EnableRealtimeMonitor", "Surveiller les nouveaux fichiers"),
        ConfigField("AutomaticallyAddToCollection", "Ajouter aux collections automatiquement"),
        ConfigField("EnableChapterImageExtraction", "Images des chapitres"),
        ConfigField("ExtractChapterImagesDuringLibraryScan", "Images des chapitres pendant l’analyse"),
        ConfigField("EnableTrickplayImageExtraction", "Aperçus de la barre de lecture"),
        ConfigField("SaveLocalMetadata", "Enregistrer les illustrations dans les dossiers"),
        ConfigField("SaveSubtitlesWithMedia", "Enregistrer les sous-titres avec les fichiers"),
        ConfigField("EnableEmbeddedTitles", "Titres intégrés aux fichiers"),
        ConfigField("EnableEmbeddedEpisodeInfos", "Infos d’épisodes intégrées aux fichiers"),
        ConfigField("EnablePhotos", "Afficher les photos")
    ]

    var body: some View {
        Form {
            Section("Nom") {
                TextField("Nom", text: $name)
                Button("Renommer") { Task { await rename() } }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || name == folderName)
            }
            Section {
                ForEach(locations, id: \.self) { path in
                    Text(path).font(.system(.footnote, design: .monospaced))
                        .swipeActions { Button(role: .destructive) { Task { await removePath(path) } } label: { Label("Retirer", systemImage: "trash") } }
                }
                Button { picking = true } label: { Label("Ajouter un dossier", systemImage: "folder.badge.plus") }
            } header: {
                Text("Dossiers")
            } footer: {
                Text("Balayez un dossier vers la gauche pour le retirer.")
            }
            Section("Analyse") {
                Button { Task { await refresh(replace: false) } } label: { Label("Analyser cette médiathèque", systemImage: "arrow.clockwise") }
                Button { confirmReplace = true } label: { Label("Remplacer toutes les métadonnées", systemImage: "arrow.triangle.2.circlepath.circle") }
            }
            let fields = Self.optionFields.filter { options[$0.key] != nil }
            if !fields.isEmpty {
                Section("Options") {
                    ForEach(fields) { field in
                        Toggle(field.label, isOn: Binding(get: { options[field.key] as? Bool ?? false }, set: { options[field.key] = $0; optionsDirty = true }))
                    }
                    Button("Enregistrer les options") { Task { await saveOptions() } }.disabled(!optionsDirty)
                }
            }
            if let note { Section { Text(note).foregroundStyle(Theme.accent) } }
            Section {
                Button("Supprimer la médiathèque", role: .destructive) { confirmDelete = true }
            } footer: {
                Text("Les fichiers ne sont pas supprimés, seulement la médiathèque.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle(folderName)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $picking) {
            NavigationStack { FolderPicker(path: nil) { path in Task { await addPath(path) } } }
        }
        .confirmationDialog("Supprimer « \(folderName) » ?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { Task { await delete() } }
        }
        .confirmationDialog("Remplacer toutes les métadonnées ?", isPresented: $confirmReplace, titleVisibility: .visible) {
            Button("Remplacer", role: .destructive) { Task { await refresh(replace: true) } }
        } message: {
            Text("Les fiches et les images seront téléchargées à nouveau. Cela peut prendre longtemps.")
        }
        .onAppear {
            name = folderName
            locations = folder["Locations"] as? [String] ?? []
            options = folder["LibraryOptions"] as? [String: Any] ?? [:]
        }
    }

    private func perform(_ work: () async throws -> Void, success: String) async {
        do {
            try await work()
            note = success
            changed()
        } catch { note = error.localizedDescription }
    }

    private func rename() async {
        let target = name.trimmingCharacters(in: .whitespaces)
        await perform({ _ = try await session.data("POST", "/Library/VirtualFolders/Name", ["name": folderName, "newName": target, "refreshLibrary": "true"]) },
                      success: "Médiathèque renommée.")
    }

    private func addPath(_ path: String) async {
        await perform({
            _ = try await session.data("POST", "/Library/VirtualFolders/Paths", ["refreshLibrary": "true"], json: ["Name": folderName, "PathInfo": ["Path": path]])
            locations.append(path)
        }, success: "Dossier ajouté ; analyse lancée.")
    }

    private func removePath(_ path: String) async {
        await perform({
            _ = try await session.data("DELETE", "/Library/VirtualFolders/Paths", ["name": folderName, "path": path, "refreshLibrary": "true"])
            locations.removeAll { $0 == path }
        }, success: "Dossier retiré.")
    }

    private func refresh(replace: Bool) async {
        await perform({
            _ = try await session.data("POST", "/Items/\(itemId)/Refresh", [
                "Recursive": "true", "MetadataRefreshMode": replace ? "FullRefresh" : "Default", "ImageRefreshMode": replace ? "FullRefresh" : "Default",
                "ReplaceAllMetadata": replace ? "true" : "false", "ReplaceAllImages": replace ? "true" : "false"
            ])
        }, success: replace ? "Actualisation complète lancée." : "Analyse lancée.")
    }

    private func saveOptions() async {
        await perform({
            _ = try await session.data("POST", "/Library/VirtualFolders/LibraryOptions", json: ["Id": itemId, "LibraryOptions": options])
            optionsDirty = false
        }, success: "Options enregistrées.")
    }

    private func delete() async {
        do {
            _ = try await session.data("DELETE", "/Library/VirtualFolders", ["name": folderName, "refreshLibrary": "true"])
            changed()
            dismiss()
        } catch { note = error.localizedDescription }
    }
}

struct NewLibrarySheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let created: () -> Void
    @State private var name = ""
    @State private var type = "movies"
    @State private var paths: [String] = []
    @State private var picking = false
    @State private var working = false
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nom", text: $name)
                    Picker("Type", selection: $type) {
                        Text("Films").tag("movies")
                        Text("Séries").tag("tvshows")
                        Text("Musique").tag("music")
                        Text("Clips").tag("musicvideos")
                        Text("Vidéos et photos").tag("homevideos")
                        Text("Livres").tag("books")
                        Text("Mixte").tag("mixed")
                    }
                }
                Section("Dossiers") {
                    ForEach(paths, id: \.self) { Text($0).font(.system(.footnote, design: .monospaced)) }
                    Button { picking = true } label: { Label("Ajouter un dossier", systemImage: "folder.badge.plus") }
                }
                if let problem { Section { Text(problem).foregroundStyle(.orange) } }
            }
            .navigationTitle("Nouvelle médiathèque")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await create() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || paths.isEmpty || working)
                }
            }
            .sheet(isPresented: $picking) {
                NavigationStack { FolderPicker(path: nil) { path in if !paths.contains(path) { paths.append(path) } } }
            }
        }
    }

    private func create() async {
        working = true
        defer { working = false }
        let title = name.trimmingCharacters(in: .whitespaces)
        do {
            _ = try await session.data("POST", "/Library/VirtualFolders", [
                "name": title, "collectionType": type == "mixed" ? nil : type, "refreshLibrary": "false"
            ], json: ["LibraryOptions": ["EnableRealtimeMonitor": true]])
            for path in paths {
                _ = try await session.data("POST", "/Library/VirtualFolders/Paths", ["refreshLibrary": path == paths.last ? "true" : "false"],
                                           json: ["Name": title, "PathInfo": ["Path": path]])
            }
            created()
            dismiss()
        } catch {
            problem = error.localizedDescription
        }
    }
}

/// Dossiers du serveur, pour choisir l'emplacement d'une médiathèque.
struct FolderPicker: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let path: String?
    let chosen: (String) -> Void
    @State private var entries: [(name: String, path: String)] = []
    @State private var loading = true

    var body: some View {
        List {
            if let path {
                Section {
                    Button {
                        chosen(path)
                        dismiss()
                    } label: {
                        Label("Choisir ce dossier", systemImage: "checkmark.circle.fill")
                    }
                    Text(path).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.muted)
                }
            }
            Section {
                if loading { ProgressView() }
                ForEach(entries, id: \.path) { entry in
                    NavigationLink {
                        FolderPicker(path: entry.path, chosen: chosen)
                    } label: {
                        Label(entry.name, systemImage: path == nil ? "internaldrive" : "folder.fill")
                    }
                }
                if !loading && entries.isEmpty { Text("Aucun sous-dossier.").foregroundStyle(Theme.muted) }
            }
        }
        .navigationTitle(path.map { ($0 as NSString).lastPathComponent } ?? "Disques")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        let json: Any?
        if let path {
            json = try? await session.jellyfinJSON("/Environment/DirectoryContents", ["path": path, "includeDirectories": "true", "includeFiles": "false"])
        } else {
            json = try? await session.jellyfinJSON("/Environment/Drives")
        }
        entries = ((json as? [[String: Any]]) ?? []).compactMap { item -> (name: String, path: String)? in
            guard let value = item["Path"] as? String else { return nil }
            return (name: (item["Name"] as? String) ?? value, path: value)
        }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

// MARK: Appareils et clés

struct DevicesAdminView: View {
    @Environment(Session.self) private var session
    @State private var devices: [[String: Any]] = []
    @State private var renaming: (id: String, name: String)?
    @State private var newName = ""

    var body: some View {
        List {
            ForEach(devices.indices, id: \.self) { index in
                let device = devices[index]
                let id = device["Id"] as? String ?? ""
                VStack(alignment: .leading, spacing: 3) {
                    Text((device["CustomName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? device["Name"] as? String ?? "Appareil").font(.headline)
                    Text([device["AppName"] as? String, device["AppVersion"] as? String, device["LastUserName"] as? String].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.muted)
                    Text(AdminFormat.relative(device["DateLastActivity"])).font(.caption2).foregroundStyle(Theme.muted)
                }
                .swipeActions {
                    if id != session.deviceId {
                        Button(role: .destructive) { Task { await delete(id) } } label: { Label("Supprimer", systemImage: "trash") }
                    }
                    Button { newName = device["Name"] as? String ?? ""; renaming = (id, newName) } label: { Label("Renommer", systemImage: "pencil") }.tint(Theme.violet)
                }
            }
            if devices.isEmpty { Text("Chargement…").foregroundStyle(Theme.muted) }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Appareils")
        .alert("Renommer l’appareil", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Nom", text: $newName)
            Button("Renommer") {
                let target = renaming
                Task { await rename(target?.id ?? "") }
            }
            Button("Annuler", role: .cancel) {}
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        if let json = try? await session.jellyfinJSON("/Devices") as? [String: Any] {
            devices = (json["Items"] as? [[String: Any]] ?? []).sorted { (AdminFormat.date($0["DateLastActivity"]) ?? .distantPast) > (AdminFormat.date($1["DateLastActivity"]) ?? .distantPast) }
        }
    }

    private func delete(_ id: String) async {
        _ = try? await session.data("DELETE", "/Devices", ["id": id])
        await load()
    }

    private func rename(_ id: String) async {
        _ = try? await session.data("POST", "/Devices/Options", ["id": id], json: ["CustomName": newName])
        await load()
    }
}

struct ApiKeysView: View {
    @Environment(Session.self) private var session
    @State private var keys: [[String: Any]] = []
    @State private var creating = false
    @State private var appName = ""

    var body: some View {
        List {
            Section {
                ForEach(keys.indices, id: \.self) { index in
                    let key = keys[index]
                    let token = key["AccessToken"] as? String ?? ""
                    VStack(alignment: .leading, spacing: 4) {
                        Text(key["AppName"] as? String ?? "Application").font(.headline)
                        Text(token).font(.system(.caption2, design: .monospaced)).foregroundStyle(Theme.muted).textSelection(.enabled)
                        Text("Créée \(AdminFormat.relative(key["DateCreated"]))").font(.caption2).foregroundStyle(Theme.muted)
                    }
                    .contextMenu {
                        Button { UIPasteboard.general.string = token } label: { Label("Copier la clé", systemImage: "doc.on.doc") }
                    }
                    .swipeActions {
                        Button(role: .destructive) { Task { await revoke(token) } } label: { Label("Révoquer", systemImage: "trash") }
                    }
                }
                if keys.isEmpty { Text("Aucune clé d’API.").foregroundStyle(Theme.muted) }
            } footer: {
                Text("Les clés d’API donnent un accès complet au serveur : ne les partagez qu’avec des applications de confiance.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Clés d’API")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { creating = true } label: { Image(systemName: "plus") } } }
        .alert("Nouvelle clé d’API", isPresented: $creating) {
            TextField("Nom de l’application", text: $appName)
            Button("Créer") { Task { await create() } }
            Button("Annuler", role: .cancel) {}
        }
        .task { await load() }
    }

    private func load() async {
        if let json = try? await session.jellyfinJSON("/Auth/Keys") as? [String: Any] { keys = json["Items"] as? [[String: Any]] ?? [] }
    }

    private func create() async {
        guard !appName.isEmpty else { return }
        _ = try? await session.data("POST", "/Auth/Keys", ["app": appName])
        appName = ""
        await load()
    }

    private func revoke(_ token: String) async {
        _ = try? await session.data("DELETE", "/Auth/Keys/\(token)")
        await load()
    }
}

// MARK: Extensions

struct PluginsView: View {
    @Environment(Session.self) private var session
    @State private var plugins: [[String: Any]] = []
    @State private var note: String?

    var body: some View {
        List {
            if let note { Section { Text(note).font(.footnote).foregroundStyle(Theme.accent) } }
            ForEach(plugins.indices, id: \.self) { index in
                let plugin = plugins[index]
                let id = plugin["Id"] as? String ?? ""
                let version = plugin["Version"] as? String ?? ""
                let status = plugin["Status"] as? String ?? ""
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(plugin["Name"] as? String ?? "").font(.headline)
                        Text(["Version \(version)", statusLabel(status)].joined(separator: " · ")).font(.caption)
                            .foregroundStyle(status == "Active" ? Theme.teal : .orange)
                        if let description = plugin["Description"] as? String, !description.isEmpty {
                            Text(description).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                        }
                    }
                    Spacer()
                }
                .swipeActions(edge: .leading) {
                    if status == "Active" {
                        Button { Task { await act("POST", "/Plugins/\(id)/\(version)/Disable", "Extension désactivée (redémarrage nécessaire).") } } label: { Label("Désactiver", systemImage: "pause.fill") }.tint(.orange)
                    } else if status == "Disabled" {
                        Button { Task { await act("POST", "/Plugins/\(id)/\(version)/Enable", "Extension activée (redémarrage nécessaire).") } } label: { Label("Activer", systemImage: "play.fill") }.tint(Theme.teal)
                    }
                }
                .swipeActions(edge: .trailing) {
                    if plugin["CanUninstall"] as? Bool != false {
                        Button(role: .destructive) { Task { await act("DELETE", "/Plugins/\(id)/\(version)", "Extension désinstallée (redémarrage nécessaire).") } } label: { Label("Désinstaller", systemImage: "trash") }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Extensions")
        .refreshable { await load() }
        .task { await load() }
    }

    private func statusLabel(_ status: String) -> String {
        ["Active": "Active", "Disabled": "Désactivée", "Restart": "Redémarrage nécessaire", "NotSupported": "Non compatible",
         "Malfunctioned": "En erreur", "Superceded": "Remplacée", "Deleted": "Supprimée"][status] ?? status
    }

    private func load() async {
        if let list = try? await session.jellyfinJSON("/Plugins") as? [[String: Any]] {
            plugins = list.sorted { ($0["Name"] as? String ?? "") < ($1["Name"] as? String ?? "") }
        }
    }

    private func act(_ method: String, _ path: String, _ success: String) async {
        do {
            _ = try await session.data(method, path)
            note = success
        } catch { note = error.localizedDescription }
        await load()
    }
}

struct PluginCatalogView: View {
    @Environment(Session.self) private var session
    @State private var packages: [[String: Any]] = []
    @State private var installed: Set<String> = []
    @State private var query = ""
    @State private var loading = true
    @State private var note: String?

    private var shown: [[String: Any]] {
        let term = query.trimmingCharacters(in: .whitespaces)
        return term.isEmpty ? packages : packages.filter { ($0["name"] as? String ?? "").localizedCaseInsensitiveContains(term) || ($0["category"] as? String ?? "").localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        List {
            if let note { Section { Text(note).font(.footnote).foregroundStyle(Theme.accent) } }
            if loading { ProgressView() }
            ForEach(shown.indices, id: \.self) { index in
                let package = shown[index]
                let name = package["name"] as? String ?? ""
                let guid = package["guid"] as? String ?? ""
                let versions = package["versions"] as? [[String: Any]] ?? []
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(name).font(.headline)
                        Spacer()
                        if installed.contains(guid.lowercased()) {
                            Text("Installée").font(.caption.weight(.bold)).foregroundStyle(Theme.teal)
                        } else if let latest = versions.first {
                            Button("Installer") { Task { await install(name, guid: guid, version: latest) } }
                                .buttonStyle(.glass)
                        }
                    }
                    Text([package["category"] as? String, (versions.first?["version"] as? String).map { "v" + $0 }].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.muted)
                    if let overview = (package["overview"] as? String) ?? (package["description"] as? String), !overview.isEmpty {
                        Text(overview).font(.caption).foregroundStyle(.white.opacity(0.8)).lineLimit(3)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Catalogue")
        .searchable(text: $query, prompt: "Extension ou catégorie")
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        async let catalog = try? session.jellyfinJSON("/Packages")
        async let current = try? session.jellyfinJSON("/Plugins")
        let (list, plugins) = await (catalog, current)
        packages = ((list as? [[String: Any]]) ?? []).sorted { ($0["name"] as? String ?? "") < ($1["name"] as? String ?? "") }
        installed = Set(((plugins as? [[String: Any]]) ?? []).compactMap { ($0["Id"] as? String)?.lowercased() })
    }

    private func install(_ name: String, guid: String, version: [String: Any]) async {
        do {
            _ = try await session.data("POST", "/Packages/Installed/\(name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name)", [
                "assemblyGuid": guid, "version": version["version"] as? String, "repositoryUrl": version["repositoryUrl"] as? String
            ])
            note = "Installation de « \(name) » lancée. Redémarrez le serveur pour l’activer."
            installed.insert(guid.lowercased())
        } catch { note = error.localizedDescription }
    }
}

struct RepositoriesView: View {
    @Environment(Session.self) private var session
    @State private var repositories: [[String: Any]] = []
    @State private var adding = false
    @State private var name = ""
    @State private var url = ""

    var body: some View {
        List {
            ForEach(repositories.indices, id: \.self) { index in
                let repository = repositories[index]
                VStack(alignment: .leading, spacing: 3) {
                    Text(repository["Name"] as? String ?? "").font(.headline)
                    Text(repository["Url"] as? String ?? "").font(.system(.caption2, design: .monospaced)).foregroundStyle(Theme.muted)
                }
                .swipeActions {
                    Button(role: .destructive) {
                        var list = repositories
                        list.remove(at: index)
                        Task { await save(list) }
                    } label: { Label("Retirer", systemImage: "trash") }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Dépôts")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") } } }
        .alert("Nouveau dépôt", isPresented: $adding) {
            TextField("Nom", text: $name)
            TextField("Adresse (manifest.json)", text: $url).textInputAutocapitalization(.never)
            Button("Ajouter") { Task { await save(repositories + [["Name": name, "Url": url, "Enabled": true]]) } }
            Button("Annuler", role: .cancel) {}
        }
        .task { await load() }
    }

    private func load() async {
        if let list = try? await session.jellyfinJSON("/Repositories") as? [[String: Any]] { repositories = list }
    }

    private func save(_ list: [[String: Any]]) async {
        _ = try? await session.data("POST", "/Repositories", json: list)
        name = ""
        url = ""
        await load()
    }
}

// MARK: Tâches, activité, journaux

struct ScheduledTasksView: View {
    @Environment(Session.self) private var session
    @State private var tasks: [[String: Any]] = []

    private var categories: [(String, [[String: Any]])] {
        Dictionary(grouping: tasks) { $0["Category"] as? String ?? "Autres" }.sorted { $0.key < $1.key }.map { ($0.key, $0.value) }
    }

    var body: some View {
        List {
            ForEach(categories, id: \.0) { category in
                Section(category.0) {
                    ForEach(category.1.indices, id: \.self) { index in
                        row(category.1[index])
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Tâches planifiées")
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    private func row(_ task: [String: Any]) -> some View {
        let id = task["Id"] as? String ?? ""
        let running = (task["State"] as? String) == "Running"
        let last = task["LastExecutionResult"] as? [String: Any]
        let failed = (last?["Status"] as? String).map { $0 != "Completed" } ?? false
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(task["Name"] as? String ?? "").font(.subheadline.weight(.semibold))
                if let description = task["Description"] as? String, !description.isEmpty {
                    Text(description).font(.caption2).foregroundStyle(Theme.muted).lineLimit(2)
                }
                if running {
                    ProgressView(value: (task["CurrentProgressPercentage"] as? Double) ?? 0, total: 100).tint(Theme.lilac)
                } else if let last {
                    Text("\(failed ? "Échec" : "Terminée") \(AdminFormat.relative(last["EndTimeUtc"]))").font(.caption).foregroundStyle(failed ? .orange : Theme.muted)
                }
            }
            Spacer()
            Button {
                Task {
                    _ = try? await session.data(running ? "DELETE" : "POST", "/ScheduledTasks/Running/\(id)")
                    await load()
                }
            } label: {
                Image(systemName: running ? "stop.fill" : "play.fill").frame(width: 34, height: 34)
            }
            .buttonStyle(.glass)
        }
    }

    private func load() async {
        if let list = try? await session.jellyfinJSON("/ScheduledTasks", ["isHidden": "false"]) as? [[String: Any]] { tasks = list }
    }
}

struct ActivityView: View {
    @Environment(Session.self) private var session
    @State private var entries: [[String: Any]] = []
    @State private var total = Int.max
    @State private var loading = false

    var body: some View {
        List {
            ForEach(entries.indices, id: \.self) { index in
                let entry = entries[index]
                let severity = entry["Severity"] as? String ?? "Information"
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: severity == "Error" ? "xmark.octagon.fill" : severity == "Warning" ? "exclamationmark.triangle.fill" : "info.circle.fill")
                        .foregroundStyle(severity == "Error" ? .red : severity == "Warning" ? .orange : Theme.cyan)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(entry["Name"] as? String ?? "").font(.subheadline)
                        if let overview = (entry["ShortOverview"] as? String) ?? (entry["Overview"] as? String), !overview.isEmpty {
                            Text(overview).font(.caption).foregroundStyle(Theme.muted).lineLimit(3)
                        }
                        Text(AdminFormat.relative(entry["Date"])).font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
                .onAppear { if index == entries.count - 1 { Task { await load() } } }
            }
            if loading { ProgressView() }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Activité")
        .refreshable {
            entries = []
            total = Int.max
            await load()
        }
        .task { if entries.isEmpty { await load() } }
    }

    private func load() async {
        guard !loading, entries.count < total else { return }
        loading = true
        defer { loading = false }
        guard let json = try? await session.jellyfinJSON("/System/ActivityLog/Entries", ["startIndex": String(entries.count), "limit": "50"]) as? [String: Any] else { return }
        let fresh = json["Items"] as? [[String: Any]] ?? []
        entries.append(contentsOf: fresh)
        total = fresh.isEmpty ? entries.count : (json["TotalRecordCount"] as? Int ?? Int.max)
    }
}

struct LogsView: View {
    @Environment(Session.self) private var session
    @State private var logs: [[String: Any]] = []

    var body: some View {
        List {
            ForEach(logs.indices, id: \.self) { index in
                let log = logs[index]
                let name = log["Name"] as? String ?? ""
                NavigationLink {
                    LogFileView(name: name)
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(name).font(.system(.subheadline, design: .monospaced))
                        Text([AdminFormat.bytes(Double(log["Size"] as? Int ?? 0)), AdminFormat.relative(log["DateModified"])].joined(separator: " · "))
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Journaux")
        .task {
            if let list = try? await session.jellyfinJSON("/System/Logs") as? [[String: Any]] {
                logs = list.sorted { (AdminFormat.date($0["DateModified"]) ?? .distantPast) > (AdminFormat.date($1["DateModified"]) ?? .distantPast) }
            }
        }
    }
}

struct LogFileView: View {
    @Environment(Session.self) private var session
    let name: String
    @State private var lines: [String] = []
    @State private var filter = ""
    @State private var loading = true

    private var shown: [String] {
        let term = filter.trimmingCharacters(in: .whitespaces)
        return term.isEmpty ? lines : lines.filter { $0.localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        ScrollView {
            if loading { LoadingView() }
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(shown.indices, id: \.self) { index in
                    let line = shown[index]
                    Text(line)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(line.contains("[ERR]") ? Color.red : line.contains("[WRN]") ? Color.orange : Color.white.opacity(0.85))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(12)
        }
        .background(Theme.background)
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $filter, prompt: "Filtrer (ERR, WRN, nom…)")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: lines.joined(separator: "\n")) { Image(systemName: "square.and.arrow.up") }
            }
        }
        .task {
            defer { loading = false }
            guard let data = try? await session.data("GET", "/System/Logs/Log", ["name": name]) else { return }
            // Les 3 000 dernières lignes, les plus récentes en haut.
            let text = String(decoding: data, as: UTF8.self)
            lines = Array(text.components(separatedBy: .newlines).filter { !$0.isEmpty }.suffix(3000).reversed())
        }
    }
}

// MARK: TV en direct (Noctra)

/// Accès VIP LiveWatch, clés Movix / Northlive et sources TV du serveur Noctra.
struct LiveAdminView: View {
    @Environment(Session.self) private var session
    @State private var status: [String: Any] = [:]
    @State private var keys: [String: Bool] = [:]
    @State private var sources: [[String: Any]] = []
    @State private var email = ""
    @State private var password = ""
    @State private var keyProvider: String?
    @State private var keyValue = ""
    @State private var addingSource = false
    @State private var sourceName = ""
    @State private var sourceURL = ""
    @State private var working = false
    @State private var note: String?

    var body: some View {
        Form {
            Section {
                LabeledContent("État", value: status["active"] as? Bool == true ? "VIP Premium actif" : status["configured"] as? Bool == true ? "Connecté, VIP inactif" : "Non connecté")
                if let account = status["account"] as? String { LabeledContent("Compte", value: account) }
                if let message = status["message"] as? String { Text(message).font(.footnote).foregroundStyle(.orange) }
                if status["configured"] as? Bool == true {
                    Button("Déconnecter LiveWatch", role: .destructive) { Task { await liveWatch(connect: false) } }
                } else {
                    TextField("Adresse e-mail LiveWatch", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress).autocorrectionDisabled()
                    SecureField("Mot de passe", text: $password)
                    Button("Connecter le compte VIP") { Task { await liveWatch(connect: true) } }.disabled(email.isEmpty || password.isEmpty || working)
                }
            } header: {
                Text("LiveWatch VIP Premium")
            } footer: {
                Text("Le compte est gardé sur le serveur Noctra : ses chaînes VIP sont proposées en premier sur tous vos appareils.")
            }
            Section("Fournisseurs à clé") {
                ForEach(["movix", "northlive"], id: \.self) { provider in
                    HStack {
                        Text(provider == "movix" ? "Movix" : "Northlive")
                        Spacer()
                        Text(keys[provider] == true ? "Clé enregistrée" : "Aucune clé").foregroundStyle(keys[provider] == true ? Theme.teal : Theme.muted)
                        Button(keys[provider] == true ? "Changer" : "Ajouter") { keyProvider = provider; keyValue = "" }.buttonStyle(.glass)
                    }
                }
            }
            Section {
                ForEach(sources.indices, id: \.self) { index in
                    let source = sources[index]
                    VStack(alignment: .leading, spacing: 2) {
                        Text(source["name"] as? String ?? "").font(.subheadline.weight(.semibold))
                        Text([source["section"] as? String, source["description"] as? String].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                    }
                    .swipeActions {
                        if source["editable"] as? Bool == true, let id = source["id"] as? String {
                            Button(role: .destructive) { Task { await removeSource(id) } } label: { Label("Retirer", systemImage: "trash") }
                        }
                    }
                }
                Button { addingSource = true } label: { Label("Ajouter une source (M3U, portail…)", systemImage: "plus.circle") }
            } header: {
                Text("Sources TV · \(sources.count)")
            }
            if let note { Section { Text(note).foregroundStyle(Theme.accent) } }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .tv))
        .navigationTitle("TV en direct")
        .alert("Clé \(keyProvider == "movix" ? "Movix" : "Northlive")", isPresented: Binding(get: { keyProvider != nil }, set: { if !$0 { keyProvider = nil } })) {
            TextField("Clé", text: $keyValue).textInputAutocapitalization(.never)
            Button("Enregistrer") {
                let provider = keyProvider
                Task { await saveKey(provider) }
            }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Nouvelle source TV", isPresented: $addingSource) {
            TextField("Nom", text: $sourceName)
            TextField("Adresse (M3U, Xtream, portail)", text: $sourceURL).textInputAutocapitalization(.never)
            Button("Ajouter") { Task { await addSource() } }
            Button("Annuler", role: .cancel) {}
        }
        .task { await load() }
    }

    private func load() async {
        if let json = try? await session.noctraJSON("/api/tv/livewatch/session", timeout: 20) as? [String: Any] { status = json }
        if let json = try? await session.noctraJSON("/api/tv/provider-keys", timeout: 20) as? [String: Any] { keys = json.compactMapValues { $0 as? Bool } }
        if let json = try? await session.noctraJSON("/api/tv/sources") as? [String: Any] { sources = json["sources"] as? [[String: Any]] ?? [] }
    }

    private func liveWatch(connect: Bool) async {
        working = true
        defer { working = false }
        do {
            if connect {
                let result = try await session.noctraSend("POST", "/api/tv/livewatch/session", json: ["email": email, "password": password]) as? [String: Any]
                status = result ?? status
                password = ""
                note = status["active"] as? Bool == true ? "Compte VIP connecté : ses chaînes sont proposées en premier." : "Compte connecté, mais le VIP Premium n’est pas actif."
            } else {
                _ = try await session.noctraSend("DELETE", "/api/tv/livewatch/session", json: nil)
                note = "Compte LiveWatch déconnecté."
            }
            await load()
            Task { await LiveStore.shared.loadAll(session, force: true) }
        } catch { note = error.localizedDescription }
    }

    private func saveKey(_ provider: String?) async {
        guard let provider, !keyValue.isEmpty else { return }
        do {
            _ = try await session.noctraSend("POST", "/api/tv/provider-keys", json: ["provider": provider, "key": keyValue])
            note = "Clé enregistrée et vérifiée."
            await load()
        } catch { note = error.localizedDescription }
    }

    private func addSource() async {
        do {
            _ = try await session.noctraSend("POST", "/api/tv/sources", json: ["name": sourceName, "url": sourceURL, "type": "auto"])
            sourceName = ""
            sourceURL = ""
            note = "Source ajoutée."
            await load()
        } catch { note = error.localizedDescription }
    }

    private func removeSource(_ id: String) async {
        do {
            _ = try await session.noctraSend("DELETE", "/api/tv/sources/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", json: nil)
            await load()
        } catch { note = error.localizedDescription }
    }
}
