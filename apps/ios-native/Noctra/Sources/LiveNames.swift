import Foundation

// Règles de la TV en direct reprises de Noctra TV (apps/androidtv/web/app.js) :
// noms de chaînes nettoyés, rapprochement des mêmes chaînes entre sources,
// pays (France d'abord), catégories claires, numéros de la TNT.
// Fonctions pures, appelées hors du fil principal pendant le chargement.

private final class Pattern: @unchecked Sendable {
    let regex: NSRegularExpression?

    init(_ pattern: String, caseInsensitive: Bool = false) {
        regex = try? NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : [])
    }

    func replace(_ text: String, _ template: String) -> String {
        guard let regex else { return text }
        return regex.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: template)
    }

    func test(_ text: String) -> Bool {
        regex?.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /// Groupes capturés (texte vide si absent) et longueur de la correspondance.
    func match(_ text: String) -> (groups: [String], length: Int)? {
        guard let regex, let found = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        var groups: [String] = []
        for index in 0..<found.numberOfRanges {
            let range = found.range(at: index)
            groups.append(range.location == NSNotFound ? "" : (text as NSString).substring(with: range))
        }
        return (groups, found.range.length)
    }
}

enum ChannelNaming {
    // MARK: Pays

    static let countryCodes: [String: String] = [
        "fr": "fr", "fra": "fr", "uk": "uk", "gb": "uk", "en": "uk", "us": "us", "usa": "us", "de": "de", "ger": "de", "es": "es", "spa": "es", "esp": "es",
        "it": "it", "ita": "it", "pt": "pt", "por": "pt", "br": "br", "ar": "arab", "ara": "arab", "nl": "nl", "be": "be", "ch": "ch", "ca": "ca", "au": "au",
        "tr": "tr", "pl": "pl", "ro": "ro", "ru": "ru", "mx": "mx", "gr": "gr", "se": "se", "dk": "dk", "no": "no", "fi": "fi", "hu": "hu", "cz": "cz", "sk": "sk",
        "rs": "rs", "hr": "hr", "al": "al", "bg": "bg", "ua": "ua", "il": "il", "in": "in", "pk": "pk", "za": "za", "ie": "ie", "at": "at", "lat": "latam",
        "latam": "latam", "ma": "ma", "dz": "dz", "tn": "tn", "qa": "arab", "sa": "arab", "ae": "arab", "eg": "arab"
    ]

    static let countryWords: [String: String] = [
        "france": "fr", "french": "fr", "francais": "fr", "francaise": "fr", "united kingdom": "uk", "england": "uk", "britain": "uk", "usa": "us",
        "america": "us", "germany": "de", "deutschland": "de", "allemagne": "de", "spain": "es", "espana": "es", "espagne": "es", "italy": "it",
        "italia": "it", "italie": "it", "portugal": "pt", "brazil": "br", "brasil": "br", "bresil": "br", "arabic": "arab", "arab": "arab", "arabia": "arab",
        "mena": "arab", "netherlands": "nl", "holland": "nl", "belgium": "be", "belgique": "be", "switzerland": "ch", "suisse": "ch", "canada": "ca",
        "quebec": "ca", "australia": "au", "turkey": "tr", "turkiye": "tr", "poland": "pl", "polska": "pl", "romania": "ro", "russia": "ru", "mexico": "mx",
        "latino": "latam", "greece": "gr", "sweden": "se", "denmark": "dk", "norway": "no", "finland": "fi", "india": "in", "pakistan": "pk",
        "ireland": "ie", "austria": "at", "maroc": "ma", "morocco": "ma", "algerie": "dz", "algeria": "dz", "tunisie": "tn", "tunisia": "tn",
        "africa": "afrique", "afrique": "afrique"
    ]

    static let countryLabels: [String: String] = [
        "fr": "France", "uk": "Royaume-Uni", "us": "États-Unis", "de": "Allemagne", "es": "Espagne", "it": "Italie", "pt": "Portugal", "br": "Brésil",
        "arab": "Monde arabe", "nl": "Pays-Bas", "be": "Belgique", "ch": "Suisse", "ca": "Canada", "au": "Australie", "tr": "Turquie", "pl": "Pologne",
        "ro": "Roumanie", "ru": "Russie", "mx": "Mexique", "latam": "Amérique latine", "gr": "Grèce", "se": "Suède", "in": "Inde", "pk": "Pakistan",
        "ie": "Irlande", "at": "Autriche", "ma": "Maroc", "dz": "Algérie", "tn": "Tunisie", "za": "Afrique du Sud", "afrique": "Afrique francophone",
        "lu": "Luxembourg", "mc": "Monaco", "ht": "Haïti"
    ]

    static func countryLabel(_ code: String) -> String {
        code.isEmpty ? "Tous les pays" : code == "?" ? "Pays non indiqué" : countryLabels[code] ?? code.uppercased()
    }

    private static let frenchBrands = Pattern("^(?:bein ?sports? (?:max ?)?(?:[1-9]|10)$|ligue ?1|tf1|tfx|tmc|france ?[2345]|france ?info|franceinfo|france ?24|m6|6ter|w9|arte|c8|cstar|nrj ?12|lcp|public senat|bfm|cnews|lci|gulli|l ?equipe|bfm ?tv|13 ?e?(?:me)? ?rue|ab ?[13]|rtl ?9|nrj ?hits|trace|rmc|cherie 25|canal ?plus|c ?plus|ocs|cine ?plus|paris premiere|teva|m6 music|mcm|game ?one|tiji|piwi|planete ?plus|ushuaia|histoire tv|toute l ?histoire|seasons|chasse ?(?:et|&) ?peche|equidia|infosport|tv5 ?monde|tv ?breizh|serie ?club|13e ?rue|comedie ?plus|polar ?plus|action ?(?:tv)?$|novelas|mangas|j ?one|automoto|kto|i24|b ?smart|bfm ?business|la chaine meteo|eurosport ?[12]? ?france|bein sports? .*france|rmc sport|dazn france|l ?equipe ?tv|olympia|melody|m6 boutique|tf1 series films|franceinfo tv|lcp an|t18|novo19|w ?9|6 ?ter)(?:\\s|$)")

    private static let foreignBrands: [(Pattern, String)] = [
        (Pattern("^(?:al ?jazeera|al ?arabiya|al ?hadath|sky news arabia|mbc|rotana|dubai|abu dhabi|sharjah|al ?mayadeen|al ?manar|nile|france ?24 arab|bein sports? (?:arabia|mena|news))(?:\\s|$)"), "arab"),
        (Pattern("^(?:2m|al ?aoula|arryadia|medi ?1 ?tv|tamazight|assadissa)(?:\\s|$)"), "ma"),
        (Pattern("^(?:canal algerie|echorouk|ennahar|el ?bilad|beur ?tv|samira)(?:\\s|$)"), "dz"),
        (Pattern("^(?:watania|nessma|hannibal|el ?hiwar|attessia)(?:\\s|$)"), "tn"),
        (Pattern("^(?:la une|tipik|la trois|rtl ?tvi|club rtl|plug rtl|ln ?24|bx ?1|rtbf)(?:\\s|$)"), "be"),
        (Pattern("^(?:rts ?(?:un|deux|1 suisse)|leman bleu|la tele suisse)(?:\\s|$)"), "ch"),
        (Pattern("^(?:tva|tele ?quebec|noovo|lcn|rdi|ici (?:tele|rdi|artv|radio canada)|radio canada|rds|tva sports|canal vie|canal d|series ?plus|super ecran|vrak|yoopa|historia|evasion|unis)(?:\\s|$)"), "ca"),
        (Pattern("^(?:africa ?24|africable|a ?plus ?ivoire|trace africa|nollywood|rti ?[12]?|rts ?[12]?(?: senegal)?|ortm|crtv|ortb|rtnc|rtb|canal ?2 ?international|equinoxe|novelas tv afrique|canal plus afrique|life tv|nci|tele congo|rtg|tfm|2stv|sen ?tv|walf|vox africa|love world|kalac|bblack africa)(?:\\s|$)"), "afrique")
    ]

    static func countryOfCode(_ value: String?) -> String {
        let code = (value ?? "").lowercased().filter { $0 >= "a" && $0 <= "z" }
        return countryCodes[code] ?? countryWords[code] ?? ""
    }

    static func countryOfWords(_ value: String?) -> String {
        let words = normalize(value ?? "").split(separator: " ").map(String.init)
        for (index, word) in words.enumerated() {
            if let found = countryWords[word] { return found }
            if index < words.count - 1, let found = countryWords[word + " " + words[index + 1]] { return found }
        }
        return ""
    }

    /// Drapeau (🇫🇷, 🇬🇧…) dans un texte : code pays à deux lettres.
    private static func flagCode(_ text: String) -> String? {
        let scalars = Array(text.unicodeScalars)
        for index in 0..<max(0, scalars.count - 1) {
            let first = scalars[index].value, second = scalars[index + 1].value
            if (0x1F1E6...0x1F1FF).contains(first), (0x1F1E6...0x1F1FF).contains(second),
               let a = UnicodeScalar(97 + first - 0x1F1E6), let b = UnicodeScalar(97 + second - 0x1F1E6) {
                return String(Character(a)) + String(Character(b))
            }
        }
        return nil
    }

    private static let leadingWord = Pattern("^\\s*[\\[(|]?\\s*([A-Za-z]{4,12})\\s*[\\])|]?\\s*[:|\\-–]\\s*")
    private static let leadingCodePattern = Pattern("^\\s*[\\[(|]?\\s*([A-Za-z]{2,3})\\s*[\\])|]?\\s*([^\\w\\sÀ-ɏ]+|\\s)\\s*")

    /// Code pays en tête du nom : « FR: », « FR| », « [FR] », « FRANCE: »… et sa longueur.
    static func leadingCode(_ name: String) -> (country: String, length: Int)? {
        if let word = leadingWord.match(name), let country = countryWords[word.groups[1].lowercased()] {
            return (country, word.length)
        }
        guard let match = leadingCodePattern.match(name) else { return nil }
        let code = match.groups[1]
        let country = countryOfCode(code)
        if country.isEmpty || (match.groups[2].trimmingCharacters(in: .whitespaces).isEmpty && code != code.uppercased()) { return nil }
        return (country, match.length)
    }

    private static let suffixCode = Pattern("[\\s(\\[|\\-]([A-Z]{2,3})[)\\]]?\\s*$")
    private static let groupCode = Pattern("(?:^|[^A-Za-z])([A-Z]{2,3})(?:[^A-Za-z]|$)")
    private static let idCountry = Pattern("\\.([a-z]{2})(?:@|$)", caseInsensitive: true)
    private static let arabicScript = Pattern("[\\u0600-\\u06FF]")

    /// Pays d'une chaîne : nom, catégorie de la source, marque française, champs du fournisseur.
    static func country(_ raw: [String: Any]) -> String {
        let name = raw["name"] as? String ?? ""
        if arabicScript.test(name) { return "arab" }
        let brand = brandName(name)
        for (pattern, code) in foreignBrands where pattern.test(brand) { return code }
        if let flag = flagCode(name), !countryOfCode(flag).isEmpty { return countryOfCode(flag) }
        if let lead = leadingCode(name) { return lead.country }
        if let suffix = suffixCode.match(name), !countryOfCode(suffix.groups[1]).isEmpty { return countryOfCode(suffix.groups[1]) }
        let words = normalize(name).split(separator: " ").map(String.init)
        if words.count > 1, let last = words.last, let found = countryWords[last] { return found }
        let group = raw["group"] as? String ?? ""
        if let flag = flagCode(group), !countryOfCode(flag).isEmpty { return countryOfCode(flag) }
        let fromGroup = countryOfWords(group).isEmpty ? (groupCode.match(group).map { countryOfCode($0.groups[1]) } ?? "") : countryOfWords(group)
        if !fromGroup.isEmpty { return fromGroup }
        if frenchBrands.test(brand) { return "fr" }
        for value in [raw["iptvOrgCountry"] as? String, raw["country"] as? String] {
            let found = countryOfCode(value)
            if !found.isEmpty { return found }
        }
        let fromWords = countryOfWords(raw["country"] as? String)
        if !fromWords.isEmpty { return fromWords }
        for value in [raw["iptvOrgId"] as? String, raw["epgId"] as? String] {
            if let match = idCountry.match(value ?? ""), !countryOfCode(match.groups[1]).isEmpty { return countryOfCode(match.groups[1]) }
        }
        if let language = raw["language"] as? String, ["fr", "fra", "fre", "french", "francais", "français"].contains(language.lowercased()) { return "fr" }
        return ""
    }

    // MARK: Noms

    static func normalize(_ value: String) -> String {
        let folded = value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "fr_FR")).lowercased()
        var result = ""
        var space = false
        for scalar in folded.unicodeScalars {
            if (scalar >= "a" && scalar <= "z") || (scalar >= "0" && scalar <= "9") {
                if space && !result.isEmpty { result.append(" ") }
                space = false
                result.unicodeScalars.append(scalar)
            } else {
                space = true
            }
        }
        return result
    }

    /// Clé de tri : nombres complétés par des zéros (« A LA CARTE 2 » avant « A LA CARTE 10 »).
    static func sortKey(_ value: String) -> String {
        var result = ""
        var digits = ""
        for character in normalize(value) + " " {
            if character.isASCII && character.isNumber { digits.append(character); continue }
            if !digits.isEmpty { result += String(repeating: "0", count: max(0, 6 - digits.count)) + digits; digits = "" }
            result.append(character)
        }
        return String(result.dropLast())
    }

    private static let cleanSteps: [(Pattern, String)] = [
        (Pattern("^\\s*(?:\\[[^\\]]*\\]|\\([^)]*\\))\\s*"), ""),
        (Pattern("^\\s*(?:VIP|4K|HD|FHD)\\s*[:|\\-–]\\s*", caseInsensitive: true), ""),
        (Pattern("\\[[^\\]]*\\]|\\([^)]*\\)"), " "),
        (Pattern("\\b(?:backup|secours|alt|link|lien|source|server|serveur|mirror|option)\\s*\\d{1,2}\\b", caseInsensitive: true), " "),
        (Pattern("(\\d)\\s*(?:[·|•#–]|\\s-)\\s*\\d{1,2}\\s*$"), "$1"),
        (Pattern("\\s#\\d{1,2}\\s*$"), " "),
        (Pattern("\\b(?:UHD|FHD|FULL ?HD|HD|SD|4K|HEVC|H\\.?265|1080[pi]?|720p|50 ?fps|backup|secours|raw|vip|multi ?audio)\\b", caseInsensitive: true), " "),
        (Pattern("(?:\\s*·\\s*(?:[A-Z0-9][A-Z0-9 +]{0,17}|Flux\\s*\\d+|Serveur\\s*\\d+|Variante\\s+\\S+)?)+\\s*$"), ""),
        (Pattern("[|•·▎┃]+"), " "),
        (Pattern("(^|\\s)(canal|c|cin[eé]|plan[eè]te|golf|piwi|teletoon|polar|com[eé]die|infosport|ligue 1)\\s+\\+(?=\\s|$)", caseInsensitive: true), "$1$2+"),
        (Pattern("(^|\\s)\\++(?=\\s|$)"), " "),
        (Pattern("\\s+\\.[A-Za-z0-9]{1,3}(?=\\s|$)"), " "),
        (Pattern("\\s+"), " ")
    ]
    private static let decorations = Pattern("[\\x{1F1E6}-\\x{1F1FF}ʰ-˿ᴀ-ᶿ⁰-₟℀-⅏─-◿☀-➿]")

    /// « FR: TF1 HD », « [FR] TF1 (backup) », « FR| TF1 ᴴᴰ 🇫🇷 » → « TF1 ».
    static func cleanName(_ name: String) -> String {
        var raw = decorations.replace(name, " ").precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespaces)
        if let lead = leadingCode(raw) {
            let utf16 = raw.utf16
            if let index = utf16.index(utf16.startIndex, offsetBy: lead.length, limitedBy: utf16.endIndex), let cut = index.samePosition(in: raw) {
                raw = String(raw[cut...])
            }
        }
        var clean = raw
        for (pattern, template) in cleanSteps { clean = pattern.replace(clean, template) }
        clean = clean.trimmingCharacters(in: .whitespaces)
        return clean.isEmpty ? name.trimmingCharacters(in: .whitespaces) : clean
    }

    private static let frenchSuffix = Pattern("\\s+(?:france|fr|fra)$")

    static func brandName(_ name: String) -> String {
        frenchSuffix.replace(normalize(cleanName(name).replacingOccurrences(of: "+", with: " plus ")), "").trimmingCharacters(in: .whitespaces)
    }

    private static let noiseWords: Set<String> = [
        "channel", "live", "direct", "officiel", "official", "hq", "lq", "h264", "h265", "x264", "x265", "fps", "60fps", "50fps", "1080", "1080p", "720",
        "720p", "2160p", "premium", "multi", "audio", "vf", "vff", "vostfr", "stream", "server", "serveur", "source", "link", "lien", "alt", "backup",
        "secours", "mirror", "hevc", "uhd", "fhd", "hd", "sd", "4k", "8k", "tnt"
    ]

    private static let aliases: [String: String] = [
        "hd1": "tf1seriesfilms", "tf1seriefilm": "tf1seriesfilms", "nt1": "tfx", "numero23": "rmcstory", "d8": "c8", "d17": "cstar", "itele": "cnews",
        "lequipe21": "lequipe", "lequipetv": "lequipe", "franceinfotv": "franceinfo", "lcpan": "lcp", "lcpassembleenationale": "lcp", "artefrance": "arte",
        "canal": "canalplus", "canalplusfrance": "canalplus", "eurosport": "eurosport1", "beinsport": "beinsport1", "rmcsport": "rmcsport1", "tv5": "tv5monde",
        "france24fr": "france24", "tf1sf": "tf1seriesfilms", "tcm": "tcmcinema", "canalplusfamily": "canalpluskids", "cineplusfamiz": "cineplusfamily",
        "cineplusclassique": "cineplusclassic", "cinepremier": "cinepluspremier", "natgeo": "nationalgeographic", "natgeowild": "nationalgeographicwild",
        "france3national": "france3", "okoofrance4": "france4", "canalplusfootball": "canalplusfoot", "canalplusdocumentaires": "canalplusdocs",
        "automotolachaine": "automoto", "lachaineinfo": "lci", "lachaineparlementaire": "lcp", "tv5mondefbs": "tv5monde",
        "tv5mondefrancebelgiquesuisse": "tv5monde", "disneyjr": "disneyjunior", "l1plus": "ligue1plus", "bfmgrandparis": "bfmparis", "i24newsfrancais": "i24news"
    ]

    /// Nom de rapprochement : « beIN Sport 1 » = « BEIN SPORTS 1 » = « beIN Sports 1 France ».
    static func unifiedName(_ name: String) -> String {
        var brand = brandName(name)
        if brand.hasPrefix("la chaine l equipe") || brand.hasPrefix("la chaine lequipe") { brand = String(brand.dropFirst("la chaine ".count)) }
        var words: [String] = []
        for (index, word) in brand.split(separator: " ").map(String.init).enumerated() {
            if noiseWords.contains(word) { continue }
            if index > 0 && (word == "et" || word == "and") { continue }
            var value = word == "sports" ? "sport" : word
            if let range = value.range(of: "^(\\d+)(?:eme|e|er|ere)$", options: .regularExpression) {
                value = String(value[range].prefix { $0.isNumber })
            }
            words.append(value)
        }
        if words.count > 1, words.last == "tv" { words.removeLast() }
        if words.count > 2, let last = words.last, last.count == 1, last.first?.isLetter == true, words[words.count - 2].allSatisfy(\.isNumber) { words.removeLast() }
        var key = words.joined()
        if key.count > 4, key.hasSuffix("tv"), !(key.hasPrefix("tv") || key.hasPrefix("mtv") || key.hasPrefix("btv")) { key.removeLast(2) }
        if key.hasPrefix("cplus") { key = "canalplus" + key.dropFirst(5) }
        if key.hasPrefix("beinsports") { key = "beinsport" + key.dropFirst(10) }
        else if key.hasPrefix("bein"), !key.hasPrefix("beinsport"), let next = key.dropFirst(4).first, next.isNumber || key.dropFirst(4).hasPrefix("max") { key = "beinsport" + key.dropFirst(4) }
        if key.hasPrefix("ocscineplus") { key.removeFirst(3) }
        return aliases[key] ?? key
    }

    /// Clé de regroupement : même nom et même pays ; une chaîne sans pays rejoint la française.
    static func key(_ name: String, country: String) -> String {
        guard !country.isEmpty, country != "fr" else {
            let base = unifiedName(name)
            return base.isEmpty ? normalize(name) : base
        }
        var words = normalize(cleanName(name)).split(separator: " ").map(String.init)
        if words.count > 1, let last = words.last, countryCodes[last] != nil || countryWords[last] != nil { words.removeLast() }
        let base = unifiedName(words.joined(separator: " "))
        return country + ":" + (base.isEmpty ? normalize(name) : base)
    }

    // MARK: Catégories et numéros

    private static let categories: [(String, Pattern)] = [
        ("Sport", Pattern("\\bsports?\\b|^(?:bein|rmc sport|eurosport|l ?equipe|dazn|ligue 1|golf|infosport|equidia|automoto|multisports|canal plus (?:foot|ligue|top|moto|formula|f1|premier|rugby)|foot|nba|nfl|ufc|f1|motors?v|tennis|trace sport|olympia|sport en france|premier sports|team ?tv|ol tv)|\\b(?:foot|football|rugby|tennis|golf|racing|fight)\\b")),
        ("Info", Pattern("^(?:bfm ?(?:tv|business)?|c ?news|europe ?1|la chaine meteo|b ?smart|rt$|lci|france ?info|franceinfo|france ?24|euronews|i24|lcp|public senat|tv5 ?monde info|rt france|africanews|bloomberg|cnn|bbc (?:world )?news|sky news|al jazeera|monaco info)(?:\\s|$)|\\b(?:news|info|infos)$")),
        ("Jeunesse", Pattern("^(?:disney|nickelodeon|nick|gulli|tiji|piwi|canal j|boomerang|cartoon|cartoonito|boing|teletoon|mangas|j ?one|game ?one|mgg|nolife|baby ?tv|duck ?tv|pitchoun|toonami|kids|mon nickelodeon)|\\b(?:kids|junior|jr|jeunesse|enfants?|toons?)\\b")),
        ("Cinéma", Pattern("^(?:cine ?plus|ocs|tcm|paramount|action|canal plus (?:cinemas?|box office|grand ecran|premier|decale)|tf1 series films|drive in|dreamsee|altice studio|film|movies?)|\\b(?:cinemas?|cine|movies?|films?)\\b")),
        ("Séries", Pattern("^(?:13 ?e?(?:me)? ?rue|syfy|warner|polar ?plus|comedie ?plus|novelas|crime district|serie club|ab ?1|rtl ?9|teva|canal plus series|elle girl|e ?!|comedy central|mtv|abxplore|tv breizh)|\\bseries?\\b")),
        ("Découverte", Pattern("^(?:planete|ushuaia|histoire|toute l ?histoire|national geographic|nat ?geo|discovery|animaux|science|trek|chasse|seasons|rmc decouverte|museum|ultra nature|love nature|canal plus docs|culturebox|crime ?\\+? ?investigation|investigation discovery|explore)|\\b(?:docs?|documentaires?|decouverte|nature|histoire|voyage)\\b")),
        ("Musique", Pattern("^(?:mcm|nrj hits|trace|m6 music|melody|mezzo|rfm|stingray|mtv (?:hits|live)|clubbing|bet|cstar hits|europe 2|djazz|brava)|\\b(?:music|musique|hits|radio)\\b")),
        ("Généralistes", Pattern("^(?:tf1|france ?[2-5]|m6|arte|c8|w9|tmc|tfx|nrj ?12|c ?star|ab ?3|6 ?ter|rmc story|rmc life|cherie 25|paris premiere|canal plus|c ?plus|t18|novo ?19|l ?equipe|gulli|france ?3 .+|tv5 ?monde|kto|rtl|lci)(?:\\s|$)"))
    ]

    private static let groupRules: [(String, Pattern)] = [
        ("Sport", Pattern("\\bsports?\\b|foot|ligue|match")), ("Info", Pattern("\\b(?:info|infos|news|actualite)")),
        ("Jeunesse", Pattern("kids|enfant|jeunesse|junior|cartoon|dessin")), ("Cinéma", Pattern("cinema|cine|film|movie")),
        ("Séries", Pattern("\\bseries?\\b")), ("Découverte", Pattern("docu|decouverte|nature|histoire")), ("Musique", Pattern("music|musique")),
        ("Généralistes", Pattern("general|tnt"))
    ]

    static let categoryOrder = ["Généralistes", "Info", "Sport", "Cinéma", "Séries", "Jeunesse", "Découverte", "Musique", "Autres"]

    static func category(name: String, groups: [String]) -> String {
        let brand = brandName(name)
        for (label, pattern) in categories where pattern.test(brand) { return label }
        let normalized = groups.map(normalize)
        for (label, pattern) in groupRules where normalized.contains(where: { pattern.test($0) }) { return label }
        return "Autres"
    }

    static let tntNumbers: [String: Int] = [
        "tf1": 1, "france2": 2, "france3": 3, "canalplus": 4, "france5": 5, "m6": 6, "arte": 7, "c8": 8, "w9": 9, "tmc": 10, "tfx": 11, "nrj12": 12,
        "lcp": 13, "lcppublicsenat": 13, "publicsenat": 13, "france4": 14, "bfm": 15, "cnews": 16, "cstar": 17, "gulli": 18, "tf1seriesfilms": 20,
        "lequipe": 21, "6ter": 22, "rmcstory": 23, "rmcdecouverte": 24, "cherie25": 25, "lci": 26, "franceinfo": 27, "t18": 28, "novo19": 29
    ]

    /// Nom affiché d'une chaîne réunie : l'écriture la plus soignée et la plus courante.
    static func displayName(_ names: [String], keyDigits: String) -> String {
        var scores: [String: Double] = [:]
        var seen: [String: Int] = [:]
        for raw in names {
            let name = cleanName(raw)
            guard !name.isEmpty else { continue }
            if scores[name] == nil {
                let letters = name.filter { $0.isLetter }
                var score: Double = !letters.isEmpty && letters != letters.uppercased() && letters != letters.lowercased() ? 3 : (letters == letters.uppercased() ? 1 : 0)
                if name.range(of: "\\s(?:france|fr|fra|french)$", options: [.regularExpression, .caseInsensitive]) != nil { score -= 2 }
                if name.filter(\.isNumber) != keyDigits { score -= 2 }
                if name.range(of: "[A-Za-zÀ-ÿ+]\\s\\d", options: .regularExpression) != nil { score += 0.5 }
                scores[name] = score - Double(name.count) / 60
                seen[name] = 0
            }
            seen[name, default: 0] += 1
            if (seen[name] ?? 0) <= 3 { scores[name, default: 0] += 0.3 }
        }
        return scores.max { $0.value < $1.value }?.key ?? names.first ?? ""
    }
}
