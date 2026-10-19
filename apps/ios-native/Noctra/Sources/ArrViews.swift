import SwiftUI

// Radarr (films) et Sonarr (séries) via le serveur Noctra : vue d'ensemble,
// bibliothèque, manquants, calendrier, file d'attente, historique, ajout,
// et recherche interactive (releases des indexeurs, envoi au client).

enum ArrKind: String, Identifiable {
    case radarr, sonarr
    var id: String { rawValue }
    var label: String { self == .radarr ? "Radarr" : "Sonarr" }
    var noun: String { self == .radarr ? "film" : "série" }
    var icon: String { self == .radarr ? "film.stack.fill" : "tv.and.mediabox.fill" }
}

struct ArrHubView: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    @State private var view: Section = .overview

    enum Section: String, CaseIterable, Identifiable {
        case overview = "Vue d’ensemble", library = "Bibliothèque", wanted = "Manquants", calendar = "Calendrier", queue = "File", history = "Historique", add = "Ajouter"
        var id: String { rawValue }
        var key: String {
            switch self {
            case .overview: return "overview"
            case .library: return "library"
            case .wanted: return "wanted"
            case .calendar: return "calendar"
            case .queue: return "queue"
            case .history: return "history"
            case .add: return "add"
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(Section.allCases) { section in
                        Button {
                            withAnimation(Theme.spring) { view = section }
                        } label: {
                            Text(section.rawValue).font(.subheadline.weight(.semibold)).padding(.horizontal, 14).padding(.vertical, 9)
                        }
                        .buttonStyle(PressableStyle())
                        .glassEffect(view == section ? .regular.tint(Theme.accent.opacity(0.55)).interactive() : .regular.interactive(), in: Capsule())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .scrollIndicators(.hidden)
            Group {
                switch view {
                case .overview: ArrOverview(kind: kind)
                case .library, .wanted: ArrLibrary(kind: kind, wanted: view == .wanted)
                case .calendar, .queue, .history: ArrFeed(kind: kind, view: view.key)
                case .add: ArrAddView(kind: kind)
                }
            }
            .id(view)
        }
        .background(AuroraBackground(palette: .requests))
        .navigationTitle(kind.label)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: Vue d'ensemble

struct ArrOverview: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    @State private var data: [String: Any] = [:]
    @State private var failed: String?
    @State private var note: String?

    var body: some View {
        List {
            if let failed { Section { Text(failed).foregroundStyle(.orange) } }
            if let metrics = data["metrics"] as? [String: Any] {
                Section {
                    LabeledContent("Version", value: data["version"] as? String ?? "—")
                    LabeledContent(kind == .radarr ? "Films" : "Séries", value: "\(metrics["total"] as? Int ?? 0)")
                    LabeledContent("Surveillés", value: "\(metrics["monitored"] as? Int ?? 0)")
                    LabeledContent("Manquants", value: "\(metrics["missing"] as? Int ?? 0)")
                    LabeledContent("Espace libre", value: AdminFormat.bytes(Double(metrics["freeSpace"] as? Int64 ?? Int64(metrics["freeSpace"] as? Int ?? 0))))
                }
                Section {
                    Button { Task { await command("RssSync") } } label: { Label("Synchroniser les flux RSS", systemImage: "dot.radiowaves.up.forward") }
                    Button { Task { await command("RefreshMonitoredDownloads") } } label: { Label("Actualiser les téléchargements", systemImage: "arrow.clockwise") }
                    Button { Task { await command(kind == .radarr ? "MoviesSearch" : "SeriesSearch") } } label: { Label("Chercher tout ce qui manque", systemImage: "magnifyingglass") }
                    if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
                }
            }
            if let health = data["health"] as? [[String: Any]], !health.isEmpty {
                Section("Santé") {
                    ForEach(health.indices, id: \.self) { index in
                        Label(health[index]["message"] as? String ?? "", systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange)
                    }
                }
            }
            if let queue = data["queue"] as? [[String: Any]], !queue.isEmpty {
                Section("Téléchargements en cours") { ForEach(queue.indices, id: \.self) { ArrQueueRow(item: queue[$0]) } }
            }
            if let calendar = data["calendar"] as? [[String: Any]], !calendar.isEmpty {
                Section("À venir") { ForEach(calendar.indices, id: \.self) { ArrCalendarRow(item: calendar[$0]) } }
            }
            if let recent = data["recent"] as? [[String: Any]], !recent.isEmpty {
                Section("Ajoutés récemment") {
                    ForEach(recent.indices, id: \.self) { index in
                        NavigationLink { ArrItemView(kind: kind, item: recent[index]) } label: { ArrItemRow(item: recent[index]) }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do {
            data = (try await session.noctraSend("GET", "/api/servarr/center?type=\(kind.rawValue)&view=overview", json: nil) as? [String: Any]) ?? [:]
            failed = nil
        } catch { failed = "\(kind.label) injoignable : \(error.localizedDescription)" }
    }

    private func command(_ name: String) async {
        do {
            _ = try await session.noctraSend("POST", "/api/servarr/command", json: ["type": kind.rawValue, "name": name])
            note = "Commande envoyée à \(kind.label)."
        } catch { note = error.localizedDescription }
    }
}

// MARK: Bibliothèque et manquants

struct ArrLibrary: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    let wanted: Bool
    @State private var items: [[String: Any]] = []
    @State private var page = 1
    @State private var total = Int.max
    @State private var query = ""
    @State private var loading = false

    var body: some View {
        List {
            ForEach(items.indices, id: \.self) { index in
                let item = items[index]
                NavigationLink {
                    ArrItemView(kind: kind, item: item)
                } label: {
                    ArrItemRow(item: item)
                }
                .onAppear { if index == items.count - 1 { Task { await load(reset: false) } } }
            }
            if loading { ProgressView() }
            if !loading && items.isEmpty { Text(wanted ? "Rien ne manque." : "Aucun résultat.").foregroundStyle(Theme.muted) }
        }
        .scrollContentBackground(.hidden)
        .searchable(text: $query, prompt: "Rechercher dans \(kind.label)")
        .task(id: query) {
            try? await Task.sleep(for: .milliseconds(300))
            await load(reset: true)
        }
        .refreshable { await load(reset: true) }
    }

    private func load(reset: Bool) async {
        if reset { page = 1; total = Int.max }
        guard !loading, (page - 1) * 40 < total else { return }
        loading = true
        defer { loading = false }
        let term = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        guard let json = try? await session.noctraJSON("/api/servarr/center?type=\(kind.rawValue)&view=\(wanted ? "wanted" : "library")&page=\(page)&pageSize=40&q=\(term)", timeout: 45) as? [String: Any] else { return }
        let fresh = json["items"] as? [[String: Any]] ?? []
        items = reset ? fresh : items + fresh
        total = json["totalRecords"] as? Int ?? items.count
        page += 1
    }
}

struct ArrItemRow: View {
    let item: [String: Any]

    var body: some View {
        HStack(spacing: 12) {
            RemoteImage(url: (item["poster"] as? String).flatMap { URL(string: $0) })
                .frame(width: 44, height: 66)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(item["title"] as? String ?? "").font(.subheadline.weight(.semibold)).lineLimit(2)
                Text([item["year"].map { "\($0)" }, item["status"] as? String].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Theme.muted)
                HStack(spacing: 6) {
                    if item["monitored"] as? Bool == true { Label("Surveillé", systemImage: "eye.fill").labelStyle(.iconOnly).foregroundStyle(Theme.teal) }
                    if item["hasFile"] as? Bool == true { Text("Disponible").foregroundStyle(Theme.teal) }
                    else { Text("Manquant").foregroundStyle(.orange) }
                    if let progress = item["progress"] as? Int, progress > 0, progress < 100 { Text("\(progress) %").foregroundStyle(Theme.muted) }
                }
                .font(.caption2.weight(.semibold))
            }
        }
    }
}

struct ArrItemView: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    let item: [String: Any]
    @State private var monitored = false
    @State private var note: String?
    @State private var episodes: [[String: Any]] = []
    @State private var seasons: [Int] = []

    private var id: Int { (item["serviceId"] as? Int) ?? (item["id"] as? Int) ?? 0 }
    private var episodeId: Int? { item["episodeId"] as? Int }

    var body: some View {
        List {
            Section {
                HStack(alignment: .top, spacing: 14) {
                    RemoteImage(url: (item["poster"] as? String).flatMap { URL(string: $0) })
                        .frame(width: 90, height: 135)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item["title"] as? String ?? "").font(.display(20, .bold, relativeTo: .headline))
                        if let path = item["path"] as? String, !path.isEmpty { Text(path).font(.system(.caption2, design: .monospaced)).foregroundStyle(Theme.muted) }
                        if let size = item["sizeOnDisk"] as? Int64 ?? (item["sizeOnDisk"] as? Int).map { Int64($0) }, size > 0 {
                            Text(AdminFormat.bytes(Double(size))).font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .listRowBackground(Color.clear)
                if episodeId == nil {
                    Toggle("Surveillé", isOn: Binding(get: { monitored }, set: { value in monitored = value; Task { await setMonitored(value) } }))
                }
            }
            Section("Recherche") {
                NavigationLink {
                    if kind == .radarr {
                        InteractiveSearchView(kind: kind, title: item["title"] as? String ?? "", query: "id=\(id)")
                    } else if let episodeId {
                        InteractiveSearchView(kind: kind, title: item["title"] as? String ?? "", query: "id=\(episodeId)")
                    } else {
                        InteractiveSearchView(kind: kind, title: "\(item["title"] as? String ?? "") · série complète", query: "seriesId=\(id)&allSeasons=1")
                    }
                } label: {
                    Label(kind == .sonarr && episodeId == nil ? "Recherche interactive · série complète" : "Recherche interactive", systemImage: "list.bullet.rectangle.portrait")
                }
                if episodeId == nil {
                    Button { Task { await command(kind == .radarr ? "MoviesSearch" : "SeriesSearch") } } label: { Label("Recherche automatique", systemImage: "magnifyingglass") }
                    Button { Task { await command(kind == .radarr ? "RefreshMovie" : "RefreshSeries") } } label: { Label("Actualiser les informations", systemImage: "arrow.clockwise") }
                    Button { Task { await command(kind == .radarr ? "RescanMovie" : "RescanSeries") } } label: { Label("Analyser le dossier", systemImage: "folder.badge.gearshape") }
                }
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
            }
            if kind == .sonarr && episodeId == nil {
                ForEach(seasons, id: \.self) { season in
                    Section {
                        NavigationLink {
                            InteractiveSearchView(kind: kind, title: "\(item["title"] as? String ?? "") · saison \(season)", query: "seriesId=\(id)&seasonNumber=\(season)")
                        } label: {
                            Label("Recherche interactive · saison \(season)", systemImage: "square.stack.3d.down.forward")
                        }
                        ForEach(episodes.indices.filter { episodes[$0]["seasonNumber"] as? Int == season }, id: \.self) { index in
                            let episode = episodes[index]
                            NavigationLink {
                                InteractiveSearchView(kind: kind, title: "\(item["title"] as? String ?? "") · S\(season)E\(episode["episodeNumber"] as? Int ?? 0)",
                                                      query: "id=\(episode["id"] as? Int ?? 0)")
                            } label: {
                                HStack {
                                    Text("\(episode["episodeNumber"] as? Int ?? 0). \(episode["title"] as? String ?? "")").font(.subheadline).lineLimit(1)
                                    Spacer()
                                    Image(systemName: episode["hasFile"] as? Bool == true ? "checkmark.circle.fill" : "circle.dashed")
                                        .foregroundStyle(episode["hasFile"] as? Bool == true ? Theme.teal : .orange)
                                }
                            }
                        }
                    } header: {
                        Text("Saison \(season)")
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle(item["title"] as? String ?? kind.label)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            monitored = item["monitored"] as? Bool ?? false
            if kind == .sonarr, episodeId == nil, let json = try? await session.noctraJSON("/api/servarr/episodes?seriesId=\(id)", timeout: 30) as? [String: Any] {
                seasons = json["seasons"] as? [Int] ?? []
                episodes = json["episodes"] as? [[String: Any]] ?? []
            }
        }
    }

    private func setMonitored(_ value: Bool) async {
        do {
            _ = try await session.noctraSend("POST", "/api/servarr/monitor", json: ["type": kind.rawValue, "id": id, "monitored": value])
            note = value ? "Surveillance activée." : "Surveillance désactivée."
        } catch { note = error.localizedDescription }
    }

    private func command(_ name: String) async {
        do {
            var body: [String: Any] = ["type": kind.rawValue, "name": name]
            body[kind == .radarr ? "movieId" : "seriesId"] = id
            _ = try await session.noctraSend("POST", "/api/servarr/command", json: body)
            note = "Commande envoyée à \(kind.label)."
        } catch { note = error.localizedDescription }
    }
}

// MARK: Calendrier, file d'attente, historique

struct ArrFeed: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    let view: String
    @State private var items: [[String: Any]] = []
    @State private var loaded = false

    var body: some View {
        List {
            ForEach(items.indices, id: \.self) { index in
                switch view {
                case "queue": ArrQueueRow(item: items[index])
                case "calendar": ArrCalendarRow(item: items[index])
                default:
                    let item = items[index]
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item["title"] as? String ?? "").font(.subheadline.weight(.semibold)).lineLimit(2)
                        Text([eventLabel(item["eventType"] as? String ?? ""), item["quality"] as? String, item["indexer"] as? String].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(Theme.muted)
                        if let source = item["sourceTitle"] as? String, !source.isEmpty { Text(source).font(.caption2).foregroundStyle(Theme.muted).lineLimit(2) }
                        Text(AdminFormat.relative(item["date"])).font(.caption2).foregroundStyle(Theme.muted)
                    }
                }
            }
            if loaded && items.isEmpty { Text("Rien pour le moment.").foregroundStyle(Theme.muted) }
            if !loaded { ProgressView() }
        }
        .scrollContentBackground(.hidden)
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                await load()
                guard view == "queue" else { return }
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    private func eventLabel(_ type: String) -> String {
        ["grabbed": "Récupéré", "downloadFolderImported": "Importé", "downloadFailed": "Échec", "movieFileDeleted": "Fichier supprimé",
         "episodeFileDeleted": "Fichier supprimé", "movieFileRenamed": "Renommé", "episodeFileRenamed": "Renommé", "downloadIgnored": "Ignoré"][type] ?? type
    }

    private func load() async {
        if let json = try? await session.noctraJSON("/api/servarr/center?type=\(kind.rawValue)&view=\(view)&pageSize=60", timeout: 45) as? [String: Any] {
            items = json["items"] as? [[String: Any]] ?? []
        }
        loaded = true
    }
}

struct ArrQueueRow: View {
    let item: [String: Any]

    var body: some View {
        let size = Double(item["size"] as? Int64 ?? Int64(item["size"] as? Int ?? 0))
        let left = Double(item["sizeleft"] as? Int64 ?? Int64(item["sizeleft"] as? Int ?? 0))
        VStack(alignment: .leading, spacing: 4) {
            Text(item["title"] as? String ?? "").font(.subheadline.weight(.semibold)).lineLimit(2)
            if size > 0 { ProgressLine(value: max(0, min(1, (size - left) / size))) }
            Text([item["status"] as? String, (item["timeleft"] as? String).flatMap { $0.isEmpty ? nil : "reste " + $0 }, item["downloadClient"] as? String]
                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.caption).foregroundStyle(Theme.muted)
            if let error = item["errorMessage"] as? String, !error.isEmpty { Text(error).font(.caption2).foregroundStyle(.orange) }
        }
    }
}

struct ArrCalendarRow: View {
    let item: [String: Any]

    var body: some View {
        HStack(spacing: 12) {
            RemoteImage(url: (item["poster"] as? String).flatMap { URL(string: $0) })
                .frame(width: 36, height: 54)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(item["title"] as? String ?? "").font(.subheadline.weight(.semibold)).lineLimit(2)
                if let date = AdminFormat.date(item["date"]) {
                    Text(date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Image(systemName: item["hasFile"] as? Bool == true ? "checkmark.circle.fill" : "clock").foregroundStyle(item["hasFile"] as? Bool == true ? Theme.teal : Theme.muted)
        }
    }
}

// MARK: Ajout

struct ArrAddView: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    @State private var query = ""
    @State private var results: [[String: Any]] = []
    @State private var searching = false
    @State private var selected: Selection?
    @State private var problem: String?

    struct Selection: Identifiable {
        let id = UUID()
        let item: [String: Any]
    }

    var body: some View {
        List {
            if let problem { Text(problem).foregroundStyle(.orange) }
            if searching { ProgressView() }
            ForEach(results.indices, id: \.self) { index in
                let result = results[index]
                Button {
                    selected = Selection(item: result)
                } label: {
                    HStack(spacing: 12) {
                        RemoteImage(url: (result["poster"] as? String).flatMap { URL(string: $0) })
                            .frame(width: 44, height: 66)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(result["title"] as? String ?? "").font(.subheadline.weight(.semibold))
                            Text([result["year"].map { "\($0)" }, result["network"] as? String, result["studio"] as? String].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(Theme.muted)
                            if let overview = result["overview"] as? String, !overview.isEmpty { Text(overview).font(.caption2).foregroundStyle(Theme.muted).lineLimit(2) }
                        }
                    }
                }
                .foregroundStyle(.white)
            }
        }
        .scrollContentBackground(.hidden)
        .searchable(text: $query, prompt: kind == .radarr ? "Film à ajouter" : "Série à ajouter")
        .task(id: query) {
            let term = query.trimmingCharacters(in: .whitespaces)
            guard term.count >= 2 else { results = []; return }
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            searching = true
            defer { searching = false }
            do {
                let json = try await session.noctraSend("GET", "/api/servarr/lookup?type=\(kind.rawValue)&q=\(term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term)", json: nil) as? [String: Any]
                results = json?["results"] as? [[String: Any]] ?? []
                problem = nil
            } catch { problem = error.localizedDescription }
        }
        .sheet(item: $selected) { selection in
            ArrAddSheet(kind: kind, lookup: selection.item).presentationDetents([.medium, .large])
        }
    }
}

struct ArrAddSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let kind: ArrKind
    let lookup: [String: Any]
    @State private var profiles: [(id: Int, name: String)] = []
    @State private var folders: [String] = []
    @State private var profile = 0
    @State private var folder = ""
    @State private var monitored = true
    @State private var search = true
    @State private var working = false
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(lookup["title"] as? String ?? "").font(.headline)
                    Picker("Profil de qualité", selection: $profile) {
                        ForEach(profiles, id: \.id) { Text($0.name).tag($0.id) }
                    }
                    Picker("Dossier", selection: $folder) {
                        ForEach(folders, id: \.self) { Text($0).tag($0) }
                    }
                    Toggle("Surveiller", isOn: $monitored)
                    Toggle(kind == .radarr ? "Chercher le film tout de suite" : "Chercher les épisodes manquants", isOn: $search)
                }
                if let problem { Section { Text(problem).foregroundStyle(.orange) } }
            }
            .navigationTitle("Ajouter à \(kind.label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ajouter") { Task { await add() } }.disabled(profile == 0 || folder.isEmpty || working)
                }
            }
            .task {
                guard let json = try? await session.noctraJSON("/api/servarr/center?type=\(kind.rawValue)&view=add", timeout: 30) as? [String: Any],
                      let settings = json["settings"] as? [String: Any] else { problem = "Réglages de \(kind.label) indisponibles."; return }
                profiles = (settings["qualityProfiles"] as? [[String: Any]] ?? []).compactMap { entry -> (id: Int, name: String)? in
                    guard let id = entry["id"] as? Int else { return nil }
                    return (id: id, name: entry["name"] as? String ?? "Profil \(id)")
                }
                folders = (settings["rootFolders"] as? [[String: Any]] ?? []).compactMap { $0["path"] as? String }
                profile = profiles.first?.id ?? 0
                folder = folders.first ?? ""
            }
        }
    }

    private func add() async {
        working = true
        defer { working = false }
        do {
            _ = try await session.noctraSend("POST", "/api/servarr/add", json: [
                "type": kind.rawValue, "item": lookup["raw"] ?? lookup, "qualityProfileId": profile, "rootFolderPath": folder,
                "monitored": monitored, "search": search
            ])
            SyncPlayManager.shared.announce("« \(lookup["title"] as? String ?? "") » ajouté à \(kind.label).")
            dismiss()
        } catch { problem = error.localizedDescription }
    }
}

// MARK: Recherche interactive

/// Releases proposées par les indexeurs pour un film, un épisode, une saison ou
/// une série : tri, détails, envoi au client de téléchargement par Radarr / Sonarr.
struct InteractiveSearchView: View {
    @Environment(Session.self) private var session
    let kind: ArrKind
    let title: String
    let query: String
    @State private var releases: [[String: Any]] = []
    @State private var warnings: [String] = []
    @State private var loading = true
    @State private var failed: String?
    @State private var sort: ReleaseSort = .saved
    @State private var grabbing: String?
    @State private var grabbed: Set<String> = []
    @State private var confirm: Pick?
    @State private var running = false
    @State private var progress = ""
    @State private var series = false
    @State private var integrals = 0
    @State private var seasonPacks = 0
    @State private var pack = ""
    @State private var generation = 0

    struct Pick: Identifiable {
        let id: String
        let release: [String: Any]
    }

    var body: some View {
        List {
            Section {
                Picker("Trier", selection: $sort) {
                    ForEach(ReleaseSort.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                if series {
                    // Série : intégrales (toutes saisons) ou packs de saisons complètes, comme sur le site.
                    Picker("Type de pack", selection: $pack) {
                        Text("Tout").tag("")
                        Text("Intégrales (\(integrals))").tag("integral")
                        Text("Saisons complètes (\(seasonPacks))").tag("season")
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }
                if loading || running {
                    HStack(spacing: 10) { ProgressView(); Text(progress.isEmpty ? "Interrogation des indexeurs…" : progress).font(.footnote).foregroundStyle(Theme.muted) }
                }
                if let failed { Text(failed).foregroundStyle(.orange) }
                ForEach(warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.orange) }
                if !loading && releases.isEmpty && failed == nil { Text("Aucune release trouvée.").foregroundStyle(Theme.muted) }
            }
            Section("\(shown.count) résultat\(shown.count > 1 ? "s" : "")") {
                ForEach(shown.indices, id: \.self) { index in
                    let release = shown[index]
                    let key = "\(release["indexerId"] ?? 0):\(release["guid"] as? String ?? "")"
                    Button {
                        confirm = Pick(id: key, release: release)
                    } label: {
                        ReleaseRow(release: release, grabbed: grabbed.contains(key), grabbing: grabbing == key)
                    }
                    .foregroundStyle(.white)
                    .disabled(grabbing != nil || grabbed.contains(key))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle(title)
        .onChange(of: sort) { sort.save() }
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Télécharger cette release ?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible, presenting: confirm) { pick in
            Button("Envoyer au client de téléchargement") { Task { await grab(pick) } }
        } message: { pick in
            Text(pick.release["title"] as? String ?? "")
        }
        .refreshable { Task { await load(force: true) } }
        .task { await load(force: false) }
    }

    private var shown: [[String: Any]] {
        let list = pack.isEmpty ? releases : releases.filter { $0["packKind"] as? String == pack }
        return ReleaseSort.sorted(list, by: sort)
    }

    /// Recherche suivie comme sur le site : le serveur interroge les indexeurs (saison par
    /// saison pour une série complète) et renvoie les résultats au fur et à mesure.
    private func load(force: Bool) async {
        generation += 1
        let token = generation
        loading = true
        defer { if token == generation { loading = false; running = false } }
        var forced = force
        for _ in 0..<3600 {
            guard token == generation else { return }
            do {
                let json = try await session.noctraSend("GET", "/api/servarr/releases?type=\(kind.rawValue)&\(query)&progress=1\(forced ? "&force=1" : "")", json: nil) as? [String: Any]
                forced = false
                releases = json?["releases"] as? [[String: Any]] ?? []
                warnings = json?["warnings"] as? [String] ?? []
                failed = json?["error"] as? String
                series = json?["searchKind"] as? String == "series"
                integrals = Int(ReleaseSort.number(json?["integralCount"]))
                seasonPacks = Int(ReleaseSort.number(json?["seasonPackCount"]))
                if series, pack.isEmpty, let mode = json?["packMode"] as? String { pack = mode }
                running = json?["running"] as? Bool == true
                let total = Int(ReleaseSort.number(json?["total"]))
                progress = total > 1 ? "\(Int(ReleaseSort.number(json?["completed"])))/\(total) saisons interrogées" : "Interrogation des indexeurs…"
                guard running else { return }
            } catch {
                failed = error.localizedDescription
                return
            }
            try? await Task.sleep(for: .seconds(1))
            if Task.isCancelled { return }
        }
    }

    private func grab(_ pick: Pick) async {
        grabbing = pick.id
        defer { grabbing = nil }
        do {
            _ = try await session.noctraSend("POST", "/api/servarr/grab", json: [
                "type": kind.rawValue, "guid": pick.release["guid"] as? String ?? "", "indexerId": pick.release["indexerId"] as? Int ?? 0
            ])
            grabbed.insert(pick.id)
            SyncPlayManager.shared.announce("Release envoyée à \(kind.label).")
        } catch { failed = error.localizedDescription }
    }
}

enum ReleaseSort: String, CaseIterable, Identifiable {
    case best, seeders, size, age
    var id: String { rawValue }

    /// Tri gardé pour le compte connecté sur cet appareil.
    private static var key: String { "noctra.sort.\(UserDefaults.standard.string(forKey: "noctra.userId") ?? "anonyme").releases" }
    static var saved: ReleaseSort { UserDefaults.standard.string(forKey: key).flatMap(ReleaseSort.init(rawValue:)) ?? .best }
    func save() { UserDefaults.standard.set(rawValue, forKey: Self.key) }
    var label: String { ["Conseillé", "Sources", "Taille", "Récent"][Self.allCases.firstIndex(of: self) ?? 0] }

    static func number(_ value: Any?) -> Double { (value as? Double) ?? (value as? Int).map(Double.init) ?? (value as? Int64).map(Double.init) ?? 0 }

    static func sorted(_ list: [[String: Any]], by sort: ReleaseSort) -> [[String: Any]] {
        switch sort {
        case .best: return list
        case .seeders: return list.sorted { number($0["seeders"]) > number($1["seeders"]) }
        case .size: return list.sorted { number($0["size"]) > number($1["size"]) }
        case .age: return list.sorted { (($0["ageHours"] as? Double) ?? .infinity) < (($1["ageHours"] as? Double) ?? .infinity) }
        }
    }
}

struct ReleaseRow: View {
    let release: [String: Any]
    var grabbed = false
    var grabbing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(release["title"] as? String ?? "").font(.subheadline.weight(.semibold)).lineLimit(3)
            HStack(spacing: 8) {
                tag(release["quality"] as? String, Theme.lilac)
                tag(AdminFormat.bytes(ReleaseSort.number(release["size"])), Theme.cyan)
                if let seeders = release["seeders"] as? Int { tag("▲ \(seeders)", seeders > 0 ? Theme.teal : .orange) }
                if let age = release["ageHours"] as? Double { tag(age < 48 ? "\(Int(age)) h" : "\(Int(age / 24)) j", Theme.muted) }
            }
            HStack(spacing: 8) {
                Text([release["indexer"] as? String, (release["languages"] as? [String])?.joined(separator: ", "), release["language"] as? String]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                Spacer()
                if grabbing { ProgressView() }
                else if grabbed { Label("Envoyée", systemImage: "checkmark.circle.fill").font(.caption.weight(.bold)).foregroundStyle(Theme.teal) }
                else if release["rejected"] as? Bool == true { Text("Refusée par le profil").font(.caption2).foregroundStyle(.orange) }
                else if release["approved"] as? Bool == true { Text("Conforme").font(.caption2).foregroundStyle(Theme.teal) }
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func tag(_ text: String?, _ color: Color) -> some View {
        if let text, !text.isEmpty {
            Text(text).font(.caption2.weight(.bold)).padding(.horizontal, 7).padding(.vertical, 3)
                .background(color.opacity(0.18), in: Capsule())
                .foregroundStyle(color == Theme.muted ? .white.opacity(0.8) : color)
        }
    }
}

/// Recherche interactive d'une demande ou d'un titre de Découvrir : torrents des
/// trackers (Prowlarr), envoyés à qBittorrent dans la destination choisie.
struct TrackerSearchView: View {
    @Environment(Session.self) private var session
    let mediaType: String
    let tmdbId: Int
    let title: String
    let year: String?
    @State private var releases: [[String: Any]] = []
    @State private var destinations: [(path: String, label: String)] = []
    @State private var destination = ""
    @State private var loading = true
    @State private var message: String?
    @State private var sort: ReleaseSort = .saved
    @State private var grabbed: Set<String> = []
    @State private var grabbing: String?

    var body: some View {
        List {
            Section {
                Picker("Trier", selection: $sort) { ForEach(ReleaseSort.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                if !destinations.isEmpty {
                    Picker("Destination", selection: $destination) {
                        ForEach(destinations, id: \.path) { Text($0.label).tag($0.path) }
                    }
                }
                if loading { HStack(spacing: 10) { ProgressView(); Text("Recherche sur les trackers…").font(.footnote).foregroundStyle(Theme.muted) } }
                if let message { Text(message).font(.footnote).foregroundStyle(.orange) }
            }
            Section("\(releases.count) torrent\(releases.count > 1 ? "s" : "")") {
                ForEach(ReleaseSort.sorted(releases, by: sort).indices, id: \.self) { index in
                    let release = ReleaseSort.sorted(releases, by: sort)[index]
                    let key = release["downloadId"] as? String ?? "\(index)"
                    Button {
                        Task { await grab(release, key: key) }
                    } label: {
                        ReleaseRow(release: release, grabbed: grabbed.contains(key), grabbing: grabbing == key)
                    }
                    .foregroundStyle(.white)
                    .disabled(grabbing != nil || grabbed.contains(key))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle(title)
        .onChange(of: sort) { sort.save() }
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load(force: true) }
        .task { await load(force: false) }
    }

    private func load(force: Bool) async {
        loading = true
        defer { loading = false }
        // Tous les indexeurs, en laissant aux trackers lents jusqu'à une minute (mode « patient » du serveur).
        let term = title.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? title
        var path = "/api/discovery/availability?mediaType=\(mediaType)&tmdbId=\(tmdbId)&title=\(term)&limit=40&force=1&patient=1"
        if let year { path += "&year=\(year)" }
        async let found = try? session.noctraJSON(path, timeout: 120) as? [String: Any]
        async let options = try? session.noctraJSON("/api/discovery/download-options?mediaType=\(mediaType)&tmdbId=\(tmdbId)", timeout: 20) as? [String: Any]
        let (availability, settings) = await (found, options)
        releases = availability?["releases"] as? [[String: Any]] ?? []
        message = availability == nil ? "Les trackers ne répondent pas : réessaie dans un instant." : availability?["message"] as? String
        destinations = (settings?["destinations"] as? [[String: Any]] ?? []).compactMap { entry -> (path: String, label: String)? in
            guard let path = entry["path"] as? String else { return nil }
            return (path: path, label: (entry["label"] as? String) ?? path)
        }
        // Dossier de la catégorie (animés, séries, films d'animation, films), jamais Trash par défaut.
        if destination.isEmpty {
            let suggested = (settings?["suggested"] as? [String: Any])?["path"] as? String
            destination = suggested.flatMap { path in destinations.contains { $0.path == path } ? path : nil }
                ?? destinations.first { !$0.path.localizedCaseInsensitiveContains("trash") }?.path
                ?? destinations.first?.path ?? ""
        }
    }

    private func grab(_ release: [String: Any], key: String) async {
        grabbing = key
        defer { grabbing = nil }
        do {
            var body: [String: Any] = ["downloadId": key, "startPaused": false]
            if !destination.isEmpty { body["savePath"] = destination }
            _ = try await session.noctraSend("POST", "/api/discovery/grab", json: body)
            grabbed.insert(key)
            SyncPlayManager.shared.announce("Torrent envoyé à qBittorrent.")
        } catch { message = error.localizedDescription }
    }
}

// MARK: Recherche interactive depuis Découvrir et les demandes

/// Recherche interactive comme sur le site : film → releases Radarr ; série → œuvre complète
/// (intégrales et toutes saisons), pack d'une saison ou épisode ; torrents des trackers en plus.
struct ReleaseSearchHub: View {
    @Environment(Session.self) private var session
    let mediaType: String
    let tmdbId: Int
    let title: String
    let year: String?
    @State private var serviceId: Int?
    @State private var resolving = true
    @State private var seasons: [Int] = []
    @State private var episodes: [[String: Any]] = []

    init(mediaType: String, tmdbId: Int, title: String, year: String?, serviceId: Int?) {
        self.mediaType = mediaType
        self.tmdbId = tmdbId
        self.title = title
        self.year = year
        _serviceId = State(initialValue: serviceId)
    }

    private var kind: ArrKind { mediaType == "tv" ? .sonarr : .radarr }

    var body: some View {
        List {
            if let id = serviceId {
                if kind == .radarr {
                    Section {
                        NavigationLink { InteractiveSearchView(kind: .radarr, title: title, query: "id=\(id)") } label: {
                            Label("Releases du film", systemImage: "film")
                        }
                    } footer: { Text("Radarr interroge tous les indexeurs actifs.") }
                } else {
                    Section {
                        NavigationLink { InteractiveSearchView(kind: .sonarr, title: "\(title) · œuvre complète", query: "seriesId=\(id)&allSeasons=1") } label: {
                            Label("Œuvre complète · intégrales et toutes saisons", systemImage: "square.stack.3d.up.fill")
                        }
                    } footer: { Text("Sonarr interroge tous les indexeurs actifs, saison par saison.") }
                    ForEach(seasons, id: \.self) { season in seasonSection(id, season) }
                }
            } else if resolving {
                HStack(spacing: 10) { ProgressView(); Text("Recherche de la fiche \(kind.label)…").font(.footnote).foregroundStyle(Theme.muted) }
            } else {
                Text("Ce titre n’est pas encore dans \(kind.label) : fais d’abord la demande, puis reviens ici pour choisir la release.")
                    .font(.footnote).foregroundStyle(.orange)
            }
            Section {
                NavigationLink { TrackerSearchView(mediaType: mediaType, tmdbId: tmdbId, title: title, year: year) } label: {
                    Label("Torrents disponibles sur les trackers", systemImage: "antenna.radiowaves.left.and.right")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await resolve() }
    }

    private func seasonSection(_ id: Int, _ season: Int) -> some View {
        let list = episodes.filter { $0["seasonNumber"] as? Int == season }
        return Section("Saison \(season)") {
            NavigationLink { InteractiveSearchView(kind: .sonarr, title: "\(title) · saison \(season)", query: "seriesId=\(id)&seasonNumber=\(season)") } label: {
                Label("Pack saison complète", systemImage: "square.stack.3d.down.forward")
            }
            DisclosureGroup("\(list.count) épisode\(list.count > 1 ? "s" : "")") {
                ForEach(list.indices, id: \.self) { index in
                    let episode = list[index]
                    let number = episode["episodeNumber"] as? Int ?? 0
                    NavigationLink {
                        InteractiveSearchView(kind: .sonarr, title: "\(title) · S\(season)E\(number)", query: "id=\(episode["id"] as? Int ?? 0)")
                    } label: {
                        HStack {
                            Text("\(number). \(episode["title"] as? String ?? "")").font(.subheadline).lineLimit(1)
                            Spacer()
                            Image(systemName: episode["hasFile"] as? Bool == true ? "checkmark.circle.fill" : "circle.dashed")
                                .foregroundStyle(episode["hasFile"] as? Bool == true ? Theme.teal : .orange)
                        }
                    }
                }
            }
        }
    }

    /// Fiche Radarr/Sonarr retrouvée par l'identifiant TMDB (ou le titre et l'année).
    private func resolve() async {
        defer { resolving = false }
        if serviceId == nil {
            let term = title.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? title
            if let json = try? await session.noctraJSON("/api/servarr/catalog?type=\(kind.rawValue)&q=\(term)", timeout: 30) as? [String: Any] {
                let items = json["items"] as? [[String: Any]] ?? []
                let byTmdb = items.first { ($0["tmdbId"] as? Int) == tmdbId }
                let byTitle = items.first { item in
                    (item["title"] as? String)?.localizedCaseInsensitiveCompare(title) == .orderedSame
                        && (year == nil || "\(item["year"] ?? "")".hasPrefix(year ?? ""))
                }
                serviceId = (byTmdb ?? byTitle)?["id"] as? Int
            }
        }
        if kind == .sonarr, let id = serviceId,
           let json = try? await session.noctraJSON("/api/servarr/episodes?seriesId=\(id)", timeout: 30) as? [String: Any] {
            seasons = json["seasons"] as? [Int] ?? []
            episodes = json["episodes"] as? [[String: Any]] ?? []
        }
    }
}
