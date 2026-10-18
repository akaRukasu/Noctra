import SwiftUI
import UIKit

/// Chaîne d'un catalogue du serveur Noctra (données gardées telles quelles).
struct LiveChannel: Identifiable, Hashable {
    let id: String
    let name: String
    let logo: String?
    let group: String?
    let raw: [String: Any]

    static func == (lhs: LiveChannel, rhs: LiveChannel) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// Sources TV du serveur Noctra.
struct LiveSourcesView: View {
    @Environment(Session.self) private var session
    @State private var sources: [TVSourceRoute] = []
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        ScrollView {
            if !session.hasNoctra {
                MessageView(icon: "antenna.radiowaves.left.and.right.slash", text: "La TV en direct demande le serveur Noctra (adresse …/noctra).")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
                    ForEach(sources, id: \.self) { source in
                        NavigationLink(value: source) {
                            VStack(alignment: .leading, spacing: 10) {
                                Image(systemName: "dot.radiowaves.left.and.right")
                                    .font(.title2.weight(.semibold))
                                    .foregroundStyle(Theme.accent)
                                Text(source.name)
                                    .font(.headline)
                                    .multilineTextAlignment(.leading)
                                    .lineLimit(2)
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                            .padding(16)
                            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        }
                        .buttonStyle(PressableStyle())
                        .foregroundStyle(.white)
                    }
                }
                .padding(20)
                if loading && sources.isEmpty { LoadingView() }
                if failed && sources.isEmpty {
                    MessageView(icon: "wifi.exclamationmark", text: "Sources TV indisponibles.") { Task { await load() } }
                }
            }
        }
        .background(AuroraBackground())
        .navigationTitle("TV en direct")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { AccountButton() } }
        .refreshable { await load() }
        .task { if sources.isEmpty && session.hasNoctra { await load() } }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        guard let json = try? await session.noctraJSON("/api/tv/sources") as? [String: Any],
              let list = json["sources"] as? [[String: Any]] else { failed = true; return }
        failed = false
        withAnimation(Theme.spring) {
            sources = list.compactMap { entry in
                guard let id = entry["id"] as? String else { return nil }
                if (entry["enabled"] as? Bool) == false { return nil }
                return TVSourceRoute(id: id, name: (entry["name"] as? String) ?? id, ref: nil)
            }
        }
    }
}

/// Chaînes d'une source (ou bouquets de la source), recherche, lecture native.
struct LiveChannelsView: View {
    @Environment(Session.self) private var session
    let route: TVSourceRoute
    @State private var channels: [LiveChannel] = []
    @State private var bouquets: [TVSourceRoute] = []
    @State private var loading = true
    @State private var query = ""
    @State private var opening: String?
    @State private var problem: String?
    @State private var taps = 0

    private var shown: [LiveChannel] {
        let term = query.trimmingCharacters(in: .whitespaces).lowercased()
        return term.isEmpty ? channels : channels.filter { $0.name.lowercased().contains(term) }
    }

    var body: some View {
        ScrollView {
            if !bouquets.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Bouquets").font(.title3.weight(.bold)).padding(.horizontal, 20)
                    ScrollView(.horizontal) {
                        GlassEffectContainer(spacing: 8) {
                            HStack(spacing: 8) {
                                ForEach(bouquets, id: \.self) { bouquet in
                                    NavigationLink(value: bouquet) {
                                        Text(bouquet.name)
                                            .font(.subheadline.weight(.semibold))
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 9)
                                    }
                                    .buttonStyle(PressableStyle())
                                    .glassEffect(.regular.interactive(), in: Capsule())
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .scrollIndicators(.hidden)
                }
                .padding(.top, 8)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 12) {
                ForEach(shown) { channel in
                    Button {
                        taps += 1
                        Task { await open(channel) }
                    } label: {
                        VStack(spacing: 8) {
                            ZStack {
                                if let logo = channel.logo, let url = session.noctraURL(logo) {
                                    RemoteImage(url: url, contentMode: .fit)
                                        .padding(14)
                                } else {
                                    Text(String(channel.name.prefix(2)).uppercased())
                                        .font(.title2.weight(.heavy))
                                        .foregroundStyle(Theme.accent)
                                }
                                if opening == channel.id {
                                    ProgressView()
                                        .padding(10)
                                        .glassEffect(.regular, in: Circle())
                                }
                            }
                            .frame(height: 72)
                            .frame(maxWidth: .infinity)
                            .glassEffect(.regular.interactive(), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            Text(channel.name)
                                .font(.caption.weight(.semibold))
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .buttonStyle(PressableStyle())
                    .foregroundStyle(.white)
                }
            }
            .padding(20)
            if loading && channels.isEmpty && bouquets.isEmpty { LoadingView() }
            if !loading && channels.isEmpty && bouquets.isEmpty {
                MessageView(icon: "tv.slash", text: "Aucune chaîne dans cette source.") { Task { await load() } }
            }
        }
        .background(AuroraBackground())
        .navigationTitle(route.name)
        .searchable(text: $query, prompt: "Chaîne")
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
        .task { if channels.isEmpty && bouquets.isEmpty { await load() } }
        .alert("Chaîne indisponible", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        let path = route.ref.map { "/api/tv/catalog?ref=" + ($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0) }
            ?? "/api/tv/catalog?source=" + (route.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? route.id)
        guard let json = try? await session.noctraJSON(path) as? [String: Any] else { return }
        let list = (json["channels"] as? [[String: Any]]) ?? []
        var seen = Set<String>()
        let parsed: [LiveChannel] = list.enumerated().compactMap { index, entry in
            guard let name = entry["name"] as? String, !name.isEmpty else { return nil }
            var id = name
            if seen.contains(id) { id = "\(name)#\(index)" }
            seen.insert(id)
            return LiveChannel(id: id, name: name, logo: entry["logo"] as? String, group: entry["group"] as? String, raw: entry)
        }
        let groups = ((json["groups"] as? [[String: Any]]) ?? []).compactMap { group -> TVSourceRoute? in
            guard let ref = group["ref"] as? String else { return nil }
            let name = (group["name"] as? String) ?? (group["title"] as? String) ?? ref
            return TVSourceRoute(id: route.id + "|" + ref, name: name, ref: ref)
        }
        withAnimation(Theme.spring) {
            channels = parsed
            bouquets = Array(groups.prefix(60))
        }
    }

    // MARK: Lecture

    private func open(_ channel: LiveChannel) async {
        guard opening == nil else { return }
        opening = channel.id
        defer { opening = nil }
        var options = await streams(for: channel.raw, depth: 0)
        // Flux MPEG-TS bruts (non HLS) : AVPlayer ne les lit pas toujours, essayés en dernier.
        options.sort { lhs, rhs in (lhs.mpegts ? 1 : 0) < (rhs.mpegts ? 1 : 0) }
        let playable = options.compactMap { option -> (URL, [String: String])? in
            guard let url = session.noctraURL(option.url) else { return nil }
            var headers = option.headers
            if session.isNoctraOrigin(url), let token = session.token { headers["x-noctra-token"] = token }
            return (url, headers)
        }
        if playable.isEmpty {
            if let embed = channel.raw["embedUrl"] as? String ?? channel.raw["externalUrl"] as? String, let url = URL(string: embed) {
                problem = "Cette chaîne ne passe que par un lecteur web : elle s’ouvre dans Safari."
                _ = await UIApplication.shared.open(url)
            } else {
                problem = "Aucun flux lisible par l’iPhone pour cette chaîne."
            }
            return
        }
        PlaybackManager.shared.playLive(title: channel.name, streams: playable)
    }

    private struct StreamOption {
        let url: String
        let headers: [String: String]
        let mpegts: Bool
    }

    /// Flux d'une chaîne : direct, ou serveurs proposés par le résolveur de Noctra.
    private func streams(for entry: [String: Any], depth: Int) async -> [StreamOption] {
        var found: [StreamOption] = []
        if let stream = entry["streamUrl"] as? String, !stream.isEmpty {
            let headers = (entry["headers"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
            found.append(StreamOption(url: stream, headers: headers, mpegts: (entry["transport"] as? String) == "mpegts"))
        }
        guard depth < 2 else { return found }
        let resolver = (entry["resolverUrl"] as? String) ?? (entry["resolveUrl"] as? String)
        if found.isEmpty, let resolver {
            if let result = try? await session.noctraJSON(resolver, timeout: 30) as? [String: Any] {
                let options = (result["options"] as? [[String: Any]]) ?? ((result["streamUrl"] != nil || result["resolveUrl"] != nil) ? [result] : [])
                for option in options.prefix(12) {
                    found.append(contentsOf: await streams(for: option, depth: depth + 1))
                }
            }
        }
        return found
    }
}
