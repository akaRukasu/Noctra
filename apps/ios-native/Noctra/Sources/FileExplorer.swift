import SwiftUI

// MARK: Explorateur média (administrateurs)

/// Explorateur des dossiers média du serveur, comme sur le site : racines autorisées
/// (dont Trash), dossiers, renommage, corbeille, nouveau dossier, doublons, sagas et séries.
struct FileExplorerView: View {
    @Environment(Session.self) private var session
    @State private var roots: [[String: Any]] = []
    @State private var root = ""
    @State private var path = ""
    @State private var parent: String?
    @State private var items: [[String: Any]] = []
    @State private var truncated = false
    @State private var loading = true
    @State private var failed: String?
    @State private var note: String?
    @State private var renaming: Entry?
    @State private var newName = ""
    @State private var trashing: Entry?
    @State private var moving: Entry?
    @State private var creating = false
    @State private var folderName = ""
    @State private var emptying = false

    struct Entry: Identifiable {
        let id: String
        let name: String
    }

    var body: some View {
        List {
            Section {
                NavigationLink { StorageView() } label: { Label("Stockage de la seedbox", systemImage: "internaldrive") }
                NavigationLink { DuplicatesView() } label: { Label("Détecter les doublons", systemImage: "checkmark.seal") }
                NavigationLink { CompletenessView(kind: "movie") } label: { Label("Sagas de films", systemImage: "film.stack") }
                NavigationLink { CompletenessView(kind: "series") } label: { Label("Séries", systemImage: "tv") }
                if root == "trash" {
                    Button(role: .destructive) { emptying = true } label: { Label("Vider Trash", systemImage: "trash.slash") }
                }
            } footer: {
                Text("Navigation limitée aux racines autorisées, dont Trash. Les suppressions vont dans .noctra-trash.")
            }
            if roots.count > 1 {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(roots.indices, id: \.self) { index in rootChip(roots[index]) }
                        }
                    }
                    .listRowBackground(Color.clear)
                }
            }
            Section {
                Text("/" + path).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.muted)
                if let parent {
                    Button { Task { await open(root: root, path: parent) } } label: {
                        Label("Dossier parent", systemImage: "arrow.turn.left.up")
                    }
                }
                if loading { ProgressView() }
                if let failed { Text(failed).foregroundStyle(.orange) }
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
            }
            Section {
                ForEach(items.indices, id: \.self) { index in row(items[index]) }
                if !loading && items.isEmpty && failed == nil { Text("Ce dossier est vide.").foregroundStyle(Theme.muted) }
                if truncated { Text("Seuls les 1 000 premiers éléments sont affichés.").font(.caption).foregroundStyle(Theme.muted) }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle("Explorateur média")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { folderName = ""; creating = true } label: { Image(systemName: "folder.badge.plus") }
                    .accessibilityLabel("Nouveau dossier")
                    .disabled(root.isEmpty)
            }
        }
        .refreshable { await open(root: root, path: path) }
        .task { if roots.isEmpty { await loadRoots() } }
        .alert("Renommer", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } }), presenting: renaming) { entry in
            TextField("Nom", text: $newName)
            Button("Renommer") { Task { await rename(entry) } }
            Button("Annuler", role: .cancel) {}
        }
        .alert("Nouveau dossier", isPresented: $creating) {
            TextField("Nom du dossier", text: $folderName)
            Button("Créer") { Task { await mkdir() } }
            Button("Annuler", role: .cancel) {}
        }
        .confirmationDialog("Mettre à la corbeille ?", isPresented: Binding(get: { trashing != nil }, set: { if !$0 { trashing = nil } }), titleVisibility: .visible, presenting: trashing) { entry in
            Button("Mettre « \(entry.name) » à la corbeille", role: .destructive) { Task { await trash(entry) } }
        }
        .sheet(item: $moving) { entry in
            NavigationStack {
                FolderPickerView(roots: roots, root: root, path: path, title: "Déplacer « \(entry.name) »") { targetRoot, targetPath in
                    moving = nil
                    Task { await act("/api/files/move", ["root": root, "path": entry.id, "targetRoot": targetRoot, "targetPath": targetPath], done: "« \(entry.name) » déplacé.") }
                }
            }
        }
        .confirmationDialog("Vider Trash définitivement ?", isPresented: $emptying, titleVisibility: .visible) {
            Button("Vider Trash", role: .destructive) { Task { await emptyTrash() } }
        }
    }

    private func rootChip(_ item: [String: Any]) -> some View {
        let id = item["id"] as? String ?? ""
        return Button(item["label"] as? String ?? id) { Task { await open(root: id, path: "") } }
            .buttonStyle(.bordered)
            .tint(id == root ? Theme.accent : .gray)
            .disabled(item["available"] as? Bool == false)
    }

    @ViewBuilder
    private func row(_ item: [String: Any]) -> some View {
        let name = item["name"] as? String ?? ""
        let itemPath = item["path"] as? String ?? ""
        let directory = item["type"] as? String == "directory"
        let entry = Entry(id: itemPath, name: name)
        Group {
            if directory {
                Button { Task { await open(root: root, path: itemPath) } } label: { FileRow(item: item) }
                    .foregroundStyle(.white)
            } else {
                FileRow(item: item)
            }
        }
        .swipeActions {
            if item["manageable"] as? Bool == true {
                Button(role: .destructive) { trashing = entry } label: { Label("Corbeille", systemImage: "trash") }
                Button { newName = name; renaming = entry } label: { Label("Renommer", systemImage: "pencil") }
                    .tint(.indigo)
                Button { moving = entry } label: { Label("Déplacer", systemImage: "folder.badge.arrow.forward") }
                    .tint(.teal)
            }
        }
        .contextMenu {
            if item["manageable"] as? Bool == true {
                Button { newName = name; renaming = entry } label: { Label("Renommer", systemImage: "pencil") }
                Button { moving = entry } label: { Label("Déplacer vers…", systemImage: "folder.badge.arrow.forward") }
                Button(role: .destructive) { trashing = entry } label: { Label("Mettre à la corbeille", systemImage: "trash") }
            }
        }
    }

    private func encoded(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+?"))) ?? value
    }

    private func loadRoots() async {
        do {
            let json = try await session.noctraJSON("/api/files/roots", timeout: 20) as? [String: Any]
            roots = json?["roots"] as? [[String: Any]] ?? []
            let first = roots.first { $0["available"] as? Bool == true }?["id"] as? String
            guard let first else {
                loading = false
                failed = "Aucun dossier média configuré ou accessible."
                return
            }
            await open(root: first, path: "")
        } catch {
            loading = false
            failed = error.localizedDescription
        }
    }

    private func open(root: String, path: String) async {
        guard !root.isEmpty else { return }
        loading = true
        defer { loading = false }
        do {
            let json = try await session.noctraJSON("/api/files?root=\(encoded(root))&path=\(encoded(path))", timeout: 30) as? [String: Any]
            self.root = root
            self.path = json?["path"] as? String ?? path
            parent = json?["parent"] as? String
            items = json?["items"] as? [[String: Any]] ?? []
            truncated = json?["truncated"] as? Bool == true
            failed = nil
        } catch {
            failed = error.localizedDescription
        }
    }

    private func act(_ path: String, _ body: [String: Any], done: String) async {
        do {
            _ = try await session.noctraSend("POST", path, json: body, timeout: 120)
            note = done
            await open(root: root, path: self.path)
        } catch {
            failed = error.localizedDescription
        }
    }

    private func rename(_ entry: Entry) async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, name != entry.name else { return }
        await act("/api/files/rename", ["root": root, "path": entry.id, "name": name], done: "« \(entry.name) » renommé en « \(name) ».")
    }

    private func trash(_ entry: Entry) async {
        await act("/api/files/trash", ["root": root, "path": entry.id], done: "« \(entry.name) » placé dans la corbeille.")
    }

    private func mkdir() async {
        let name = folderName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        await act("/api/files/mkdir", ["root": root, "path": path, "name": name], done: "Dossier « \(name) » créé.")
    }

    private func emptyTrash() async {
        await act("/api/files/empty-trash", ["root": root], done: "Trash vidé.")
    }
}

/// Ligne de l'explorateur : icône, nom, type, taille et date.
private struct FileRow: View {
    let item: [String: Any]

    var body: some View {
        let directory = item["type"] as? String == "directory"
        HStack(spacing: 12) {
            Image(systemName: directory ? "folder.fill" : "doc.fill")
                .foregroundStyle(directory ? Theme.accent : Theme.muted)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(item["name"] as? String ?? "").lineLimit(2)
                Text(detail).font(.caption).foregroundStyle(Theme.muted)
            }
        }
    }

    private var detail: String {
        let type = item["type"] as? String ?? ""
        var parts: [String] = []
        if type == "directory" {
            parts.append("Dossier")
        } else {
            let ext = (item["extension"] as? String ?? "").uppercased()
            parts.append(type == "file" ? (ext.isEmpty ? "Fichier" : ext) : "Lien")
            parts.append(AdminFormat.bytes(ReleaseSort.number(item["size"])))
        }
        if let date = FileDates.label(item["modifiedAt"] as? String) { parts.append(date) }
        return parts.joined(separator: " · ")
    }
}

enum FileDates {
    nonisolated(unsafe) private static let parser: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func label(_ raw: String?) -> String? {
        guard let raw, let date = parser.date(from: raw) ?? ISO8601DateFormatter().date(from: raw) else { return nil }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

// MARK: Doublons

/// Fichiers en double (empreinte SHA-256 confirmée) : une copie conservée, les autres supprimables.
struct DuplicatesView: View {
    @Environment(Session.self) private var session
    @State private var status: [String: Any] = [:]
    @State private var selected: Set<String> = []
    @State private var confirm = false
    @State private var deleting = false
    @State private var failed: String?
    @State private var note: String?
    @State private var generation = 0

    private var running: Bool { status["running"] as? Bool == true }
    private var groups: [[String: Any]] { status["groups"] as? [[String: Any]] ?? [] }

    var body: some View {
        List {
            Section {
                Text(status["message"] as? String ?? "Préparation de l’analyse…").font(.subheadline)
                if running {
                    ProgressView(value: progress)
                    Text("\(ReleaseSort.number(status["scannedFiles"]).formatted()) fichiers inventoriés · \(ReleaseSort.number(status["hashedFiles"]).formatted()) empreintes vérifiées")
                        .font(.caption).foregroundStyle(Theme.muted)
                    if let current = status["current"] as? String, !current.isEmpty {
                        Text(current).font(.caption2).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                } else if !groups.isEmpty || status["phase"] as? String == "complete" {
                    LabeledContent("Groupes", value: "\(groups.count)")
                    LabeledContent("Doublons", value: "\(Int(ReleaseSort.number(status["duplicateFiles"])))")
                    LabeledContent("Récupérable", value: AdminFormat.bytes(ReleaseSort.number(status["reclaimableBytes"])))
                }
                if let failed { Text(failed).foregroundStyle(.orange) }
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
            }
            if !running {
                ForEach(groups.indices, id: \.self) { index in group(index) }
                if groups.isEmpty && status["phase"] as? String == "complete" {
                    Text("Aucun doublon exact détecté dans les médiathèques.").foregroundStyle(Theme.muted)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle("Fichiers en double")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { Task { await start() } } label: { Label("Revérifier", systemImage: "arrow.clockwise") }.disabled(running)
                    Button(role: .destructive) { confirm = true } label: {
                        Label("Supprimer la sélection (\(selected.count))", systemImage: "trash")
                    }
                    .disabled(selected.isEmpty || deleting)
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .confirmationDialog("Supprimer définitivement \(selected.count) copie\(selected.count > 1 ? "s" : "") ? Une copie de chaque fichier reste conservée.", isPresented: $confirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { Task { await deleteSelection() } }
        }
        .task { await start() }
    }

    private var progress: Double {
        let candidates = ReleaseSort.number(status["candidateFiles"])
        guard status["phase"] as? String == "hash", candidates > 0 else { return 0.05 }
        return min(0.99, max(0.05, ReleaseSort.number(status["hashedFiles"]) / candidates))
    }

    private func group(_ index: Int) -> some View {
        let group = groups[index]
        let keep = group["keep"] as? [String: Any] ?? [:]
        let duplicates = group["duplicates"] as? [[String: Any]] ?? []
        return Section {
            HStack {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.teal)
                VStack(alignment: .leading) {
                    Text("Conserver · \(keep["rootLabel"] as? String ?? keep["root"] as? String ?? "Média")").font(.caption.weight(.semibold))
                    Text(keep["path"] as? String ?? "").font(.caption2).foregroundStyle(Theme.muted).lineLimit(2)
                }
            }
            ForEach(duplicates.indices, id: \.self) { position in
                let key = "\(index):\(position)"
                Toggle(isOn: Binding(get: { selected.contains(key) }, set: { if $0 { selected.insert(key) } else { selected.remove(key) } })) {
                    VStack(alignment: .leading) {
                        Text(duplicates[position]["rootLabel"] as? String ?? duplicates[position]["root"] as? String ?? "Média").font(.caption.weight(.semibold))
                        Text(duplicates[position]["path"] as? String ?? "").font(.caption2).foregroundStyle(Theme.muted).lineLimit(2)
                    }
                }
            }
        } header: {
            Text("\(keep["name"] as? String ?? "Fichier") · \(AdminFormat.bytes(ReleaseSort.number(group["size"])))")
        }
    }

    private func start() async {
        generation += 1
        let token = generation
        selected = []
        failed = nil
        status = ["running": true, "message": "Inventaire des médiathèques…"]
        do {
            _ = try await session.noctraSend("POST", "/api/files/duplicates/start", json: [String: Any](), timeout: 20)
        } catch {
            if !error.localizedDescription.localizedCaseInsensitiveContains("déjà en cours") { failed = error.localizedDescription }
        }
        while !Task.isCancelled, token == generation {
            if let json = try? await session.noctraJSON("/api/files/duplicates/status", timeout: 20) as? [String: Any] { status = json }
            guard running else { return }
            try? await Task.sleep(for: .milliseconds(900))
        }
    }

    private func deleteSelection() async {
        let items: [[String: Any]] = selected.compactMap { key -> [String: Any]? in
            let parts = key.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2, parts[0] < groups.count else { return nil }
            let group = groups[parts[0]]
            let duplicates = group["duplicates"] as? [[String: Any]] ?? []
            guard let keep = group["keep"] as? [String: Any], parts[1] < duplicates.count else { return nil }
            let duplicate = duplicates[parts[1]]
            return ["root": duplicate["root"] ?? "", "path": duplicate["path"] ?? "", "keepRoot": keep["root"] ?? "",
                    "keepPath": keep["path"] ?? "", "size": group["size"] ?? 0, "hash": group["hash"] ?? ""]
        }
        guard !items.isEmpty else { return }
        deleting = true
        defer { deleting = false }
        do {
            let json = try await session.noctraSend("POST", "/api/files/duplicates/delete", json: ["items": items], timeout: 180) as? [String: Any]
            note = json?["message"] as? String ?? "\(Int(ReleaseSort.number(json?["removed"]))) doublon(s) supprimé(s)."
            if let errors = json?["errors"] as? [[String: Any]], let first = errors.first {
                failed = "\(errors.count) fichier(s) non supprimé(s) : \(first["message"] as? String ?? "vérification refusée")"
            }
            await start()
        } catch {
            failed = error.localizedDescription
        }
    }
}

// MARK: Sagas et séries complètes

/// Collections complètes ou non (sagas de films, séries) : manquants, à venir, à vérifier.
struct CompletenessView: View {
    @Environment(Session.self) private var session
    let kind: String
    @State private var status: [String: Any] = [:]
    @State private var filter = "attention"
    @State private var query = ""
    @State private var entries: [String: [[String: Any]]] = [:]
    @State private var nextOffset: [String: Int] = [:]
    @State private var generation = 0

    private var running: Bool { status["running"] as? Bool == true }
    private var movies: Bool { kind == "movie" }
    private var all: [[String: Any]] { (status["groups"] as? [[String: Any]] ?? []).filter { $0["kind"] as? String == kind } }

    private var shown: [[String: Any]] {
        all.filter { group in
            let state = group["status"] as? String ?? ""
            let upcoming = ReleaseSort.number(group["upcomingCount"]) > 0
            let matches = filter == "all" || (filter == "attention" ? (state != "complete" || upcoming) : state == filter)
            return matches && (query.isEmpty || (group["title"] as? String ?? "").localizedCaseInsensitiveContains(query))
        }
    }

    var body: some View {
        List {
            Section {
                if running {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(progressText).font(.footnote).foregroundStyle(Theme.muted)
                    }
                }
                if status["phase"] as? String == "failed" { Text(status["message"] as? String ?? "La vérification a échoué.").foregroundStyle(.orange) }
                if !running && status["phase"] as? String == "complete" { summary }
                Picker("État", selection: $filter) {
                    Text("Manquants, à venir ou à vérifier").tag("attention")
                    Text("Incomplètes").tag("incomplete")
                    Text("À jour").tag("complete")
                    Text("À vérifier").tag("unknown")
                    Text("Toutes").tag("all")
                }
            }
            ForEach(shown.indices, id: \.self) { index in groupRow(shown[index]) }
            if !running && shown.isEmpty && status["phase"] as? String == "complete" {
                Text("Aucun résultat pour ces filtres.").foregroundStyle(Theme.muted)
            }
        }
        .searchable(text: $query, prompt: "Rechercher un titre")
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle(movies ? "Sagas de films" : "Séries")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await load(restart: true) } } label: { Image(systemName: "arrow.clockwise") }
                    .accessibilityLabel("Revérifier")
                    .disabled(running)
            }
        }
        .task { await load(restart: false) }
    }

    private var progressText: String {
        let message = status["message"] as? String ?? "Inventaire des collections…"
        let total = Int(ReleaseSort.number(status["total"]))
        return total > 0 ? "\(message) · \(Int(ReleaseSort.number(status["processed"])))/\(total)" : message
    }

    private var summary: some View {
        var counts: [String: Int] = [:]
        var missing = 0
        for group in all {
            counts[group["status"] as? String ?? "unknown", default: 0] += 1
            missing += Int(ReleaseSort.number(group["missingCount"]))
        }
        return Group {
            LabeledContent("Incomplètes", value: "\(counts["incomplete"] ?? 0)")
            LabeledContent("À jour", value: "\(counts["complete"] ?? 0)")
            LabeledContent("À vérifier", value: "\(counts["unknown"] ?? 0)")
            LabeledContent(movies ? "Films absents" : "Épisodes absents", value: "\(missing)")
        }
    }

    private func groupRow(_ group: [String: Any]) -> some View {
        let id = group["id"] as? String ?? ""
        let missing = Int(ReleaseSort.number(group["missingCount"]))
        let upcoming = Int(ReleaseSort.number(group["upcomingCount"]))
        let state = group["status"] as? String ?? "unknown"
        let label = (missing > 0 ? "\(missing) manquant\(missing > 1 ? "s" : "")" : state == "unknown" ? "À vérifier" : "À jour")
            + (upcoming > 0 ? " · \(upcoming) à venir" : "")
        return DisclosureGroup {
            if let warning = group["warning"] as? String { Text(warning).font(.caption).foregroundStyle(.orange) }
            if let rows = entries[id] {
                if rows.isEmpty { Text("Aucun contenu manquant identifié.").font(.caption).foregroundStyle(Theme.muted) }
                ForEach(rows.indices, id: \.self) { index in entryRow(rows[index]) }
                if let next = nextOffset[id] {
                    Button("Afficher la suite") { Task { await loadGroup(id, offset: next) } }
                }
            } else {
                ProgressView().task { await loadGroup(id, offset: 0) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(group["title"] as? String ?? "").font(.headline)
                Text("\(movies ? "Saga" : "Série") · \(Int(ReleaseSort.number(group["present"])))/\(Int(ReleaseSort.number(group["expected"])).description) présents")
                    .font(.caption).foregroundStyle(Theme.muted)
                SeriesStatusTag(state: state, label: label)
            }
        }
    }

    private func entryRow(_ row: [String: Any]) -> some View {
        let season = Int(ReleaseSort.number(row["season"]))
        let episode = Int(ReleaseSort.number(row["episode"]))
        let prefix = season > 0 ? String(format: "S%02dE%02d · ", season, episode) : ""
        let states = ["missing": "Manquant", "upcoming": "À venir", "undated": "Date inconnue", "unverified": "À vérifier"]
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(prefix + (row["title"] as? String ?? "")).font(.subheadline)
                Text(FileDates.label(row["date"] as? String) ?? (row["date"] as? String ?? "Date non annoncée")).font(.caption2).foregroundStyle(Theme.muted)
            }
            Spacer()
            Text(states[row["state"] as? String ?? ""] ?? "À vérifier").font(.caption.weight(.semibold))
                .foregroundStyle(row["state"] as? String == "missing" ? Color.orange : Theme.muted)
        }
    }

    private func load(restart: Bool) async {
        generation += 1
        let token = generation
        entries = [:]
        nextOffset = [:]
        var current: [String: Any]?
        if !restart { current = (try? await session.noctraJSON("/api/files/completeness/status", timeout: 20)) as? [String: Any] }
        if current == nil || current?["phase"] as? String == "idle" {
            current = (try? await session.noctraSend("POST", "/api/files/completeness/start", json: [String: Any](), timeout: 20)) as? [String: Any]
        }
        if let current { status = current } else { status = ["phase": "failed", "message": "Vérification indisponible."] }
        while running, !Task.isCancelled, token == generation {
            try? await Task.sleep(for: .milliseconds(1500))
            if let json = try? await session.noctraJSON("/api/files/completeness/status", timeout: 20) as? [String: Any] { status = json }
        }
    }

    private func loadGroup(_ id: String, offset: Int) async {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id
        guard let json = try? await session.noctraJSON("/api/files/completeness/group?id=\(encoded)&offset=\(offset)", timeout: 20) as? [String: Any] else {
            if offset == 0 { entries[id] = [] }
            return
        }
        let rows = json["entries"] as? [[String: Any]] ?? []
        entries[id] = offset == 0 ? rows : (entries[id] ?? []) + rows
        nextOffset[id] = json["nextOffset"] as? Int
    }
}

// MARK: État des séries (complète, épisodes manquants, en cours)

struct SeriesStatus: Equatable {
    let state: String
    let label: String
    let detail: String
}

/// États demandés au serveur (/api/library/series-status), deux à la fois, gardés en mémoire.
@MainActor
@Observable
final class SeriesStatusStore {
    static let shared = SeriesStatusStore()
    private(set) var results: [String: SeriesStatus] = [:]
    @ObservationIgnored private var queue: [String] = []
    @ObservationIgnored private var pending: Set<String> = []
    @ObservationIgnored private var active = 0

    func request(_ id: String, session: Session) {
        guard session.hasNoctra, results[id] == nil, !pending.contains(id) else { return }
        pending.insert(id)
        queue.append(id)
        pump(session)
    }

    private func pump(_ session: Session) {
        while active < 2, !queue.isEmpty {
            let id = queue.removeFirst()
            active += 1
            Task {
                let json = try? await session.noctraJSON("/api/library/series-status?id=\(id)", timeout: 120) as? [String: Any]
                results[id] = json.map {
                    SeriesStatus(state: $0["state"] as? String ?? "unknown", label: $0["label"] as? String ?? "Non vérifié", detail: $0["description"] as? String ?? "")
                } ?? SeriesStatus(state: "unknown", label: "Non vérifié", detail: "Vérification momentanément indisponible.")
                pending.remove(id)
                active -= 1
                pump(session)
            }
        }
    }
}

/// Pastille d'état d'une série, couleurs du site (complète, incomplète, en cours, à vérifier).
struct SeriesStatusTag: View {
    let state: String
    let label: String
    var large = false

    var body: some View {
        let colors: (Color, Color) = switch state {
        case "complete": (Color(hex: 0x8AE2C1), Color(hex: 0x142D29))
        case "incomplete": (Color(hex: 0xFFD09B), Color(hex: 0x30241B))
        case "ongoing": (Color(hex: 0xB7C6FF), Color(hex: 0x202840))
        default: (Color(hex: 0xB8C0D3), Color(hex: 0x171D2B))
        }
        Text(label)
            .font(.system(size: large ? 12 : 10, weight: .semibold))
            .lineLimit(1)
            .padding(.horizontal, large ? 8 : 6)
            .padding(.vertical, large ? 3 : 2)
            .foregroundStyle(colors.0)
            .background(colors.1.opacity(0.92), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(colors.0.opacity(0.7), lineWidth: 1))
    }
}

/// État d'une série de la médiathèque, chargé quand la carte apparaît.
struct SeriesStatusBadge: View {
    @Environment(Session.self) private var session
    let id: String
    var large = false

    var body: some View {
        ZStack {
            if let status = SeriesStatusStore.shared.results[id], status.state != "not-series" {
                SeriesStatusTag(state: status.state, label: status.label, large: large)
                    .accessibilityLabel("\(status.label). \(status.detail)")
                    .help(status.detail)
            }
        }
        .task(id: id) { SeriesStatusStore.shared.request(id, session: session) }
    }
}

// MARK: Choix d'un dossier de destination

/// Parcours des dossiers (racines autorisées) pour choisir où déplacer un élément.
struct FolderPickerView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let roots: [[String: Any]]
    @State var root: String
    @State var path: String
    let title: String
    let onPick: (String, String) -> Void
    @State private var folders: [[String: Any]] = []
    @State private var parent: String?
    @State private var loading = false
    @State private var failed: String?

    var body: some View {
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(roots.indices, id: \.self) { index in
                            let id = roots[index]["id"] as? String ?? ""
                            Button(roots[index]["label"] as? String ?? id) { Task { await open(id, "") } }
                                .buttonStyle(.bordered)
                                .tint(id == root ? Theme.accent : .gray)
                                .disabled(roots[index]["available"] as? Bool == false)
                        }
                    }
                }
                .listRowBackground(Color.clear)
                Text("/" + path).font(.system(.caption, design: .monospaced)).foregroundStyle(Theme.muted)
                if let parent {
                    Button { Task { await open(root, parent) } } label: { Label("Dossier parent", systemImage: "arrow.turn.left.up") }
                }
                if loading { ProgressView() }
                if let failed { Text(failed).foregroundStyle(.orange) }
            }
            Section("Dossiers") {
                ForEach(folders.indices, id: \.self) { index in
                    let folder = folders[index]
                    Button { Task { await open(root, folder["path"] as? String ?? "") } } label: {
                        Label(folder["name"] as? String ?? "", systemImage: "folder.fill")
                    }
                    .foregroundStyle(.white)
                }
                if !loading && folders.isEmpty { Text("Aucun sous-dossier.").foregroundStyle(Theme.muted) }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("Déplacer ici") { onPick(root, path) } }
        }
        .task { await open(root, path) }
    }

    private func open(_ target: String, _ at: String) async {
        loading = true
        defer { loading = false }
        let encode = { (value: String) in value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? value }
        do {
            let json = try await session.noctraJSON("/api/files?root=\(encode(target))&path=\(encode(at))", timeout: 30) as? [String: Any]
            root = target
            path = json?["path"] as? String ?? at
            parent = json?["parent"] as? String
            folders = (json?["items"] as? [[String: Any]] ?? []).filter { $0["type"] as? String == "directory" }
            failed = nil
        } catch {
            failed = error.localizedDescription
        }
    }
}

// MARK: Stockage de la seedbox

/// Stockage de la seedbox en temps réel (administrateurs) : espace utilisé et libre,
/// quota du compte, taille de chaque médiathèque ; actualisé toutes les 10 s.
struct StorageView: View {
    @Environment(Session.self) private var session
    @State private var data: [String: Any] = [:]
    @State private var failed: String?
    @State private var loaded = false

    private var capacity: [String: Any]? { data["capacity"] as? [String: Any] }

    var body: some View {
        List {
            Section {
                if let capacity {
                    let used = ReleaseSort.number(capacity["used"])
                    let total = ReleaseSort.number(capacity["total"])
                    let ratio = total > 0 ? min(1, used / total) : 0
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(AdminFormat.bytes(used)).font(.display(28, .bold, relativeTo: .title))
                            Text("sur \(AdminFormat.bytes(total))").foregroundStyle(Theme.muted)
                            Spacer()
                            Text("\(Int(ratio * 100)) %").font(.headline).foregroundStyle(ratio > 0.9 ? .orange : Theme.accent)
                        }
                        ProgressView(value: ratio).tint(ratio > 0.9 ? .orange : Theme.accent)
                        Text("\(AdminFormat.bytes(ReleaseSort.number(capacity["free"]))) libres · \(capacity["source"] as? String == "quota" ? "quota du compte" : "disque")")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 6)
                } else if !loaded {
                    ProgressView()
                } else {
                    Text("Stockage indisponible sur ce serveur.").foregroundStyle(Theme.muted)
                }
                if let failed { Text(failed).foregroundStyle(.orange) }
            } footer: {
                Text("Actualisé toutes les 10 secondes.")
            }
            if let disk = data["disk"] as? [String: Any], data["quota"] is [String: Any] {
                Section("Disque de la seedbox") {
                    LabeledContent("Utilisé", value: AdminFormat.bytes(ReleaseSort.number(disk["used"])))
                    LabeledContent("Libre", value: AdminFormat.bytes(ReleaseSort.number(disk["free"])))
                    LabeledContent("Total", value: AdminFormat.bytes(ReleaseSort.number(disk["total"])))
                }
            }
            let libraries = data["libraries"] as? [[String: Any]] ?? []
            Section {
                ForEach(libraries.indices, id: \.self) { index in
                    LabeledContent(libraries[index]["label"] as? String ?? "", value: AdminFormat.bytes(ReleaseSort.number(libraries[index]["bytes"])))
                }
                if libraries.isEmpty { Text(data["librariesComputing"] as? Bool == true ? "Calcul en cours…" : "Tailles non disponibles.").foregroundStyle(Theme.muted) }
            } header: {
                Text("Médiathèques")
            } footer: {
                if data["librariesComputing"] as? Bool == true { Text("Recalcul des tailles en cours (quelques minutes pour de grosses médiathèques).") }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle("Stockage")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load(refresh: true) }
        .task {
            var first = true
            while !Task.isCancelled {
                await load(refresh: first)
                first = false
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }

    private func load(refresh: Bool) async {
        do {
            data = try await session.noctraJSON("/api/files/storage\(refresh ? "?refresh=1" : "")", timeout: 30) as? [String: Any] ?? [:]
            failed = nil
        } catch {
            // 404 : route absente, le serveur n'a pas la version des applications.
            failed = error.localizedDescription.contains("(404)") ? "Ton serveur Noctra n’a pas encore cette fonction : il doit tourner sur la version des applications (branche claude/hopeful-mccarthy-mihj1n)." : error.localizedDescription
        }
        loaded = true
    }
}
