import SwiftUI
import UniformTypeIdentifiers
import WebKit

// Administration (comptes administrateurs) : tableau de bord du serveur,
// utilisateurs, téléchargements qBittorrent de Noctra, tableau de bord complet.

extension Session {
    /// Réponse JSON brute d'une route Jellyfin (écrans d'administration).
    func jellyfinJSON(_ path: String, _ query: [String: String?] = [:]) async throws -> Any {
        try await Self.parseJSON(try await data("GET", path, query))
    }
}

enum AdminFormat {
    static func bytes(_ value: Double) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(max(0, value)), countStyle: .file)
    }

    static func speed(_ value: Double) -> String { bytes(value) + "/s" }

    static func duration(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0, seconds < 8_640_000 else { return "∞" }
        let total = Int(seconds)
        if total >= 86_400 { return "\(total / 86_400) j \(total % 86_400 / 3600) h" }
        if total >= 3600 { return "\(total / 3600) h \(String(format: "%02d", total % 3600 / 60))" }
        if total >= 60 { return "\(total / 60) min" }
        return "\(total) s"
    }

    /// Dates Jellyfin (« 2026-10-18T18:43:29.1234567Z »).
    static func date(_ value: Any?) -> Date? {
        guard var text = value as? String, !text.isEmpty else { return nil }
        text = text.replacingOccurrences(of: "\\.\\d+", with: "", options: .regularExpression)
        if !text.hasSuffix("Z") && !text.contains("+") { text += "Z" }
        return ISO8601DateFormatter().date(from: text)
    }

    static func relative(_ value: Any?) -> String {
        guard let date = date(value) else { return "" }
        return date.formatted(.relative(presentation: .named))
    }
}

// MARK: Tableau de bord

struct AdminDashboardView: View {
    @Environment(Session.self) private var session
    @State private var info: [String: Any] = [:]
    @State private var sessions: [[String: Any]] = []
    @State private var tasks: [[String: Any]] = []
    @State private var activity: [[String: Any]] = []
    @State private var loaded = false
    @State private var confirm: ServerAction?
    @State private var note: String?
    @State private var messageTarget: MessageTarget?
    @State private var messageText = ""

    enum ServerAction: String, Identifiable {
        case restart, shutdown
        var id: String { rawValue }
    }

    struct MessageTarget: Identifiable {
        let id: String
        let name: String
    }

    private var playing: [[String: Any]] { sessions.filter { $0["NowPlayingItem"] != nil } }
    private var idle: [[String: Any]] { sessions.filter { $0["NowPlayingItem"] == nil } }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(info["ServerName"] as? String ?? "Serveur")
                        .font(.display(24, .bold, relativeTo: .title2))
                        .foregroundStyle(Theme.titleGradient)
                    Text(["Version \(info["Version"] as? String ?? "—")", info["OperatingSystemDisplayName"] as? String].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                    HStack(spacing: 8) {
                        badge("\(playing.count) lecture\(playing.count > 1 ? "s" : "")", icon: "play.circle.fill", color: Theme.lilac)
                        badge("\(sessions.count) appareil\(sessions.count > 1 ? "s" : "")", icon: "iphone.and.arrow.forward", color: Theme.cyan)
                        if info["HasPendingRestart"] as? Bool == true { badge("Redémarrage requis", icon: "arrow.clockwise", color: .orange) }
                        if info["HasUpdateAvailable"] as? Bool == true { badge("Mise à jour", icon: "arrow.down.circle", color: Theme.teal) }
                    }
                }
                .padding(.vertical, 6)
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
            }

            Section("Lectures en cours") {
                if playing.isEmpty {
                    Text(loaded ? "Aucune lecture en ce moment." : "Chargement…").foregroundStyle(Theme.muted)
                }
                ForEach(playing.indices, id: \.self) { index in
                    playingRow(playing[index])
                }
            }

            if !idle.isEmpty {
                Section("Appareils connectés") {
                    ForEach(idle.indices, id: \.self) { index in
                        let entry = idle[index]
                        HStack(spacing: 12) {
                            Image(systemName: deviceIcon(entry)).foregroundStyle(Theme.accent).frame(width: 26)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry["DeviceName"] as? String ?? "Appareil").font(.subheadline.weight(.semibold))
                                Text([entry["UserName"] as? String, entry["Client"] as? String, AdminFormat.relative(entry["LastActivityDate"])]
                                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
            }

            Section("Tâches planifiées") {
                ForEach(tasks.indices, id: \.self) { index in
                    taskRow(tasks[index])
                }
            }

            if !activity.isEmpty {
                Section("Activité récente") {
                    ForEach(activity.indices, id: \.self) { index in
                        let entry = activity[index]
                        VStack(alignment: .leading, spacing: 3) {
                            Text(entry["Name"] as? String ?? "").font(.subheadline)
                            if let overview = entry["ShortOverview"] as? String, !overview.isEmpty {
                                Text(overview).font(.caption).foregroundStyle(Theme.muted).lineLimit(2)
                            }
                            Text(AdminFormat.relative(entry["Date"])).font(.caption2).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Tableau de bord")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { Task { await refreshLibraries() } } label: { Label("Actualiser les médiathèques", systemImage: "arrow.triangle.2.circlepath") }
                    Divider()
                    Button { confirm = .restart } label: { Label("Redémarrer le serveur", systemImage: "restart") }
                    Button(role: .destructive) { confirm = .shutdown } label: { Label("Arrêter le serveur", systemImage: "power") }
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
        .confirmationDialog(confirm == .shutdown ? "Arrêter le serveur ?" : "Redémarrer le serveur ?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            Button(confirm == .shutdown ? "Arrêter" : "Redémarrer", role: .destructive) {
                let action = confirm
                Task { await server(action) }
            }
        } message: {
            Text("Les lectures en cours seront interrompues.")
        }
        .alert("Message", isPresented: Binding(get: { messageTarget != nil }, set: { if !$0 { messageTarget = nil } })) {
            TextField("Texte affiché sur l’écran", text: $messageText)
            Button("Envoyer") {
                let target = messageTarget
                Task { await sendMessage(target) }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text(messageTarget.map { "Vers « \($0.name) »" } ?? "")
        }
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    private func badge(_ text: String, icon: String, color: Color) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .glassEffect(.regular.tint(color.opacity(0.35)), in: Capsule())
    }

    private func deviceIcon(_ entry: [String: Any]) -> String {
        let client = ((entry["Client"] as? String ?? "") + " " + (entry["DeviceName"] as? String ?? "")).lowercased()
        if client.contains("tv") || client.contains("android") { return "tv" }
        if client.contains("ipad") { return "ipad" }
        if client.contains("iphone") || client.contains("ios") { return "iphone" }
        return "desktopcomputer"
    }

    private func playingRow(_ entry: [String: Any]) -> some View {
        let item = entry["NowPlayingItem"] as? [String: Any] ?? [:]
        let state = entry["PlayState"] as? [String: Any] ?? [:]
        let id = entry["Id"] as? String ?? ""
        let paused = state["IsPaused"] as? Bool ?? false
        let position = Double(state["PositionTicks"] as? Int64 ?? Int64(state["PositionTicks"] as? Int ?? 0)) / 10_000_000
        let length = Double(item["RunTimeTicks"] as? Int64 ?? Int64(item["RunTimeTicks"] as? Int ?? 0)) / 10_000_000
        let series = item["SeriesName"] as? String
        let transcoding = entry["TranscodingInfo"] as? [String: Any]
        let method: String = {
            guard let transcoding else { return "Lecture directe" }
            if transcoding["IsVideoDirect"] as? Bool == true { return "Remux · vidéo d’origine" }
            let reasons = (transcoding["TranscodeReasons"] as? [String] ?? []).prefix(2).joined(separator: ", ")
            return reasons.isEmpty ? "Transcodage" : "Transcodage · \(reasons)"
        }()
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                RemoteImage(url: session.image(item["Id"] as? String, type: "Primary", width: 200))
                    .frame(width: 44, height: 66)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(series ?? (item["Name"] as? String ?? "")).font(.headline).lineLimit(1)
                    if series != nil { Text(item["Name"] as? String ?? "").font(.subheadline).lineLimit(1) }
                    Text([entry["UserName"] as? String, entry["DeviceName"] as? String].compactMap { $0 }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(Theme.muted)
                    Text(method).font(.caption2).foregroundStyle(transcoding == nil ? Theme.teal : .orange)
                }
                Spacer(minLength: 0)
                Image(systemName: paused ? "pause.circle.fill" : "play.circle.fill").font(.title2).foregroundStyle(Theme.accent)
            }
            if length > 0 {
                ProgressLine(value: min(1, position / length))
                Text("\(ItemDetailView.clock(position)) / \(ItemDetailView.clock(length))")
                    .font(.caption2.monospacedDigit()).foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { Task { await command(id, "Stop") } } label: { Label("Arrêter", systemImage: "stop.fill") }
            Button { messageTarget = MessageTarget(id: id, name: entry["DeviceName"] as? String ?? "Appareil") } label: { Label("Message", systemImage: "text.bubble") }
                .tint(Theme.cyan)
        }
        .swipeActions(edge: .leading) {
            Button { Task { await command(id, paused ? "Unpause" : "Pause") } } label: {
                Label(paused ? "Reprendre" : "Pause", systemImage: paused ? "play.fill" : "pause.fill")
            }
            .tint(Theme.violet)
        }
        .contextMenu {
            Button { Task { await command(id, paused ? "Unpause" : "Pause") } } label: { Label(paused ? "Reprendre" : "Mettre en pause", systemImage: paused ? "play.fill" : "pause.fill") }
            Button { messageTarget = MessageTarget(id: id, name: entry["DeviceName"] as? String ?? "Appareil") } label: { Label("Envoyer un message", systemImage: "text.bubble") }
            Button(role: .destructive) { Task { await command(id, "Stop") } } label: { Label("Arrêter la lecture", systemImage: "stop.fill") }
        }
    }

    private func taskRow(_ task: [String: Any]) -> some View {
        let id = task["Id"] as? String ?? ""
        let running = (task["State"] as? String) == "Running"
        let progress = (task["CurrentProgressPercentage"] as? Double) ?? 0
        let last = task["LastExecutionResult"] as? [String: Any]
        let failed = (last?["Status"] as? String).map { $0 != "Completed" } ?? false
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(task["Name"] as? String ?? "").font(.subheadline.weight(.semibold))
                if running {
                    ProgressView(value: progress, total: 100).tint(Theme.lilac)
                } else if let last {
                    Text("\(failed ? "Échec" : "Terminée") \(AdminFormat.relative(last["EndTimeUtc"]))")
                        .font(.caption).foregroundStyle(failed ? .orange : Theme.muted)
                }
            }
            Spacer()
            Button {
                Task { await runTask(id, running: running) }
            } label: {
                Image(systemName: running ? "stop.fill" : "play.fill").frame(width: 34, height: 34)
            }
            .buttonStyle(.glass)
        }
    }

    private func load() async {
        async let infoTask = try? session.jellyfinJSON("/System/Info")
        async let sessionsTask = try? session.jellyfinJSON("/Sessions", ["activeWithinSeconds": "960"])
        async let tasksTask = try? session.jellyfinJSON("/ScheduledTasks", ["isHidden": "false"])
        async let activityTask = try? session.jellyfinJSON("/System/ActivityLog/Entries", ["startIndex": "0", "limit": "25"])
        let (info, list, scheduled, log) = await (infoTask, sessionsTask, tasksTask, activityTask)
        if let info = info as? [String: Any] { self.info = info }
        if let list = list as? [[String: Any]] {
            sessions = list.filter { ($0["DeviceId"] as? String) != session.deviceId || $0["NowPlayingItem"] != nil }
        }
        if let scheduled = scheduled as? [[String: Any]] {
            tasks = scheduled.sorted { a, b in
                let runningA = (a["State"] as? String) == "Running", runningB = (b["State"] as? String) == "Running"
                if runningA != runningB { return runningA }
                return (a["Name"] as? String ?? "") < (b["Name"] as? String ?? "")
            }
        }
        if let log = log as? [String: Any] { activity = log["Items"] as? [[String: Any]] ?? [] }
        loaded = true
    }

    private func command(_ id: String, _ name: String) async {
        _ = try? await session.data("POST", "/Sessions/\(id)/Playing/\(name)")
        await load()
    }

    private func sendMessage(_ target: MessageTarget?) async {
        guard let target, !messageText.isEmpty else { return }
        _ = try? await session.data("POST", "/Sessions/\(target.id)/Message", json: ["Header": "Noctra", "Text": messageText, "TimeoutMs": 10_000])
        messageText = ""
        note = "Message envoyé à « \(target.name) »."
    }

    private func runTask(_ id: String, running: Bool) async {
        _ = try? await session.data(running ? "DELETE" : "POST", "/ScheduledTasks/Running/\(id)")
        await load()
    }

    private func refreshLibraries() async {
        do {
            if session.hasNoctra { _ = try await session.noctraSend("POST", "/api/libraries/refresh", json: nil) }
            else { _ = try await session.data("POST", "/Library/Refresh") }
            note = "Actualisation des médiathèques lancée."
        } catch {
            note = error.localizedDescription
        }
        await load()
    }

    private func server(_ action: ServerAction?) async {
        guard let action else { return }
        do {
            _ = try await session.data("POST", action == .restart ? "/System/Restart" : "/System/Shutdown")
            note = action == .restart ? "Redémarrage du serveur demandé." : "Arrêt du serveur demandé."
        } catch {
            note = error.localizedDescription
        }
    }
}

// MARK: Utilisateurs

struct UsersAdminView: View {
    @Environment(Session.self) private var session
    @State private var users: [[String: Any]] = []
    @State private var adding = false
    @State private var loaded = false

    var body: some View {
        List {
            ForEach(users.indices, id: \.self) { index in
                let user = users[index]
                let id = user["Id"] as? String ?? ""
                let policy = user["Policy"] as? [String: Any] ?? [:]
                NavigationLink {
                    UserEditView(userId: id) { Task { await load() } }
                } label: {
                    HStack(spacing: 12) {
                        UserAvatar(session: session, id: id, name: user["Name"] as? String ?? "?", tag: user["PrimaryImageTag"] as? String)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(user["Name"] as? String ?? "").font(.headline)
                                if policy["IsAdministrator"] as? Bool == true {
                                    Image(systemName: "crown.fill").font(.caption).foregroundStyle(.yellow)
                                }
                            }
                            Text(policy["IsDisabled"] as? Bool == true ? "Désactivé" :
                                    (AdminFormat.relative(user["LastActivityDate"]).isEmpty ? "Jamais connecté" : "Actif \(AdminFormat.relative(user["LastActivityDate"]))"))
                                .font(.caption)
                                .foregroundStyle(policy["IsDisabled"] as? Bool == true ? .orange : Theme.muted)
                        }
                    }
                }
            }
            if loaded && users.isEmpty {
                Text("Liste des utilisateurs indisponible.").foregroundStyle(Theme.muted)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle("Utilisateurs")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "person.badge.plus") }
            }
        }
        .sheet(isPresented: $adding) {
            NewUserSheet { Task { await load() } }
                .presentationDetents([.medium])
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        if let list = try? await session.jellyfinJSON("/Users") as? [[String: Any]] {
            withAnimation(Theme.spring) {
                users = list.sorted { ($0["Name"] as? String ?? "").localizedCaseInsensitiveCompare($1["Name"] as? String ?? "") == .orderedAscending }
            }
        }
        loaded = true
    }
}

struct UserAvatar: View {
    let session: Session
    let id: String
    let name: String
    let tag: String?

    var body: some View {
        ZStack {
            Circle().fill(Theme.gradient)
            Text(String(name.prefix(1)).uppercased()).font(.headline).foregroundStyle(Theme.onAccent)
            if let tag, let url = session.url("/Users/\(id)/Images/Primary", ["tag": tag, "maxWidth": "120"]) {
                RemoteImage(url: url).clipShape(Circle())
            }
        }
        .frame(width: 42, height: 42)
    }
}

struct NewUserSheet: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let created: () -> Void
    @State private var name = ""
    @State private var password = ""
    @State private var working = false
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nom d’utilisateur", text: $name)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Mot de passe (facultatif)", text: $password)
                }
                if let problem { Section { Text(problem).foregroundStyle(.orange) } }
            }
            .navigationTitle("Nouvel utilisateur")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Créer") { Task { await create() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || working)
                }
            }
        }
    }

    private func create() async {
        working = true
        defer { working = false }
        do {
            _ = try await session.data("POST", "/Users/New", json: ["Name": name.trimmingCharacters(in: .whitespaces), "Password": password])
            created()
            dismiss()
        } catch {
            problem = error.localizedDescription
        }
    }
}

/// Fiche d'un utilisateur : nom, mot de passe, droits, médiathèques, suppression.
struct UserEditView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    let userId: String
    let changed: () -> Void
    @State private var user: [String: Any] = [:]
    @State private var policy: [String: Any] = [:]
    @State private var name = ""
    @State private var password = ""
    @State private var folders: [(id: String, name: String)] = []
    @State private var dirty = false
    @State private var saving = false
    @State private var note: String?
    @State private var confirmDelete = false

    private static let flags: [(key: String, label: String)] = [
        ("IsAdministrator", "Administrateur"),
        ("IsDisabled", "Compte désactivé"),
        ("IsHidden", "Masqué sur l’écran de connexion"),
        ("EnableRemoteAccess", "Accès hors du réseau local"),
        ("EnableMediaPlayback", "Lecture des médias"),
        ("EnableVideoPlaybackTranscoding", "Transcodage vidéo"),
        ("EnableAudioPlaybackTranscoding", "Transcodage audio"),
        ("EnablePlaybackRemuxing", "Remux (changement de conteneur)"),
        ("EnableContentDownloading", "Téléchargement des médias"),
        ("EnableLiveTvAccess", "TV en direct du serveur"),
        ("EnableRemoteControlOfOtherUsers", "Contrôle des autres utilisateurs"),
        ("EnableSharedDeviceControl", "Contrôle des appareils partagés"),
        ("EnableContentDeletion", "Suppression de médias")
    ]

    var body: some View {
        Form {
            Section("Profil") {
                TextField("Nom", text: Binding(get: { name }, set: { name = $0; dirty = true }))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if let date = user["LastActivityDate"], !AdminFormat.relative(date).isEmpty {
                    LabeledContent("Dernière activité", value: AdminFormat.relative(date))
                }
            }
            Section {
                SecureField("Nouveau mot de passe", text: $password)
                Button("Définir le mot de passe") { Task { await setPassword(reset: false) } }
                    .disabled(password.isEmpty)
                Button("Supprimer le mot de passe", role: .destructive) { Task { await setPassword(reset: true) } }
            } header: {
                Text("Mot de passe")
            }
            Section("Droits") {
                ForEach(Self.flags, id: \.key) { flag in
                    Toggle(flag.label, isOn: binding(flag.key))
                }
                Picker("SyncPlay", selection: Binding(get: { policy["SyncPlayAccess"] as? String ?? "CreateAndJoinGroups" },
                                                      set: { policy["SyncPlayAccess"] = $0; dirty = true })) {
                    Text("Créer et rejoindre").tag("CreateAndJoinGroups")
                    Text("Rejoindre seulement").tag("JoinGroups")
                    Text("Désactivé").tag("None")
                }
                Picker("Débit hors réseau local", selection: Binding(get: { policy["RemoteClientBitrateLimit"] as? Int ?? 0 },
                                                                    set: { policy["RemoteClientBitrateLimit"] = $0; dirty = true })) {
                    Text("Illimité").tag(0)
                    ForEach([60, 40, 20, 12, 8, 4, 2], id: \.self) { value in Text("\(value) Mb/s").tag(value * 1_000_000) }
                }
                Picker("Lectures simultanées", selection: Binding(get: { policy["MaxActiveSessions"] as? Int ?? 0 },
                                                                 set: { policy["MaxActiveSessions"] = $0; dirty = true })) {
                    Text("Illimitées").tag(0)
                    ForEach(1...6, id: \.self) { value in Text("\(value)").tag(value) }
                }
            }
            Section("Médiathèques") {
                Toggle("Toutes les médiathèques", isOn: binding("EnableAllFolders"))
                if policy["EnableAllFolders"] as? Bool != true {
                    ForEach(folders, id: \.id) { folder in
                        Toggle(folder.name, isOn: Binding(
                            get: { (policy["EnabledFolders"] as? [String] ?? []).contains(folder.id) },
                            set: { on in
                                var list = policy["EnabledFolders"] as? [String] ?? []
                                list.removeAll { $0 == folder.id }
                                if on { list.append(folder.id) }
                                policy["EnabledFolders"] = list
                                dirty = true
                            }))
                    }
                }
            }
            if let note { Section { Text(note).foregroundStyle(Theme.accent) } }
            Section {
                Button("Supprimer l’utilisateur", role: .destructive) { confirmDelete = true }
                    .disabled(userId == session.userId)
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground())
        .navigationTitle(name.isEmpty ? "Utilisateur" : name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text("Enregistrer") }
                }
                .disabled(!dirty || saving)
            }
        }
        .confirmationDialog("Supprimer « \(name) » ?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { Task { await delete() } }
        } message: {
            Text("Le compte, sa progression et ses favoris seront supprimés du serveur.")
        }
        .sensoryFeedback(.success, trigger: note)
        .task { await load() }
    }

    private func binding(_ key: String) -> Binding<Bool> {
        Binding(get: { policy[key] as? Bool ?? false }, set: { policy[key] = $0; dirty = true })
    }

    private func load() async {
        if let json = try? await session.jellyfinJSON("/Users/\(userId)") as? [String: Any] {
            user = json
            policy = json["Policy"] as? [String: Any] ?? [:]
            name = json["Name"] as? String ?? ""
        }
        if let media = try? await session.jellyfinJSON("/Library/MediaFolders", ["isHidden": "false"]) as? [String: Any] {
            folders = (media["Items"] as? [[String: Any]] ?? []).compactMap { entry in
                guard let id = entry["Id"] as? String else { return nil }
                return (id, entry["Name"] as? String ?? id)
            }
        }
        dirty = false
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await session.send("POST", paths: ["/Users/\(userId)/Policy"], json: policy)
            let trimmed = name.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty, trimmed != user["Name"] as? String {
                var updated = user
                updated["Name"] = trimmed
                updated["Policy"] = policy
                try await session.send("POST", paths: ["/Users/\(userId)", "/Users"], ["userId": userId], json: updated)
            }
            note = "Modifications enregistrées."
            changed()
            await load()
        } catch {
            note = error.localizedDescription
        }
    }

    private func setPassword(reset: Bool) async {
        do {
            let body: [String: Any] = reset ? ["ResetPassword": true] : ["NewPw": password, "CurrentPw": "", "ResetPassword": false]
            try await session.send("POST", paths: ["/Users/\(userId)/Password", "/Users/Password"], ["userId": userId], json: body)
            password = ""
            note = reset ? "Mot de passe supprimé." : "Mot de passe modifié."
        } catch {
            note = error.localizedDescription
        }
    }

    private func delete() async {
        do {
            _ = try await session.data("DELETE", "/Users/\(userId)")
            changed()
            dismiss()
        } catch {
            note = error.localizedDescription
        }
    }
}

// MARK: Téléchargements (qBittorrent via Noctra)

struct DownloadsView: View {
    @Environment(Session.self) private var session
    @State private var overview: [String: Any] = [:]
    @State private var torrents: [[String: Any]] = []
    @State private var filter: Filter = .all
    @State private var importing = false
    @State private var deleting: Pending?
    @State private var note: String?
    @State private var failed = false

    enum Filter: String, CaseIterable {
        case all = "Tous", downloading = "En cours", done = "Terminés", paused = "En pause", errors = "Erreurs"
    }

    struct Pending: Identifiable {
        let id: String
        let name: String
    }

    private var shown: [[String: Any]] {
        torrents.filter { torrent in
            let errored = torrent["errored"] as? Bool == true
            let active = torrent["active"] as? Bool == true
            let completed = torrent["completed"] as? Bool == true
            switch filter {
            case .all: return true
            case .downloading: return active && !completed && !errored
            case .done: return completed && !errored
            case .paused: return !active && !errored
            case .errors: return errored
            }
        }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    stat("arrow.down", AdminFormat.speed(number(overview["downloadSpeed"])), Theme.cyan)
                    stat("arrow.up", AdminFormat.speed(number(overview["uploadSpeed"])), Theme.pink)
                    if overview["freeSpace"] != nil {
                        stat("internaldrive", AdminFormat.bytes(number(overview["freeSpace"])), Theme.teal)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                Picker("Filtre", selection: $filter) {
                    ForEach(Filter.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                if let note { Text(note).font(.footnote).foregroundStyle(Theme.accent) }
                if failed && torrents.isEmpty { Text("Centre de téléchargements injoignable.").foregroundStyle(.orange) }
            }
            Section {
                ForEach(shown.indices, id: \.self) { index in
                    row(shown[index])
                }
                if shown.isEmpty && !failed {
                    Text(torrents.isEmpty ? "Chargement…" : "Aucun torrent dans cette catégorie.").foregroundStyle(Theme.muted)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AuroraBackground(palette: .requests))
        .navigationTitle("Téléchargements")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { importing = true } label: { Image(systemName: "plus") }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [UTType(filenameExtension: "torrent") ?? .data]) { result in
            if case let .success(url) = result { Task { await add(url) } }
        }
        .confirmationDialog("Supprimer ce torrent ?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible, presenting: deleting) { pending in
            Button("Torrent uniquement") { Task { await remove(pending, files: false) } }
            Button("Torrent et fichiers", role: .destructive) { Task { await remove(pending, files: true) } }
        } message: { pending in
            Text(pending.name)
        }
        .animation(Theme.spring, value: filter)
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    private func number(_ value: Any?) -> Double {
        (value as? Double) ?? (value as? Int).map(Double.init) ?? 0
    }

    private func stat(_ icon: String, _ value: String, _ color: Color) -> some View {
        Label(value, systemImage: icon)
            .font(.subheadline.weight(.semibold).monospacedDigit())
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .glassEffect(.regular.tint(color.opacity(0.3)), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func row(_ torrent: [String: Any]) -> some View {
        let hash = torrent["hash"] as? String ?? ""
        let name = torrent["name"] as? String ?? ""
        let progress = number(torrent["progress"])
        let active = torrent["active"] as? Bool == true
        let completed = torrent["completed"] as? Bool == true
        let errored = torrent["errored"] as? Bool == true
        let down = number(torrent["downloadSpeed"]), up = number(torrent["uploadSpeed"])
        let pending = Pending(id: hash, name: name)
        return VStack(alignment: .leading, spacing: 6) {
            Text(name).font(.subheadline.weight(.semibold)).lineLimit(2)
            ProgressLine(value: progress)
            HStack {
                Text([torrent["stateLabel"] as? String, "\(Int(progress * 100)) %", AdminFormat.bytes(number(torrent["size"]))].compactMap { $0 }.joined(separator: " · "))
                    .foregroundStyle(errored ? .orange : Theme.muted)
                Spacer()
                if active && !completed && down > 0 { Text("↓ \(AdminFormat.speed(down)) · \(AdminFormat.duration(number(torrent["eta"])))") }
                else if up > 0 { Text("↑ \(AdminFormat.speed(up))") }
            }
            .font(.caption.monospacedDigit())
            .lineLimit(1)
        }
        .padding(.vertical, 4)
        .swipeActions(edge: .leading) {
            Button { Task { await action(hash, active ? "pause" : "resume") } } label: {
                Label(active ? "Pause" : "Reprendre", systemImage: active ? "pause.fill" : "play.fill")
            }
            .tint(Theme.violet)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { deleting = pending } label: { Label("Supprimer", systemImage: "trash") }
        }
        .contextMenu {
            Button { Task { await action(hash, active ? "pause" : "resume") } } label: { Label(active ? "Mettre en pause" : "Reprendre", systemImage: active ? "pause.fill" : "play.fill") }
            Button { Task { await action(hash, "recheck") } } label: { Label("Revérifier", systemImage: "checkmark.shield") }
            Button { Task { await action(hash, "reannounce") } } label: { Label("Réannoncer", systemImage: "antenna.radiowaves.left.and.right") }
            Button { Task { await action(hash, "top") } } label: { Label("Priorité maximale", systemImage: "arrow.up.to.line") }
            Button { Task { await action(hash, "bottom") } } label: { Label("Priorité minimale", systemImage: "arrow.down.to.line") }
            Divider()
            Button(role: .destructive) { deleting = pending } label: { Label("Supprimer…", systemImage: "trash") }
        }
    }

    private func load() async {
        guard let json = try? await session.noctraJSON("/api/downloads?live=\(Int(Date().timeIntervalSince1970))", timeout: 12) as? [String: Any] else {
            failed = true
            return
        }
        failed = false
        overview = json
        torrents = json["torrents"] as? [[String: Any]] ?? []
    }

    private func action(_ hash: String, _ name: String) async {
        do {
            _ = try await session.noctraSend("POST", "/api/downloads/\(hash)/\(name)", json: nil)
        } catch {
            note = error.localizedDescription
        }
        await load()
    }

    private func remove(_ pending: Pending, files: Bool) async {
        do {
            _ = try await session.noctraSend("POST", "/api/downloads/\(pending.id)/delete", json: ["deleteFiles": files])
            note = files ? "Torrent et fichiers supprimés." : "Torrent supprimé, fichiers conservés."
        } catch {
            note = error.localizedDescription
        }
        await load()
    }

    private func add(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { note = "Fichier illisible."; return }
        do {
            let result = try await session.noctraSend("POST", "/api/downloads/add", json: [
                "name": url.lastPathComponent, "dataBase64": data.base64EncodedString(), "startPaused": false
            ]) as? [String: Any]
            note = result?["alreadyPresent"] as? Bool == true ? "Ce torrent est déjà dans la liste." : "Torrent ajouté."
        } catch {
            note = error.localizedDescription
        }
        await load()
    }
}
