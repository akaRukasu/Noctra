using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Noctra.Windows;

// 0.8 : « Toutes les chaînes » regroupées exactement comme le Web et la PWA du serveur Noctra
// (public/noctra-tv-unified.js, version 200.0.181) : mêmes règles de noms, de pays et de regroupement.
// Le portage suit le fichier ligne à ligne ; tests/tv-unified compare les deux sur les mêmes catalogues.
internal sealed record TvUnifiedChannel(string Name, string Key, string Country, (TvSource Source, TvEntry Entry)[] Entries,
    IReadOnlyDictionary<TvEntry, string> Variants, string? Logo, int Number);

internal static class TvUnified
{
    private static Regex R(string pattern, bool ignoreCase = false) =>
        new(pattern, RegexOptions.ECMAScript | RegexOptions.Compiled | (ignoreCase ? RegexOptions.IgnoreCase : RegexOptions.None), TimeSpan.FromSeconds(2));

    // ── Pays des chaînes ──
    private static readonly Dictionary<string, string> CountryCodes = new()
    {
        ["fr"] = "fr", ["fra"] = "fr", ["uk"] = "uk", ["gb"] = "uk", ["en"] = "uk", ["us"] = "us", ["usa"] = "us", ["de"] = "de", ["ger"] = "de", ["es"] = "es", ["spa"] = "es", ["esp"] = "es", ["it"] = "it", ["ita"] = "it",
        ["pt"] = "pt", ["por"] = "pt", ["br"] = "br", ["ar"] = "arab", ["ara"] = "arab", ["nl"] = "nl", ["be"] = "be", ["ch"] = "ch", ["ca"] = "ca", ["au"] = "au", ["tr"] = "tr", ["pl"] = "pl", ["ro"] = "ro", ["ru"] = "ru", ["mx"] = "mx",
        ["gr"] = "gr", ["se"] = "se", ["dk"] = "dk", ["no"] = "no", ["fi"] = "fi", ["hu"] = "hu", ["cz"] = "cz", ["sk"] = "sk", ["rs"] = "rs", ["hr"] = "hr", ["al"] = "al", ["bg"] = "bg", ["ua"] = "ua", ["il"] = "il", ["in"] = "in", ["pk"] = "pk",
        ["za"] = "za", ["ie"] = "ie", ["at"] = "at", ["lat"] = "latam", ["latam"] = "latam", ["ma"] = "ma", ["dz"] = "dz", ["tn"] = "tn", ["qa"] = "arab", ["sa"] = "arab", ["ae"] = "arab", ["eg"] = "arab"
    };
    private static readonly Dictionary<string, string> CountryWords = new()
    {
        ["france"] = "fr", ["french"] = "fr", ["francais"] = "fr", ["francaise"] = "fr", ["united kingdom"] = "uk", ["england"] = "uk", ["britain"] = "uk", ["usa"] = "us", ["america"] = "us",
        ["germany"] = "de", ["deutschland"] = "de", ["allemagne"] = "de", ["spain"] = "es", ["espana"] = "es", ["espagne"] = "es", ["italy"] = "it", ["italia"] = "it", ["italie"] = "it", ["portugal"] = "pt",
        ["brazil"] = "br", ["brasil"] = "br", ["bresil"] = "br", ["arabic"] = "arab", ["arab"] = "arab", ["arabia"] = "arab", ["mena"] = "arab", ["netherlands"] = "nl", ["holland"] = "nl", ["belgium"] = "be", ["belgique"] = "be",
        ["switzerland"] = "ch", ["suisse"] = "ch", ["canada"] = "ca", ["quebec"] = "ca", ["australia"] = "au", ["turkey"] = "tr", ["turkiye"] = "tr", ["poland"] = "pl", ["polska"] = "pl", ["romania"] = "ro", ["russia"] = "ru",
        ["mexico"] = "mx", ["latino"] = "latam", ["greece"] = "gr", ["sweden"] = "se", ["denmark"] = "dk", ["norway"] = "no", ["finland"] = "fi", ["india"] = "in", ["pakistan"] = "pk", ["ireland"] = "ie", ["austria"] = "at",
        ["maroc"] = "ma", ["morocco"] = "ma", ["algerie"] = "dz", ["algeria"] = "dz", ["tunisie"] = "tn", ["tunisia"] = "tn", ["africa"] = "afrique", ["afrique"] = "afrique"
    };
    private static readonly Regex FrenchBrands = R(@"^(?:bein ?sports? (?:max ?)?(?:[1-9]|10)$|ligue ?1|tf1|tfx|tmc|france ?[2345]|france ?info|franceinfo|france ?24|m6|6ter|w9|arte|c8|cstar|nrj ?12|lcp|public senat|bfm|cnews|lci|gulli|l ?equipe|bfm ?tv|13 ?e?(?:me)? ?rue|ab ?[13]|rtl ?9|nrj ?hits|trace|rmc|cherie 25|canal ?plus|c ?plus|ocs|cine ?plus|paris premiere|teva|m6 music|mcm|game ?one|tiji|piwi|planete ?plus|ushuaia|histoire tv|toute l ?histoire|seasons|chasse ?(?:et|&) ?peche|equidia|infosport|tv5 ?monde|tv ?breizh|serie ?club|13e ?rue|comedie ?plus|polar ?plus|action ?(?:tv)?$|novelas|mangas|j ?one|automoto|kto|i24|b ?smart|bfm ?business|la chaine meteo|eurosport ?[12]? ?france|bein sports? .*france|rmc sport|dazn france|l ?equipe ?tv|olympia|melody|m6 boutique|tf1 series films|franceinfo tv|lcp an|t18|novo19|w ?9|6 ?ter)(?:\s|$)");
    private static readonly (Regex Pattern, string Country)[] ForeignBrands =
    [
        (R(@"^(?:al ?jazeera|al ?arabiya|al ?hadath|sky news arabia|mbc|rotana|dubai|abu dhabi|sharjah|al ?mayadeen|al ?manar|nile|france ?24 arab|bein sports? (?:arabia|mena|news))(?:\s|$)"), "arab"),
        (R(@"^(?:2m|al ?aoula|arryadia|medi ?1 ?tv|tamazight|assadissa)(?:\s|$)"), "ma"),
        (R(@"^(?:canal algerie|echorouk|ennahar|el ?bilad|beur ?tv|samira)(?:\s|$)"), "dz"),
        (R(@"^(?:watania|nessma|hannibal|el ?hiwar|attessia)(?:\s|$)"), "tn"),
        (R(@"^(?:la une|tipik|la trois|rtl ?tvi|club rtl|plug rtl|ln ?24|bx ?1|rtbf)(?:\s|$)"), "be"),
        (R(@"^(?:rts ?(?:un|deux|1 suisse)|leman bleu|la tele suisse)(?:\s|$)"), "ch"),
        (R(@"^(?:tva|tele ?quebec|noovo|lcn|rdi|ici (?:tele|rdi|artv|radio canada)|radio canada|rds|tva sports|canal vie|canal d|series ?plus|super ecran|vrak|yoopa|historia|evasion|unis)(?:\s|$)"), "ca"),
        (R(@"^(?:africa ?24|africable|a ?plus ?ivoire|trace africa|nollywood|rti ?[12]?|rts ?[12]?(?: senegal)?|ortm|crtv|ortb|rtnc|rtb|canal ?2 ?international|equinoxe|novelas tv afrique|canal plus afrique|life tv|nci|tele congo|rtg|tfm|2stv|sen ?tv|walf|vox africa|love world|kalac|bblack africa)(?:\s|$)"), "afrique")
    ];
    private static readonly Lazy<Dictionary<string, string>> ForeignIndex = new(() =>
    {
        var index = new Dictionary<string, string>();
        foreach (var (country, keys) in TvUnifiedData.Foreign)
            foreach (var key in keys.Split(' ')) if (key.Length > 0) index[key] = country;
        return index;
    });

    private static readonly Regex Arabic = R("[؀-ۿ]");
    private static string ForeignCountry(string name)
    {
        if (Arabic.IsMatch(name)) return "arab";
        var brand = BrandName(name);
        foreach (var (pattern, country) in ForeignBrands) if (pattern.IsMatch(brand)) return country;
        return ForeignIndex.Value.GetValueOrDefault(UnifiedName(name), "");
    }
    private static readonly Regex NonLetters = R("[^a-z]");
    internal static string CountryOfCode(string? value)
    {
        var code = NonLetters.Replace((value ?? "").ToLowerInvariant(), "");
        return CountryCodes.GetValueOrDefault(code) ?? CountryWords.GetValueOrDefault(code) ?? "";
    }
    internal static string CountryOfWords(string? value)
    {
        var text = Normalize(value);
        if (text.Length == 0) return "";
        var words = text.Split(' ');
        for (var i = 0; i < words.Length; i++)
        {
            if (CountryWords.TryGetValue(words[i], out var found)) return found;
            if (i < words.Length - 1 && CountryWords.TryGetValue(words[i] + " " + words[i + 1], out found)) return found;
        }
        return "";
    }

    private static readonly ConditionalWeakTable<TvEntry, string> Countries = new();
    // Pays d'une chaîne : calculé une fois par entrée ("" : pays non indiqué).
    internal static string ChannelCountry(TvEntry channel) => Countries.GetValue(channel, ComputeCountry);
    private static readonly Regex Flag = R("\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])");
    private static readonly Regex CodeSuffix = R(@"[\s(\[|\-]([A-Z]{2,3})[)\]]?\s*$");
    private static readonly Regex GuideCode = R(@"\.([a-z]{2})(?:@|$)", ignoreCase: true);
    private static readonly Regex GroupCode = R(@"(?:^|[^A-Za-z])([A-Z]{2,3})(?:[^A-Za-z]|$)");
    private static readonly Regex FrenchLanguage = R(@"^(?:fr|fra|fre|french|francais|français)$", ignoreCase: true);
    private static string FlagCountry(Match flag) =>
        CountryOfCode(new string([(char)('a' + flag.Groups[1].Value[0] - 0xDDE6), (char)('a' + flag.Groups[2].Value[0] - 0xDDE6)]));
    private static string ComputeCountry(TvEntry channel)
    {
        var name = channel.Name ?? "";
        var found = ForeignCountry(name);
        if (found.Length > 0) return found;
        found = CountryOfCode(channel.Country);
        if (found.Length == 0) found = CountryOfWords(channel.Country);
        if (found.Length > 0) return found;
        var flag = Flag.Match(name);
        if (flag.Success) { found = FlagCountry(flag); if (found.Length > 0) return found; }
        if (LeadingCode(name) is { } prefix) return prefix.Country;
        var suffix = CodeSuffix.Match(name);
        if (suffix.Success) { found = CountryOfCode(suffix.Groups[1].Value); if (found.Length > 0) return found; }
        var words = Normalize(name).Split(' ');
        if (words.Length > 1 && CountryWords.TryGetValue(words[^1], out var last)) return last;
        if (FrenchBrands.IsMatch(BrandName(name))) return "fr";
        found = CountryOfCode(channel.IptvOrgCountry);
        if (found.Length > 0) return found;
        var id = GuideCode.Match(channel.IptvOrgId is { Length: > 0 } iptv ? iptv : channel.EpgId ?? "");
        if (id.Success) { found = CountryOfCode(id.Groups[1].Value); if (found.Length > 0) return found; }
        var group = channel.Group ?? "";
        var groupFlag = Flag.Match(group);
        if (groupFlag.Success) { found = FlagCountry(groupFlag); if (found.Length > 0) return found; }
        var groupCode = GroupCode.Match(group);
        found = CountryOfWords(group);
        if (found.Length == 0 && groupCode.Success) found = CountryOfCode(groupCode.Groups[1].Value);
        if (found.Length > 0) return found;
        if (FrenchLanguage.IsMatch((channel.Language ?? "").Trim())) return "fr";
        return FrenchBrands.IsMatch(BrandName(name)) ? "fr" : "";
    }

    // Code pays en tête du nom : « FR: », « FR| », « [FR] », « (UK) », « FR - », « FR TF1 »…
    private static readonly Regex LeadWord = R(@"^\s*[\[(|]?\s*([A-Za-z]{4,12})\s*[\])|]?\s*[:|\-–]\s*");
    private static readonly Regex LeadCode = R(@"^\s*[\[(|]?\s*([A-Za-z]{2,3})\s*[\])|]?\s*([^\w\sÀ-ɏ]+|\s)\s*");
    private static readonly Regex OneSpace = R(@"^\s$");
    private static (string Country, int Length)? LeadingCode(string? name)
    {
        var text = name ?? "";
        var word = LeadWord.Match(text);
        if (word.Success && CountryWords.TryGetValue(word.Groups[1].Value.ToLowerInvariant(), out var named)) return (named, word.Length);
        var match = LeadCode.Match(text);
        if (!match.Success) return null;
        var code = match.Groups[1].Value;
        var country = CountryOfCode(code);
        if (country.Length == 0 || OneSpace.IsMatch(match.Groups[2].Value) && code != code.ToUpperInvariant()) return null;
        return (country, match.Length);
    }

    // Règles de noms appelées des milliers de fois : résultats gardés (comme remembered() côté web).
    private static Func<string, string> Remembered(Func<string, string> compute)
    {
        var store = new ConcurrentDictionary<string, string>(StringComparer.Ordinal);
        return value =>
        {
            if (store.TryGetValue(value, out var known)) return known;
            if (store.Count > 150000) store.Clear();
            return store[value] = compute(value);
        };
    }

    private static readonly Regex FlagHalf = R("\uD83C[\uDDE6-\uDDFF]");
    private static readonly Regex Modifiers = R("[ʰ-˿ᴀ-ᶿ⁰-₟℀-⅏]");
    private static readonly Regex Symbols = R("[─-◿☀-➿]");
    private static readonly Regex LeadBracket = R(@"^\s*(?:\[[^\]]*\]|\([^)]*\))\s*");
    private static readonly Regex LeadQuality = R(@"^\s*(?:VIP|4K|HD|FHD)\s*[:|\-–]\s*", ignoreCase: true);
    private static readonly Regex Brackets = R(@"\[[^\]]*\]|\([^)]*\)");
    private static readonly Regex LinkNumber = R(@"\b(?:backup|secours|alt|link|lien|source|server|serveur|mirror|option)\s*\d{1,2}\b", ignoreCase: true);
    private static readonly Regex TrailingNumber = R(@"(\d)\s*(?:[·|•#–]|\s-)\s*\d{1,2}\s*$");
    private static readonly Regex HashNumber = R(@"\s#\d{1,2}\s*$");
    private static readonly Regex Quality = R(@"\b(?:UHD|FHD|FULL ?HD|HD|SD|4K|HEVC|H\.?265|1080[pi]?|720p|50 ?fps|backup|secours|raw|vip|multi ?audio)\b", ignoreCase: true);
    private static readonly Regex LiveWatchSuffix = R(@"(?:\s*·\s*(?:[A-Z0-9][A-Z0-9 +]{0,17}|Flux\s*\d+|Serveur\s*\d+|Variante\s+\S+)?)+\s*$");
    private static readonly Regex Bars = R("[|•·▎┃]+");
    private static readonly Regex DetachedPlus = R(@"(^|\s)(canal|c|cin[eé]|plan[eè]te|golf|piwi|teletoon|polar|com[eé]die|infosport|ligue 1)\s+\+(?=\s|$)", ignoreCase: true);
    private static readonly Regex LonePlus = R(@"(^|\s)\++(?=\s|$)");
    private static readonly Regex DotVariant = R(@"\s+\.[A-Za-z0-9]{1,3}(?=\s|$)");
    private static readonly Regex Spaces = R(@"\s+");

    // « FR: TF1 HD », « [FR] TF1 (backup) », « FR| TF1 ᴴᴰ 🇫🇷 » → « TF1 ».
    internal static readonly Func<string, string> CleanChannelName = Remembered(name =>
    {
        var raw = Symbols.Replace(Modifiers.Replace(FlagHalf.Replace(name, " "), " "), " ");
        try { raw = raw.Normalize(NormalizationForm.FormKC); } catch (ArgumentException) { }
        raw = raw.Trim();
        if (LeadingCode(raw) is { } lead) raw = raw[lead.Length..];
        var clean = LeadBracket.Replace(raw, "", 1);
        clean = LeadQuality.Replace(clean, "", 1);
        clean = Brackets.Replace(clean, " ");
        clean = LinkNumber.Replace(clean, " ");
        clean = TrailingNumber.Replace(clean, "$1", 1);
        clean = HashNumber.Replace(clean, " ", 1);
        clean = Quality.Replace(clean, " ");
        clean = LiveWatchSuffix.Replace(clean, "", 1);
        clean = Bars.Replace(clean, " ");
        clean = DetachedPlus.Replace(clean, "$1$2+");
        clean = LonePlus.Replace(clean, " ");
        clean = DotVariant.Replace(clean, " ");
        clean = Spaces.Replace(clean, " ").Trim();
        return clean.Length > 0 ? clean : name.Trim();
    });
    private static readonly Regex FrenchSuffix = R(@"\s+(?:france|fr|fra|french|francais|francaise)$");
    private static readonly Regex FrenchMention = R(@"\s+(?:(?:en|in) (?:francais|french|vf)|version (?:francaise|french|fr))$");
    internal static readonly Func<string, string> BrandName = Remembered(name =>
    {
        var text = Normalize(CleanChannelName(name).Replace("+", " plus "));
        // Ajout Windows : « Eurosport 1 en français », « … in French », « … version française » = la chaîne française.
        return text == "sport en france" ? text : FrenchSuffix.Replace(FrenchMention.Replace(text, "", 1), "", 1).Trim();
    });

    private static readonly HashSet<string> NoiseWords = ["channel", "live", "direct", "officiel", "official", "hq", "lq", "h264", "h265", "x264", "x265", "fps", "60fps", "50fps",
        "1080", "1080p", "720", "720p", "2160p", "premium", "multi", "audio", "vf", "vff", "vostfr", "stream", "server", "serveur", "source",
        "link", "lien", "alt", "backup", "secours", "mirror", "hevc", "uhd", "fhd", "hd", "sd", "4k", "8k", "tnt"];
    private static readonly Dictionary<string, string> NameAliases = new()
    {
        ["hd1"] = "tf1seriesfilms", ["tf1seriefilm"] = "tf1seriesfilms", ["nt1"] = "tfx", ["numero23"] = "rmcstory", ["d8"] = "c8", ["d17"] = "cstar", ["itele"] = "cnews",
        ["lequipe21"] = "lequipe", ["lequipetv"] = "lequipe", ["franceinfotv"] = "franceinfo", ["lcpan"] = "lcp", ["lcpassembleenationale"] = "lcp", ["artefrance"] = "arte",
        ["canal"] = "canalplus", ["canalplusfrance"] = "canalplus", ["eurosport"] = "eurosport1", ["beinsport"] = "beinsport1", ["rmcsport"] = "rmcsport1", ["tv5"] = "tv5monde", ["france24fr"] = "france24",
        ["bfmparis"] = "bfmparisilede", ["canaldecale"] = "canalplusdecale", ["canalfamily"] = "canalplusfamily", ["canalseries"] = "canalplusseries",
        ["cineclassic"] = "cineplusclassic", ["cineclub"] = "cineplusclub", ["cineemotion"] = "cineplusemotion", ["cinefamiz"] = "cineplusfamily",
        ["cinefrisson"] = "cineplusfrisson", ["cinepremier"] = "cinepluspremier", ["comedie"] = "comedieplus", ["infosport"] = "infosportplus",
        ["planete"] = "planeteplus", ["polar"] = "polarplus", ["eentertainment"] = "e", ["eentertainement"] = "e", ["natgeo"] = "nationalgeographic",
        ["rakutenspotlight"] = "rakutentvspotlight", ["syfy"] = "scifi", ["tahitinui"] = "tntv", ["ter6"] = "6ter", ["tfseriesfilms1"] = "tf1seriesfilms", ["tvmonde5"] = "tv5monde"
    };
    private static readonly Regex LaChaine = R(@"^la chaine (?=l ?equipe)");
    private static readonly Regex Ordinal = R(@"\b(\d+)\s+(?:eme|ieme|e)(?=\s|$)");
    private static readonly Regex OrdinalWord = R(@"^(\d+)(?:eme|e|er|ere)$");
    private static readonly Regex SingleLetter = R("^[a-z]$");
    private static readonly Regex Digits = R(@"^\d+$");
    private static readonly Regex TvEnd = R("tv$");
    private static readonly Regex TvStart = R("^(?:tv|mtv|btv)");
    private static readonly Regex CPlus = R("^cplus");
    private static readonly Regex BeinSports = R("^beinsports?");
    private static readonly Regex BeinNumber = R(@"^bein(?=max\d|\d)");
    private static readonly Regex FranceDazn = R(@"^france(?=dazn\d+$)");
    // « beIN Sport 1 » = « BEIN SPORTS 1 » = « beIN Sports 1 France », « BFM TV » = « BFMTV »…
    internal static readonly Func<string, string> UnifiedName = Remembered(name =>
    {
        var text = Ordinal.Replace(LaChaine.Replace(BrandName(name), "", 1), "$1");
        var words = text.Split(' ').Where(word => word.Length > 0).Select((word, index) =>
        {
            if (word == "sports") return "sport";
            if (NoiseWords.Contains(word)) return "";
            if (index > 0 && word is "et" or "and") return "";
            return OrdinalWord.Replace(word, "$1", 1);
        }).Where(word => word.Length > 0).ToList();
        if (words.Count > 1 && words[^1] == "tv") words.RemoveAt(words.Count - 1);
        if (words.Count > 2 && SingleLetter.IsMatch(words[^1]) && Digits.IsMatch(words[^2])) words.RemoveAt(words.Count - 1);
        var key = string.Concat(words);
        if (key.Length > 4 && TvEnd.IsMatch(key) && !TvStart.IsMatch(key)) key = key[..^2];
        key = BeinNumber.Replace(BeinSports.Replace(CPlus.Replace(key, "canalplus", 1), "beinsport", 1), "beinsport", 1);
        key = FranceDazn.Replace(key, "", 1);
        return NameAliases.GetValueOrDefault(key, key);
    });

    // Même nom et même pays (« DE: Eurosport 1 » n'est pas la version française) ; sans pays connu : rejoint la française.
    internal static string UnifiedKey(string name, string country)
    {
        var baseKey = UnifiedName(name);
        if (country.Length > 0 && country != "fr")
        {
            var words = Normalize(CleanChannelName(name)).Split(' ');
            var last = words[^1];
            if (words.Length > 1 && (CountryCodes.ContainsKey(last) || CountryWords.ContainsKey(last))) baseKey = UnifiedName(string.Join(" ", words[..^1]));
            return country + ":" + baseKey;
        }
        return baseKey;
    }

    private static bool Truthy(JsonElement? value) => value is { } element && element.ValueKind switch
    {
        JsonValueKind.Undefined or JsonValueKind.Null or JsonValueKind.False => false,
        JsonValueKind.String => element.GetString()!.Length > 0,
        JsonValueKind.Number => element.TryGetDouble(out var number) && number != 0 && !double.IsNaN(number),
        _ => true
    };
    private static bool Has(string? value) => !string.IsNullOrEmpty(value);
    private static string? Address(TvEntry channel) =>
        new[] { channel.StreamUrl, channel.ResolverUrl, channel.EmbedUrl, channel.ExternalUrl, channel.VipFallbackUrl }.FirstOrDefault(Has);
    internal static bool Playable(TvEntry channel) => Address(channel) != null;
    private static readonly Regex Versus = R(@"\s(?:vs\.?|v\.?|contre)\s", ignoreCase: true);
    private static readonly Regex Cross = R(@"\s[x×]\s", ignoreCase: true);
    private static readonly Regex Clock = R(@"\b\d{1,2}[:h]\d{2}\b");
    // Événements (matchs du jour) : pas des chaînes ; seules les sources sport sont jugées sur leurs dates et identifiants.
    internal static bool IsEvent(TvEntry channel, TvSource? source)
    {
        var name = channel.Name ?? "";
        var match = Has(channel.HomeName) && Has(channel.AwayName) || Versus.IsMatch(name);
        if (source is { Section: { Length: > 0 } section } && section != "sports") return match;
        return match || Truthy(channel.EventId) || Truthy(channel.StartTime) || Cross.IsMatch(name) || Clock.IsMatch(name);
    }
    internal static bool KeepChannel(TvEntry channel, TvSource source) =>
        Has(channel.Name) && Playable(channel) && !IsEvent(channel, source) && !(source.Id == "bowdtv-guide" && channel.PlaybackType == "external");
    private static string IptvKey(TvEntry channel)
    {
        var id = Regex.Replace((channel.IptvOrgId ?? "").ToLowerInvariant(), "@.*$", "").Trim();
        return id.Length > 0 ? "id:" + id : "";
    }

    // Chaînes françaises : numéros habituels de la TNT, puis 30, 31…
    private static readonly Dictionary<string, int> TntNumbers = new()
    {
        ["tf1"] = 1, ["france2"] = 2, ["france3"] = 3, ["canalplus"] = 4, ["france5"] = 5, ["m6"] = 6, ["arte"] = 7, ["c8"] = 8, ["w9"] = 9, ["tmc"] = 10, ["tfx"] = 11, ["nrj12"] = 12,
        ["lcp"] = 13, ["lcppublicsenat"] = 13, ["publicsenat"] = 13, ["france4"] = 14, ["bfm"] = 15, ["cnews"] = 16, ["cstar"] = 17, ["gulli"] = 18, ["tf1seriesfilms"] = 20, ["lequipe"] = 21, ["6ter"] = 22,
        ["rmcstory"] = 23, ["rmcdecouverte"] = 24, ["cherie25"] = 25, ["lci"] = 26, ["franceinfo"] = 27, ["t18"] = 28, ["novo19"] = 29
    };

    private static bool OneEdit(string a, string b)
    {
        if (a == b) return true;
        if (Math.Abs(a.Length - b.Length) > 1) return false;
        var i = 0;
        while (i < a.Length && i < b.Length && a[i] == b[i]) i++;
        static string From(string value, int index) => index >= value.Length ? "" : value[index..];
        static char At(string value, int index) => index < value.Length ? value[index] : '\0';
        if (a.Length == b.Length)
            return From(a, i + 1) == From(b, i + 1) || At(a, i) == At(b, i + 1) && At(a, i + 1) == At(b, i) && From(a, i + 2) == From(b, i + 2);
        return a.Length > b.Length ? From(a, i + 1) == From(b, i) : From(a, i) == From(b, i + 1);
    }

    private static readonly Regex BowdVariantPattern = R(@"^(.*?)\s+([+−-]\d{1,2}(?:\s*h)?|Caraïbes|Réunion|AF)$", ignoreCase: true);
    private static readonly Regex Delayed = R("^[+−-]");
    private sealed record Variant(string Base, string Label, bool Delayed);
    private static Variant? BowdVariant(string name, TvSource source)
    {
        if (source.Id != "bowdtv-guide") return null;
        var match = BowdVariantPattern.Match(name.Trim());
        return match.Success ? new(match.Groups[1].Value, match.Groups[2].Value, Delayed.IsMatch(match.Groups[2].Value)) : null;
    }

    // Pays d'un bouquet : pays indiqué, sinon « FR: », « France · … ».
    internal static string GroupCountry(TvGroup group)
    {
        var name = group.Name ?? "";
        if (LeadingCode(name) is { } prefix) return prefix.Country;
        var found = CountryOfCode(name);
        return found.Length > 0 ? found : CountryOfWords(name);
    }

    private sealed class Prepared(TvEntry channel, TvSource source, string country, string nameKey, Variant? variant, string? baseKey)
    {
        public TvEntry Channel { get; } = channel; public TvSource Source { get; } = source; public string Country { get; } = country;
        public string NameKey { get; } = nameKey; public Variant? Variant { get; set; } = variant; public string? BaseKey { get; } = baseKey;
        public string? MatchKey { get; set; } public string? OfficialName { get; set; } public string? OfficialId { get; set; }
    }
    private sealed class Unified(string name, string? logo, string key, string country)
    {
        public string Name { get; set; } = name; public string? Logo { get; set; } = logo; public string Key { get; } = key; public string Country { get; set; } = country;
        public bool Official { get; set; } public string? IptvOrgId { get; set; } public bool IsLive { get; set; }
        public List<(TvEntry Channel, TvSource Source, string NameKey, string? VariantLabel)> Entries { get; } = [];
    }
    private static void Absorb(Unified twin, Unified unified)
    {
        twin.Entries.AddRange(unified.Entries);
        if (!Has(twin.Logo)) twin.Logo = unified.Logo;
        if (!Has(twin.IptvOrgId) && Has(unified.IptvOrgId)) twin.IptvOrgId = unified.IptvOrgId;
        if (twin.Country.Length == 0) twin.Country = unified.Country;
        if (unified.IsLive) twin.IsLive = true;
    }

    private static readonly Regex TwoLetters = R("^[a-z]{2}$");
    private static readonly Regex Upper2or3 = R(@"\s[A-Z]{2,3}$");
    private static readonly Regex NotLetters = R("[^A-Za-zÀ-ÿ]");
    private static readonly Regex FrenchEnd = R(@"\s(?:france|fr|fra|french)$", ignoreCase: true);
    private static readonly Regex NonDigits = R(@"\D");
    private static readonly Regex AnyDigit = R(@"\d");
    private static readonly Regex WordThenNumber = R(@"[A-Za-zÀ-ÿ+]\s\d");

    // Réunit les catalogues (une carte par chaîne), comme mergeChannels() du Web et de la PWA.
    internal static TvUnifiedChannel[] Merge(IEnumerable<(TvSource Source, TvEntry[] Channels)> loaded)
    {
        var parent = new Dictionary<string, string>(StringComparer.Ordinal);
        string Root(string key)
        {
            while (parent.TryGetValue(key, out var up) && up != key)
            {
                var next = parent.TryGetValue(up, out var grand) ? grand : up;
                parent[key] = next; key = next;
            }
            return key;
        }
        void Union(string a, string b)
        {
            var ra = Root(a); var rb = Root(b);
            parent.TryAdd(ra, ra); parent.TryAdd(rb, rb);
            if (ra != rb) parent[rb] = ra;
        }
        var prepared = new List<Prepared>();
        var baseNames = new HashSet<string>(StringComparer.Ordinal);
        var relayNames = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var (source, channels) in loaded)
            foreach (var channel in channels)
            {
                if (!KeepChannel(channel, source)) continue;
                var country = ChannelCountry(channel);
                var nameKey = UnifiedKey(channel.Name!, country) is { Length: > 0 } unifiedKey ? unifiedKey : Normalize(channel.Name);
                var variant = BowdVariant(channel.Name!, source);
                if (variant == null) baseNames.Add(nameKey);
                var baseKey = variant != null ? UnifiedKey(variant.Base, country) : null;
                if (baseKey is { Length: > 0 } && !variant!.Delayed)
                {
                    if (!relayNames.TryGetValue(baseKey, out var relays)) relayNames[baseKey] = relays = new(StringComparer.Ordinal);
                    relays.Add(nameKey);
                }
                prepared.Add(new(channel, source, country, nameKey, variant, baseKey));
            }
        var seenEntries = new HashSet<string>(StringComparer.Ordinal);
        prepared = prepared.Where(item =>
        {
            var channel = item.Channel;
            var id = channel.Id is { ValueKind: not (JsonValueKind.Null or JsonValueKind.Undefined) } raw && Truthy(raw) ? raw.ToString() : Address(channel);
            if (!seenEntries.Add(item.Source.Id + "\n" + item.NameKey + "\n" + id)) return false;
            var baseKey = item.BaseKey;
            var relays = baseKey is { Length: > 0 } ? relayNames.GetValueOrDefault(baseKey) : null;
            if (baseKey is { Length: > 0 } && (baseNames.Contains(baseKey) || relays is { Count: > 1 })) item.MatchKey = baseKey;
            else if (item.Variant is { Delayed: true }) return false;
            else item.Variant = null;
            item.MatchKey ??= item.NameKey;
            var nameKey = item.MatchKey;
            var official = Has(channel.IptvOrgName) ? UnifiedName(channel.IptvOrgName!) : null;
            var idKey = IptvKey(channel);
            var idCode = Regex.Match(idKey, @"\.([a-z]{2})$") is { Success: true } code ? code.Groups[1].Value : "";
            var idCountry = CountryOfCode(idCode) is { Length: > 0 } known ? known : idCode;
            parent.TryAdd(nameKey, nameKey);
            // Un identifiant ne confirme le rapprochement qu'avec un nom et un pays compatibles.
            if (item.Variant == null && official != null && official == UnifiedName(channel.Name!) && (idCountry.Length == 0 || idCountry == (item.Country.Length > 0 ? item.Country : "fr")))
            {
                item.OfficialName = channel.IptvOrgName; item.OfficialId = channel.IptvOrgId;
                if (idKey.Length > 0) Union(idKey, nameKey);
            }
            return true;
        }).ToList();
        prepared = prepared.OrderBy(item => item.Variant != null ? 1 : 0).ToList(); // tri stable, comme Array.prototype.sort
        var byKey = new Dictionary<string, Unified>(StringComparer.Ordinal);
        var list = new List<Unified>();
        foreach (var item in prepared)
        {
            var channel = item.Channel; var country = item.Country;
            var key = Root(item.MatchKey!);
            if (!byKey.TryGetValue(key, out var unified))
            {
                var display = item.OfficialName ?? CleanChannelName(item.Variant != null ? item.Variant.Base : channel.Name!);
                if (country.Length == 2 && country != "fr" && CountryOfWords(display).Length == 0 && !Upper2or3.IsMatch(display)) display += " " + country.ToUpperInvariant();
                byKey[key] = unified = new(display, channel.Logo ?? "", key, country);
                list.Add(unified);
            }
            if (unified.Country.Length == 0 && country.Length > 0) unified.Country = country;
            // Nom affiché : l'écriture la plus soignée (« beIN Sports 1 » plutôt que « BEIN SPORTS 1 »).
            var candidate = CleanChannelName(channel.Name!);
            if (item.Variant == null && !unified.Official && unified.Name == unified.Name.ToUpperInvariant() && candidate != candidate.ToUpperInvariant() && !(country.Length > 0 && country != "fr")) unified.Name = candidate;
            if (item.OfficialName != null && !unified.Official && !(country.Length > 0 && country != "fr")) { unified.Name = item.OfficialName; unified.Official = true; }
            unified.Entries.Add((channel, item.Source, item.NameKey, item.Variant?.Label));
            if (item.Variant != null) continue;
            if (!Has(unified.Logo) && Has(channel.Logo)) unified.Logo = channel.Logo;
            if (!Has(unified.IptvOrgId) && Has(item.OfficialId)) unified.IptvOrgId = item.OfficialId;
            if (Truthy(channel.IsLive)) unified.IsLive = true;
        }
        // Même chaîne, mots dans un autre ordre (« Sport 360 Canal+ ») : réunies aussi.
        var byWords = new Dictionary<string, Unified>(StringComparer.Ordinal);
        list = list.Where(unified =>
        {
            var country = (unified.Country.Length > 0 ? unified.Country : "fr") + ":";
            var words = BrandName(unified.Entries[0].Channel.Name!).Split(' ').Where(word => word.Length > 0 && !NoiseWords.Contains(word))
                .Select(word => word == "sports" ? "sport" : word).ToArray();
            var tokens = string.Join(" ", words.Where(word => !Digits.IsMatch(word)).Order(StringComparer.Ordinal)) + "|" + string.Join(" ", words.Where(word => Digits.IsMatch(word)));
            if (tokens == "|") return true;
            if (!byWords.TryGetValue(country + tokens, out var twin)) { byWords[country + tokens] = unified; return true; }
            Absorb(twin, unified);
            return false;
        }).ToList();
        // Même chaîne à une lettre près (« Cinéplus Premeir ») : noms d'au moins 9 lettres, mêmes numéros.
        var buckets = new Dictionary<string, List<(Unified Unified, string Letters)>>(StringComparer.Ordinal);
        list = list.Where(unified =>
        {
            var key = UnifiedName(unified.Entries[0].Channel.Name!);
            var letters = AnyDigit.Replace(key, "");
            if (letters.Length < 9) return true;
            var bucket = (unified.Country.Length > 0 ? unified.Country : "fr") + "|" + NonDigits.Replace(key, "") + "|" + key[..Math.Min(2, key.Length)];
            if (!buckets.TryGetValue(bucket, out var others)) buckets[bucket] = others = [];
            foreach (var other in others) if (OneEdit(other.Letters, letters)) { Absorb(other.Unified, unified); return false; }
            others.Add((unified, letters));
            return true;
        }).ToList();
        foreach (var unified in list)
        {
            // Nom affiché (chaîne française) : l'écriture la plus soignée et la plus courante des sources.
            if (unified.Official || unified.Country.Length > 0 && unified.Country != "fr") continue;
            var scores = new Dictionary<string, double>(StringComparer.Ordinal); var seen = new Dictionary<string, int>(StringComparer.Ordinal); var order = new List<string>();
            var keyDigits = NonDigits.Replace(unified.Key, "");
            foreach (var entry in unified.Entries)
            {
                if (entry.VariantLabel != null) continue;
                var name = CleanChannelName(entry.Channel.Name!);
                if (name.Length == 0) continue;
                if (!scores.ContainsKey(name))
                {
                    var letters = NotLetters.Replace(name, "");
                    scores[name] = (letters.Length > 0 && letters != letters.ToUpperInvariant() && letters != letters.ToLowerInvariant() ? 3 : letters == letters.ToUpperInvariant() ? 1 : 0)
                        - (FrenchEnd.IsMatch(name) ? 2 : 0) - (NonDigits.Replace(name, "") != keyDigits ? 2 : 0) + (WordThenNumber.IsMatch(name) ? 0.5 : 0) - name.Length / 60.0;
                    seen[name] = 0; order.Add(name);
                }
                if (++seen[name] <= 3) scores[name] += 0.3;
            }
            // Meilleur score ; à égalité, la première écriture rencontrée (tri stable).
            var best = order.OrderByDescending(name => scores[name]).FirstOrDefault();
            if (best != null) unified.Name = best;
        }
        // Ordre alphabétique, puis numéros TNT pour les chaînes françaises (tvUnifiedOrder() côté web).
        var sorted = list.Select(unified => (Unified: unified, Sort: SortKey(unified.Name))).OrderBy(pair => pair.Sort, StringComparer.Ordinal).Select(pair => pair.Unified).ToList();
        var used = new HashSet<int>(); var numbers = new Dictionary<Unified, int>();
        foreach (var unified in sorted.Where(unified => unified.Country == "fr"))
        {
            var number = TntNumbers.GetValueOrDefault(unified.Key);
            if (number == 0) number = unified.Entries.Select(entry => TntNumbers.GetValueOrDefault(entry.NameKey)).FirstOrDefault(value => value > 0);
            if (number == 0) number = TntNumbers.GetValueOrDefault(UnifiedName(unified.Name));
            if (number > 0 && used.Add(number)) numbers[unified] = number;
        }
        var next = 30;
        var french = sorted.Where(unified => unified.Country == "fr").OrderBy(unified => numbers.GetValueOrDefault(unified, 1000)).ToList();
        foreach (var unified in french) if (!numbers.ContainsKey(unified)) numbers[unified] = next++;
        var counts = sorted.Where(unified => unified.Country != "fr").GroupBy(unified => unified.Country.Length > 0 ? unified.Country : "?").ToDictionary(group => group.Key, group => group.Count());
        var codes = counts.Keys.Where(code => code != "?").OrderByDescending(code => counts[code]).ThenBy(code => code, StringComparer.Ordinal).ToList();
        if (counts.ContainsKey("?")) codes.Add("?");
        var number2 = numbers.Values.DefaultIfEmpty(0).Max() + 1;
        var foreign = new List<Unified>();
        foreach (var code in codes)
            foreach (var unified in sorted.Where(unified => unified.Country != "fr" && (unified.Country.Length > 0 ? unified.Country : "?") == code)) { numbers[unified] = number2++; foreign.Add(unified); }
        return french.Concat(foreign).Select(unified => new TvUnifiedChannel(unified.Name, unified.Key, unified.Country,
            unified.Entries.Select(entry => (entry.Source, entry.Channel)).ToArray(),
            unified.Entries.Where(entry => entry.VariantLabel != null).GroupBy(entry => entry.Channel).ToDictionary(group => group.Key, group => group.First().VariantLabel!),
            unified.Logo, numbers[unified])).ToArray();
    }

    // Chaîne française : pays reconnu « France », ou pays non indiqué mais rangée par une de ses sources dans une catégorie française.
    private static readonly Regex FrenchGroup = R(@"(?:^|[^a-z])(?:fr|fra|france|french|français|francais|tnt)(?:[^a-z]|$)", ignoreCase: true);
    internal static bool IsFrench(TvUnifiedChannel channel) =>
        channel.Country == "fr" || channel.Country.Length == 0 && channel.Entries.Any(entry => FrenchGroup.IsMatch(entry.Entry.Group ?? ""));
    // Bouquets chargés pour « Toutes les chaînes » : français ou sans pays, français d'abord (tvUnifiedGroupOrder()).
    internal static bool FrenchGroupName(TvGroup group) => FrenchGroup.IsMatch(group.Name ?? "");

    private static readonly Regex Marks = new("[̀-ͯ]", RegexOptions.Compiled);
    private static readonly Regex NonAlphanumeric = R("[^a-z0-9]+");
    internal static string Normalize(string? value) =>
        NonAlphanumeric.Replace(Marks.Replace((value ?? "").ToLowerInvariant().Normalize(NormalizationForm.FormD), ""), " ").Trim();
    private static readonly Regex Numbers = R(@"\d+");
    // Clé de tri : nombres complétés (« A LA CARTE 2 » avant « A LA CARTE 10 »).
    internal static string SortKey(string value) => Numbers.Replace(Normalize(value), match => match.Value.Length >= 6 ? match.Value : match.Value.PadLeft(6, '0'));
}
