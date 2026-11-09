using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Noctra.Windows;

internal sealed record TvChannel(string Name, (TvSource Source, TvEntry Entry)[] Entries);

// The same naming rules as Noctra TV/web: quality and mirror suffixes are not different channels.
internal static class TvIdentity
{
    private static readonly ConcurrentDictionary<string, Regex> Patterns = new();
    private static readonly ConcurrentDictionary<string, (string Clean, string Key, string Words, string Country)> Names = new();
    private static string Replace(string value, string pattern, string replacement = " ") => Patterns.GetOrAdd(pattern,
        p => new Regex(p, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled, TimeSpan.FromMilliseconds(40))).Replace(value, replacement);
    private static readonly string[] Noise = "channel live direct officiel official hq lq h264 h265 x264 x265 fps 60fps 50fps 1080 1080p 720 720p 2160p premium multi audio vf vff vostfr stream server serveur source link lien alt backup secours mirror hevc uhd fhd hd sd 4k 8k tnt".Split(' ');
    private static readonly Dictionary<string, string> Countries = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, string> Aliases = new()
    {
        ["hd1"] = "tf1seriesfilms", ["tf1seriefilm"] = "tf1seriesfilms", ["nt1"] = "tfx", ["numero23"] = "rmcstory", ["d8"] = "c8", ["d17"] = "cstar", ["itele"] = "cnews",
        ["lequipe21"] = "lequipe", ["lequipetv"] = "lequipe", ["franceinfotv"] = "franceinfo", ["lcpan"] = "lcp", ["lcpassembleenationale"] = "lcp", ["artefrance"] = "arte",
        ["canal"] = "canalplus", ["eurosport"] = "eurosport1", ["beinsport"] = "beinsport1", ["rmcsport"] = "rmcsport1", ["tv5"] = "tv5monde"
    };
    static TvIdentity()
    {
        foreach (var group in new[] { "fr france french francais francaise fra", "uk gb unitedkingdom england britain", "us usa unitedstates america", "de ger germany deutschland allemagne", "es esp spa spain espana espagne", "it ita italy italia italie", "pt por portugal", "be belgium belgique", "ch switzerland suisse", "ca canada quebec", "arab ar ara arabic arabia mena", "nl netherlands holland", "tr turkey turkiye", "ro romania", "pl poland", "ru russia", "br brazil brasil bresil", "ma maroc morocco", "dz algerie algeria", "tn tunisie tunisia", "au australia", "in india", "pk pakistan" })
        {
            var words = group.Split(' '); foreach (var word in words) Countries[word] = words[0];
        }
        foreach (var group in new[] { "mx mexico", "gr greece grece", "se sweden suede", "dk denmark danemark", "no norway norvege", "fi finland finlande", "ie ireland irlande", "at austria autriche", "za southafrica", "afrique africa", "lu luxembourg", "mc monaco", "ht haiti", "latam latino" })
        { var words = group.Split(' '); foreach (var word in words) Countries[word] = words[0]; }
    }
    private static string Plain(string value) => string.Concat(value.Normalize(NormalizationForm.FormKD)
        .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)).ToLowerInvariant();
    private static string Country(string value) => Countries.GetValueOrDefault(Replace(Plain(value), @"[^a-z]", ""), "");

    private static (string Clean, string Key, string Words, string Country) Identify(string name, string? country)
    {
        var cacheKey = name + "\n" + country;
        if (Names.TryGetValue(cacheKey, out var saved)) return saved;
        var raw = name.Normalize(NormalizationForm.FormKC).Trim(); var region = Country(country ?? "");
        var lead = Regex.Match(raw, @"^\s*[\[(|]?\s*([A-Za-z]{2,12})\s*[\])|]?\s*([:|\-–]+|\s)\s*", RegexOptions.CultureInvariant);
        if (lead.Success && Country(lead.Groups[1].Value) is { Length: > 0 } code &&
            (lead.Groups[2].Value.Trim().Length > 0 || lead.Groups[1].Value == lead.Groups[1].Value.ToUpperInvariant()))
        { if (region.Length == 0) region = code; raw = raw[lead.Length..]; }
        var flag = raw.EnumerateRunes().Where(rune => rune.Value is >= 0x1F1E6 and <= 0x1F1FF).Take(2).ToArray();
        if (region.Length == 0 && flag.Length == 2) region = Country(string.Concat(flag.Select(rune => (char)('a' + rune.Value - 0x1F1E6))));
        raw = Replace(raw, @"[\p{So}\p{Cs}]+", "");
        raw = Replace(raw, @"\[[^\]]*\]|\([^)]*\)");
        raw = Replace(raw, @"^\s*(?:VIP|4K|HD|FHD)\s*[:|\-–]\s*");
        raw = Replace(raw, @"\b(?:backup|secours|alt|link|lien|source|server|serveur|mirror|option|flux|variante)\s*\d{1,2}\b");
        raw = Replace(raw, @"(?:\s[·|•#–]\s*|\s+-\s*)\d{1,2}\s*$");
        raw = Replace(raw, @"\b(?:UHD|FHD|FULL ?HD|HD|SD|4K|8K|HEVC|H\.?265|1080[pi]?|720p|2160p|[56]0 ?fps|backup|secours|raw|vip|multi ?audio)\b");
        raw = Replace(raw, @"\s*·\s*(?:BASIC|CABLE|SAT|PREMIUM)(?:\s*·\s*)?$");
        raw = Replace(raw, @"\s+\.[A-Za-z0-9]{1,3}(?=\s|$)");
        raw = Replace(raw, @"[|•·▎┃]+"); raw = Replace(raw, @"\s+", " ").Trim();
        var last = Regex.Match(raw, @"\s+([A-Za-z]{2,12})$");
        if (last.Success && Country(last.Groups[1].Value) is { Length: > 0 } trailing)
        { if (region.Length == 0) region = trailing; raw = raw[..last.Index].Trim(); }
        var plain = Replace(Plain(raw).Replace("+", " plus ").Replace("&", " et "), @"[^a-z0-9]+", " ").Trim();
        plain = Replace(plain, @"\bc\s+plus\b", "canal plus");
        plain = Replace(plain, @"\b(\d+)\s+(?:eme|e|er|ere)\b", "$1");
        plain = Replace(plain, @"\b(\d+)(?:eme|e|er|ere)\b", "$1");
        var words = plain.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(word => word == "sports" ? "sport" : word)
            .Where(word => !Noise.Contains(word) && word is not ("et" or "and")).ToList();
        if (words.Count > 1 && words[^1] == "tv") words.RemoveAt(words.Count - 1);
        if (words.Count > 2 && words[^1].Length == 1 && char.IsLetter(words[^1][0]) && words[^2].All(char.IsDigit)) words.RemoveAt(words.Count - 1);
        var key = string.Concat(words);
        if (key.Length > 4 && key.EndsWith("tv", StringComparison.Ordinal) && !Regex.IsMatch(key, @"^(?:tv|mtv|btv)")) key = key[..^2];
        key = Replace(key, @"^beinsports?", "beinsport"); key = Replace(key, @"^bein(?=max\d|\d)", "beinsport");
        key = Aliases.GetValueOrDefault(key, key);
        var countryKey = region is "" or "fr" ? "" : region + ":";
        var sorted = string.Join(" ", words.Where(word => !word.All(char.IsDigit)).Order()) + "|" + string.Join(" ", words.Where(word => word.All(char.IsDigit)));
        var result = (raw.Length > 0 ? raw : name.Trim(), countryKey + key, countryKey + sorted, region);
        if (Names.Count > 30000) Names.Clear(); Names[cacheKey] = result; return result;
    }
    internal static string Key(string name, string? country = null) => Identify(name, country).Key;
    internal static string CountryCode(string? country) => Country(country ?? "");
    internal static string NameCountry(string name) => Identify(name, null).Country;
    internal static string CleanName(string name) => Identify(name, null).Clean;

    internal static TvChannel[] Group(IEnumerable<(TvSource Source, TvEntry Entry)> entries, bool events)
    {
        var groups = entries.GroupBy(pair => events ? pair.Entry.Name!.Trim() : Key(pair.Entry.Name!, TvCountry.Of(pair.Entry)))
            .Select(group => group.ToList()).ToArray();
        var byWords = new Dictionary<string, List<(TvSource Source, TvEntry Entry)>>();
        var buckets = new Dictionary<string, List<(string Letters, List<(TvSource Source, TvEntry Entry)> Entries)>>();
        var output = new List<List<(TvSource Source, TvEntry Entry)>>();
        foreach (var group in groups)
        {
            var identity = Identify(group[0].Entry.Name!, TvCountry.Of(group[0].Entry));
            if (!events && byWords.TryGetValue(identity.Words, out var sameWords)) { sameWords.AddRange(group); continue; }
            var letters = string.Concat(identity.Key.Where(char.IsLetter));
            var bucketKey = (identity.Country is "" or "fr" ? "fr" : identity.Country) + "|" + string.Concat(identity.Key.Where(char.IsDigit)) + "|" + letters[..Math.Min(2, letters.Length)];
            if (!events && letters.Length >= 9 && buckets.TryGetValue(bucketKey, out var others) && others.FirstOrDefault(other => OneEdit(other.Letters, letters)).Entries is { } twin)
            { twin.AddRange(group); byWords[identity.Words] = twin; continue; }
            output.Add(group); byWords[identity.Words] = group;
            if (!buckets.TryGetValue(bucketKey, out var bucket)) buckets[bucketKey] = bucket = [];
            bucket.Add((letters, group));
        }
        return output.Select(group => new TvChannel(events ? group[0].Entry.Name!.Trim() :
            group.Select(pair => Identify(pair.Entry.Name!, pair.Entry.Country).Clean).OrderByDescending(name => name.Any(char.IsLower) && name.Any(char.IsUpper)).ThenBy(name => name.Length).First(), group.ToArray())).ToArray();
    }
    private static bool OneEdit(string left, string right)
    {
        if (left == right) return true;
        if (Math.Abs(left.Length - right.Length) > 1) return false;
        var index = 0; while (index < Math.Min(left.Length, right.Length) && left[index] == right[index]) index++;
        if (left.Length == right.Length) return left[(index + 1)..] == right[(index + 1)..] ||
            index + 1 < left.Length && left[index] == right[index + 1] && left[index + 1] == right[index] && left[(index + 2)..] == right[(index + 2)..];
        return left.Length > right.Length ? left[(index + 1)..] == right[index..] : left[index..] == right[(index + 1)..];
    }
}
