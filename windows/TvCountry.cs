using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Noctra.Windows;

internal sealed record TvCountryChoice(string Code, string Name)
{
    public override string ToString() => Name;
}

internal static class TvCountry
{
    private static readonly ConcurrentDictionary<TvEntry, string> Cache = new();
    private static readonly Dictionary<string, string> Labels = new()
    {
        ["*"]="Tous les pays",["fr"]="France",["uk"]="Royaume-Uni",["us"]="États-Unis",["de"]="Allemagne",["es"]="Espagne",
        ["it"]="Italie",["pt"]="Portugal",["be"]="Belgique",["ch"]="Suisse",["ca"]="Canada",["arab"]="Monde arabe",["nl"]="Pays-Bas",
        ["tr"]="Turquie",["ro"]="Roumanie",["pl"]="Pologne",["ru"]="Russie",["br"]="Brésil",["ma"]="Maroc",["dz"]="Algérie",["tn"]="Tunisie",
        ["au"]="Australie",["in"]="Inde",["pk"]="Pakistan",["mx"]="Mexique",["gr"]="Grèce",["se"]="Suède",["dk"]="Danemark",["no"]="Norvège",
        ["fi"]="Finlande",["ie"]="Irlande",["at"]="Autriche",["za"]="Afrique du Sud",["afrique"]="Afrique francophone",["lu"]="Luxembourg",
        ["mc"]="Monaco",["ht"]="Haïti",["latam"]="Amérique latine",["zz"]="Pays non précisé"
    };
    private static Regex Pattern(string pattern) => new(pattern, RegexOptions.Compiled | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50));
    // Same French/foreign brand rules as the web client. A French-language channel need not be from France.
    private static readonly Regex French = Pattern(@"^(?:bein sports? (?:max ?)?(?:[1-9]|10)$|ligue ?1|tf1|tfx|tmc|france ?[2345]|france ?info|franceinfo|france ?24|m6|6ter|w9|arte|c8|cstar|nrj ?12|lcp|public senat|bfm|cnews|lci|gulli|l ?equipe|13 ?e?(?:me)? ?rue|ab ?[13]|rtl ?9|nrj ?hits|trace|rmc|cherie 25|canal plus|c plus|ocs|cine plus|paris premiere|teva|mcm|game one|tiji|piwi|planete plus|ushuaia|histoire tv|toute l histoire|seasons|chasse (?:et )?peche|equidia|infosport|tv5 monde|tv breizh|serie club|comedie plus|polar plus|action(?: tv)?$|novelas|mangas|j one|automoto|kto|i24|b smart|la chaine meteo|eurosport ?[12]? france|dazn france|olympia|melody|t18|novo19)(?:\s|$)");
    private static readonly (Regex Pattern, string Code)[] Foreign =
    [
        (Pattern(@"^(?:al jazeera|al arabiya|al hadath|sky news arabia|mbc|rotana|dubai|abu dhabi|sharjah|al mayadeen|al manar|nile|france 24 arab|bein sports? (?:arabia|mena|news))(?:\s|$)"),"arab"),
        (Pattern(@"^(?:2m|al aoula|arryadia|medi ?1 tv|tamazight|assadissa)(?:\s|$)"),"ma"),
        (Pattern(@"^(?:canal algerie|echorouk|ennahar|el bilad|beur tv|samira)(?:\s|$)"),"dz"),
        (Pattern(@"^(?:watania|nessma|hannibal|el hiwar|attessia)(?:\s|$)"),"tn"),
        (Pattern(@"^(?:la une|tipik|la trois|rtl tvi|club rtl|plug rtl|ln ?24|bx ?1|rtbf)(?:\s|$)"),"be"),
        (Pattern(@"^(?:rts (?:un|deux|1 suisse)|leman bleu|la tele suisse)(?:\s|$)"),"ch"),
        (Pattern(@"^(?:tva|tele quebec|noovo|lcn|rdi|ici (?:tele|rdi|artv|radio canada)|radio canada|rds|tva sports|canal vie|canal d|series plus|super ecran|vrak|yoopa|historia|evasion|unis)(?:\s|$)"),"ca"),
        (Pattern(@"^(?:africa ?24|africable|a plus ivoire|trace africa|nollywood|rti ?[12]?|rts ?[12]?(?: senegal)?|ortm|crtv|ortb|rtnc|rtb|canal ?2 international|equinoxe|novelas tv afrique|canal plus afrique|life tv|nci|tele congo|rtg|tfm|2stv|sen tv|walf|vox africa|love world|kalac|bblack africa)(?:\s|$)"),"afrique")
    ];
    private static string Plain(string value) => Regex.Replace(string.Concat(value.Normalize(NormalizationForm.FormKD)
        .Where(character => CharUnicodeInfo.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark)).ToLowerInvariant()
        .Replace("+"," plus ").Replace("&"," et "), @"[^a-z0-9]+", " ").Trim();
    internal static string Label(string code) => Labels.GetValueOrDefault(code, code.ToUpperInvariant());
    internal static string Group(string? group)
    {
        if (TvIdentity.NameCountry(group ?? "") is { Length: > 0 } named) return named;
        var text = Plain(group ?? "");
        if (text.Contains("united kingdom", StringComparison.Ordinal)) return "uk";
        foreach (var word in text.Split(' ')) if (TvIdentity.CountryCode(word) is { Length: > 0 } code) return code;
        return "zz";
    }
    internal static string Of(TvEntry entry)
    {
        if (Cache.TryGetValue(entry, out var found)) return found;
        if (Cache.Count > 150000) Cache.Clear();
        return Cache[entry] = Compute(entry);
    }
    private static string Compute(TvEntry entry)
    {
        var name=entry.Name ?? "";
        var brand=Plain(TvIdentity.CleanName(name));
        foreach (var (pattern,code) in Foreign) if (pattern.IsMatch(brand)) return code;
        if (Regex.IsMatch(name,@"[\u0600-\u06ff]")) return "arab";
        if (TvIdentity.NameCountry(name) is { Length: > 0 } named) return named;
        var explicitCode=TvIdentity.CountryCode(entry.Country);
        if (explicitCode.Length > 0 && explicitCode != "fr") return explicitCode;
        if (French.IsMatch(brand)) return "fr";
        if (TvIdentity.CountryCode(entry.IptvOrgCountry) is { Length: > 0 } reference) return reference;
        var epg=Regex.Match(entry.IptvOrgId ?? entry.EpgId ?? "",@"\.([a-z]{2})(?:@|$)",RegexOptions.IgnoreCase);
        if (epg.Success && TvIdentity.CountryCode(epg.Groups[1].Value) is { Length: > 0 } codeFromGuide) return codeFromGuide;
        if (explicitCode.Length > 0) return explicitCode;
        return Group(entry.Group);
    }
}
