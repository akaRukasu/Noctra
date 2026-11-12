package com.noctra.mobile.live

import com.noctra.mobile.core.JsonMap
import java.text.Normalizer
import java.util.regex.Pattern as JPattern

// Règles de la TV en direct reprises de Noctra TV (apps/androidtv/web/app.js) :
// noms de chaînes nettoyés, rapprochement des mêmes chaînes entre sources,
// pays (France d'abord), catégories claires, numéros de la TNT.
// Fonctions pures, appelées hors du fil principal pendant le chargement.

private class Rx(pattern: String, caseInsensitive: Boolean = false) {
    private val regex: JPattern? = runCatching { JPattern.compile(pattern, if (caseInsensitive) JPattern.CASE_INSENSITIVE or JPattern.UNICODE_CASE else 0) }.getOrNull()

    fun replace(text: String, template: String): String = regex?.matcher(text)?.replaceAll(template) ?: text
    fun test(text: String): Boolean = regex?.matcher(text)?.find() == true

    /** Groupes capturés (texte vide si absent) et longueur de la correspondance. */
    fun match(text: String): Pair<List<String>, Int>? {
        val matcher = regex?.matcher(text) ?: return null
        if (!matcher.find()) return null
        val groups = (0..matcher.groupCount()).map { matcher.group(it) ?: "" }
        return groups to (matcher.end() - matcher.start())
    }
}

object ChannelNaming {
    // MARK: Pays

    val countryCodes = mapOf(
        "fr" to "fr", "fra" to "fr", "uk" to "uk", "gb" to "uk", "en" to "uk", "us" to "us", "usa" to "us", "de" to "de", "ger" to "de", "es" to "es", "spa" to "es", "esp" to "es",
        "it" to "it", "ita" to "it", "pt" to "pt", "por" to "pt", "br" to "br", "ar" to "arab", "ara" to "arab", "nl" to "nl", "be" to "be", "ch" to "ch", "ca" to "ca", "au" to "au",
        "tr" to "tr", "pl" to "pl", "ro" to "ro", "ru" to "ru", "mx" to "mx", "gr" to "gr", "se" to "se", "dk" to "dk", "no" to "no", "fi" to "fi", "hu" to "hu", "cz" to "cz", "sk" to "sk",
        "rs" to "rs", "hr" to "hr", "al" to "al", "bg" to "bg", "ua" to "ua", "il" to "il", "in" to "in", "pk" to "pk", "za" to "za", "ie" to "ie", "at" to "at", "lat" to "latam",
        "latam" to "latam", "ma" to "ma", "dz" to "dz", "tn" to "tn", "qa" to "arab", "sa" to "arab", "ae" to "arab", "eg" to "arab"
    )

    val countryWords = mapOf(
        "france" to "fr", "french" to "fr", "francais" to "fr", "francaise" to "fr", "united kingdom" to "uk", "england" to "uk", "britain" to "uk", "usa" to "us",
        "america" to "us", "germany" to "de", "deutschland" to "de", "allemagne" to "de", "spain" to "es", "espana" to "es", "espagne" to "es", "italy" to "it",
        "italia" to "it", "italie" to "it", "portugal" to "pt", "brazil" to "br", "brasil" to "br", "bresil" to "br", "arabic" to "arab", "arab" to "arab", "arabia" to "arab",
        "mena" to "arab", "netherlands" to "nl", "holland" to "nl", "belgium" to "be", "belgique" to "be", "switzerland" to "ch", "suisse" to "ch", "canada" to "ca",
        "quebec" to "ca", "australia" to "au", "turkey" to "tr", "turkiye" to "tr", "poland" to "pl", "polska" to "pl", "romania" to "ro", "russia" to "ru", "mexico" to "mx",
        "latino" to "latam", "greece" to "gr", "sweden" to "se", "denmark" to "dk", "norway" to "no", "finland" to "fi", "india" to "in", "pakistan" to "pk",
        "ireland" to "ie", "austria" to "at", "maroc" to "ma", "morocco" to "ma", "algerie" to "dz", "algeria" to "dz", "tunisie" to "tn", "tunisia" to "tn",
        "africa" to "afrique", "afrique" to "afrique"
    )

    private val countryLabels = mapOf(
        "fr" to "France", "uk" to "Royaume-Uni", "us" to "États-Unis", "de" to "Allemagne", "es" to "Espagne", "it" to "Italie", "pt" to "Portugal", "br" to "Brésil",
        "arab" to "Monde arabe", "nl" to "Pays-Bas", "be" to "Belgique", "ch" to "Suisse", "ca" to "Canada", "au" to "Australie", "tr" to "Turquie", "pl" to "Pologne",
        "ro" to "Roumanie", "ru" to "Russie", "mx" to "Mexique", "latam" to "Amérique latine", "gr" to "Grèce", "se" to "Suède", "in" to "Inde", "pk" to "Pakistan",
        "ie" to "Irlande", "at" to "Autriche", "ma" to "Maroc", "dz" to "Algérie", "tn" to "Tunisie", "za" to "Afrique du Sud", "afrique" to "Afrique francophone",
        "lu" to "Luxembourg", "mc" to "Monaco", "ht" to "Haïti"
    )

    fun countryLabel(code: String): String = when {
        code.isEmpty() -> "Tous les pays"
        code == "?" -> "Pays non indiqué"
        else -> countryLabels[code] ?: code.uppercase()
    }

    private val frenchBrands = Rx("^(?:bein ?sports? (?:max ?)?(?:[1-9]|10)$|ligue ?1|tf1|tfx|tmc|france ?[2345]|france ?info|franceinfo|france ?24|m6|6ter|w9|arte|c8|cstar|nrj ?12|lcp|public senat|bfm|cnews|lci|gulli|l ?equipe|bfm ?tv|13 ?e?(?:me)? ?rue|ab ?[13]|rtl ?9|nrj ?hits|trace|rmc|cherie 25|canal ?plus|c ?plus|ocs|cine ?plus|paris premiere|teva|m6 music|mcm|game ?one|tiji|piwi|planete ?plus|ushuaia|histoire tv|toute l ?histoire|seasons|chasse ?(?:et|&) ?peche|equidia|infosport|tv5 ?monde|tv ?breizh|serie ?club|13e ?rue|comedie ?plus|polar ?plus|action ?(?:tv)?$|novelas|mangas|j ?one|automoto|kto|i24|b ?smart|bfm ?business|la chaine meteo|eurosport ?[12]? ?france|bein sports? .*france|rmc sport|dazn france|l ?equipe ?tv|olympia|melody|m6 boutique|tf1 series films|franceinfo tv|lcp an|t18|novo19|w ?9|6 ?ter)(?:\\s|$)")

    private val foreignBrands = listOf(
        Rx("^(?:al ?jazeera|al ?arabiya|al ?hadath|sky news arabia|mbc|rotana|dubai|abu dhabi|sharjah|al ?mayadeen|al ?manar|nile|france ?24 arab|bein sports? (?:arabia|mena|news))(?:\\s|$)") to "arab",
        Rx("^(?:2m|al ?aoula|arryadia|medi ?1 ?tv|tamazight|assadissa)(?:\\s|$)") to "ma",
        Rx("^(?:canal algerie|echorouk|ennahar|el ?bilad|beur ?tv|samira)(?:\\s|$)") to "dz",
        Rx("^(?:watania|nessma|hannibal|el ?hiwar|attessia)(?:\\s|$)") to "tn",
        Rx("^(?:la une|tipik|la trois|rtl ?tvi|club rtl|plug rtl|ln ?24|bx ?1|rtbf)(?:\\s|$)") to "be",
        Rx("^(?:rts ?(?:un|deux|1 suisse)|leman bleu|la tele suisse)(?:\\s|$)") to "ch",
        Rx("^(?:tva|tele ?quebec|noovo|lcn|rdi|ici (?:tele|rdi|artv|radio canada)|radio canada|rds|tva sports|canal vie|canal d|series ?plus|super ecran|vrak|yoopa|historia|evasion|unis)(?:\\s|$)") to "ca",
        Rx("^(?:africa ?24|africable|a ?plus ?ivoire|trace africa|nollywood|rti ?[12]?|rts ?[12]?(?: senegal)?|ortm|crtv|ortb|rtnc|rtb|canal ?2 ?international|equinoxe|novelas tv afrique|canal plus afrique|life tv|nci|tele congo|rtg|tfm|2stv|sen ?tv|walf|vox africa|love world|kalac|bblack africa)(?:\\s|$)") to "afrique"
    )

    fun countryOfCode(value: String?): String {
        val code = (value ?: "").lowercase().filter { it in 'a'..'z' }
        return countryCodes[code] ?: countryWords[code] ?: ""
    }

    fun countryOfWords(value: String?): String {
        val words = normalize(value ?: "").split(" ").filter { it.isNotEmpty() }
        for ((index, word) in words.withIndex()) {
            countryWords[word]?.let { return it }
            if (index < words.size - 1) countryWords["$word ${words[index + 1]}"]?.let { return it }
        }
        return ""
    }

    /** Drapeau (🇫🇷, 🇬🇧…) dans un texte : code pays à deux lettres. */
    private fun flagCode(text: String): String? {
        val points = text.codePoints().toArray()
        for (index in 0 until maxOf(0, points.size - 1)) {
            val first = points[index]
            val second = points[index + 1]
            if (first in 0x1F1E6..0x1F1FF && second in 0x1F1E6..0x1F1FF) {
                return "${(97 + first - 0x1F1E6).toChar()}${(97 + second - 0x1F1E6).toChar()}"
            }
        }
        return null
    }

    private val leadingWord = Rx("^\\s*[\\[(|]?\\s*([A-Za-z]{4,12})\\s*[\\])|]?\\s*[:|\\-–]\\s*")
    private val leadingCodePattern = Rx("^\\s*[\\[(|]?\\s*([A-Za-z]{2,3})\\s*[\\])|]?\\s*([^\\w\\sÀ-ɏ]+|\\s)\\s*")

    /** Code pays en tête du nom : « FR: », « FR| », « [FR] », « FRANCE: »… et sa longueur. */
    fun leadingCode(name: String): Pair<String, Int>? {
        leadingWord.match(name)?.let { (groups, length) -> countryWords[groups[1].lowercase()]?.let { return it to length } }
        val (groups, length) = leadingCodePattern.match(name) ?: return null
        val code = groups[1]
        val country = countryOfCode(code)
        if (country.isEmpty() || (groups[2].isBlank() && code != code.uppercase())) return null
        return country to length
    }

    private val suffixCode = Rx("[\\s(\\[|\\-]([A-Z]{2,3})[)\\]]?\\s*$")
    private val groupCode = Rx("(?:^|[^A-Za-z])([A-Z]{2,3})(?:[^A-Za-z]|$)")
    private val idCountry = Rx("\\.([a-z]{2})(?:@|$)", caseInsensitive = true)
    private val arabicScript = Rx("[\\u0600-\\u06FF]")

    /** Pays d'une chaîne : nom, catégorie de la source, marque française, champs du fournisseur. */
    fun country(raw: JsonMap): String {
        val name = raw["name"] as? String ?: ""
        if (arabicScript.test(name)) return "arab"
        val brand = brandName(name)
        for ((pattern, code) in foreignBrands) if (pattern.test(brand)) return code
        flagCode(name)?.let { flag -> countryOfCode(flag).takeIf { it.isNotEmpty() }?.let { return it } }
        leadingCode(name)?.let { return it.first }
        suffixCode.match(name)?.let { (groups, _) -> countryOfCode(groups[1]).takeIf { it.isNotEmpty() }?.let { return it } }
        val words = normalize(name).split(" ").filter { it.isNotEmpty() }
        if (words.size > 1) countryWords[words.last()]?.let { return it }
        val group = raw["group"] as? String ?: ""
        flagCode(group)?.let { flag -> countryOfCode(flag).takeIf { it.isNotEmpty() }?.let { return it } }
        val fromGroup = countryOfWords(group).ifEmpty { groupCode.match(group)?.let { countryOfCode(it.first[1]) } ?: "" }
        if (fromGroup.isNotEmpty()) return fromGroup
        if (frenchBrands.test(brand)) return "fr"
        for (value in listOf(raw["iptvOrgCountry"] as? String, raw["country"] as? String)) {
            val found = countryOfCode(value)
            if (found.isNotEmpty()) return found
        }
        countryOfWords(raw["country"] as? String).takeIf { it.isNotEmpty() }?.let { return it }
        for (value in listOf(raw["iptvOrgId"] as? String, raw["epgId"] as? String)) {
            idCountry.match(value ?: "")?.let { (groups, _) -> countryOfCode(groups[1]).takeIf { it.isNotEmpty() }?.let { return it } }
        }
        val language = (raw["language"] as? String)?.lowercase()
        if (language in setOf("fr", "fra", "fre", "french", "francais", "français")) return "fr"
        return ""
    }

    // MARK: Noms

    private val marks = Regex("\\p{Mn}+")

    fun normalize(value: String): String {
        val folded = marks.replace(Normalizer.normalize(value.lowercase(), Normalizer.Form.NFD), "")
        val result = StringBuilder()
        var space = false
        for (char in folded) {
            if (char in 'a'..'z' || char in '0'..'9') {
                if (space && result.isNotEmpty()) result.append(' ')
                space = false
                result.append(char)
            } else space = true
        }
        return result.toString()
    }

    private val sortDigits = Regex("\\d+")

    /** Clé de tri : nombres complétés par des zéros (« A LA CARTE 2 » avant « A LA CARTE 10 »). */
    fun sortKey(value: String): String = sortDigits.replace(normalize(value)) { it.value.padStart(6, '0') }

    private val cleanSteps = listOf(
        Rx("^\\s*(?:\\[[^\\]]*\\]|\\([^)]*\\))\\s*") to "",
        Rx("^\\s*(?:VIP|4K|HD|FHD)\\s*[:|\\-–]\\s*", true) to "",
        Rx("\\[[^\\]]*\\]|\\([^)]*\\)") to " ",
        Rx("\\b(?:backup|secours|alt|link|lien|source|server|serveur|mirror|option)\\s*\\d{1,2}\\b", true) to " ",
        Rx("(\\d)\\s*(?:[·|•#–]|\\s-)\\s*\\d{1,2}\\s*$") to "$1",
        Rx("\\s#\\d{1,2}\\s*$") to " ",
        Rx("\\b(?:UHD|FHD|FULL ?HD|HD|SD|4K|HEVC|H\\.?265|1080[pi]?|720p|50 ?fps|backup|secours|raw|vip|multi ?audio)\\b", true) to " ",
        Rx("(?:\\s*·\\s*(?:[A-Z0-9][A-Z0-9 +]{0,17}|Flux\\s*\\d+|Serveur\\s*\\d+|Variante\\s+\\S+)?)+\\s*$") to "",
        Rx("[|•·▎┃]+") to " ",
        Rx("(^|\\s)(canal|c|cin[eé]|plan[eè]te|golf|piwi|teletoon|polar|com[eé]die|infosport|ligue 1)\\s+\\+(?=\\s|$)", true) to "$1$2+",
        Rx("(^|\\s)\\++(?=\\s|$)") to " ",
        Rx("\\s+\\.[A-Za-z0-9]{1,3}(?=\\s|$)") to " ",
        Rx("\\s+") to " "
    )
    private val decorations = Rx("[\\x{1F1E6}-\\x{1F1FF}ʰ-˿ᴀ-ᶿ⁰-₟℀-⅏─-◿☀-➿]")

    /** « FR: TF1 HD », « [FR] TF1 (backup) », « FR| TF1 ᴴᴰ 🇫🇷 » → « TF1 ». */
    fun cleanName(name: String): String {
        var raw = Normalizer.normalize(decorations.replace(name, " "), Normalizer.Form.NFKC).trim()
        leadingCode(raw)?.let { (_, length) -> if (length <= raw.length) raw = raw.substring(length) }
        var clean = raw
        for ((pattern, template) in cleanSteps) clean = pattern.replace(clean, template)
        clean = clean.trim()
        return clean.ifEmpty { name.trim() }
    }

    private val frenchSuffix = Rx("\\s+(?:france|fr|fra)$")

    fun brandName(name: String): String = frenchSuffix.replace(normalize(cleanName(name).replace("+", " plus ")), "").trim()

    private val noiseWords = setOf(
        "channel", "live", "direct", "officiel", "official", "hq", "lq", "h264", "h265", "x264", "x265", "fps", "60fps", "50fps", "1080", "1080p", "720",
        "720p", "2160p", "premium", "multi", "audio", "vf", "vff", "vostfr", "stream", "server", "serveur", "source", "link", "lien", "alt", "backup",
        "secours", "mirror", "hevc", "uhd", "fhd", "hd", "sd", "4k", "8k", "tnt"
    )

    private val aliases = mapOf(
        "hd1" to "tf1seriesfilms", "tf1seriefilm" to "tf1seriesfilms", "nt1" to "tfx", "numero23" to "rmcstory", "d8" to "c8", "d17" to "cstar", "itele" to "cnews",
        "lequipe21" to "lequipe", "lequipetv" to "lequipe", "franceinfotv" to "franceinfo", "lcpan" to "lcp", "lcpassembleenationale" to "lcp", "artefrance" to "arte",
        "canal" to "canalplus", "canalplusfrance" to "canalplus", "eurosport" to "eurosport1", "beinsport" to "beinsport1", "rmcsport" to "rmcsport1", "tv5" to "tv5monde",
        "france24fr" to "france24", "tf1sf" to "tf1seriesfilms", "tcm" to "tcmcinema", "canalplusfamily" to "canalpluskids", "cineplusfamiz" to "cineplusfamily",
        "cineplusclassique" to "cineplusclassic", "cinepremier" to "cinepluspremier", "natgeo" to "nationalgeographic", "natgeowild" to "nationalgeographicwild",
        "france3national" to "france3", "okoofrance4" to "france4", "canalplusfootball" to "canalplusfoot", "canalplusdocumentaires" to "canalplusdocs",
        "automotolachaine" to "automoto", "lachaineinfo" to "lci", "lachaineparlementaire" to "lcp", "tv5mondefbs" to "tv5monde",
        "tv5mondefrancebelgiquesuisse" to "tv5monde", "disneyjr" to "disneyjunior", "l1plus" to "ligue1plus", "bfmgrandparis" to "bfmparis", "i24newsfrancais" to "i24news"
    )

    private val ordinal = Regex("^(\\d+)(?:eme|e|er|ere)$")

    /** Nom de rapprochement : « beIN Sport 1 » = « BEIN SPORTS 1 » = « beIN Sports 1 France ». */
    fun unifiedName(name: String): String {
        var brand = brandName(name)
        if (brand.startsWith("la chaine l equipe") || brand.startsWith("la chaine lequipe")) brand = brand.removePrefix("la chaine ")
        val words = mutableListOf<String>()
        for ((index, word) in brand.split(" ").filter { it.isNotEmpty() }.withIndex()) {
            if (word in noiseWords) continue
            if (index > 0 && (word == "et" || word == "and")) continue
            var value = if (word == "sports") "sport" else word
            ordinal.find(value)?.let { value = it.groupValues[1] }
            words += value
        }
        if (words.size > 1 && words.last() == "tv") words.removeAt(words.lastIndex)
        if (words.size > 2 && words.last().length == 1 && words.last()[0].isLetter() && words[words.size - 2].all { it.isDigit() }) words.removeAt(words.lastIndex)
        var key = words.joinToString("")
        if (key.length > 4 && key.endsWith("tv") && !(key.startsWith("tv") || key.startsWith("mtv") || key.startsWith("btv"))) key = key.dropLast(2)
        if (key.startsWith("cplus")) key = "canalplus" + key.drop(5)
        if (key.startsWith("beinsports")) key = "beinsport" + key.drop(10)
        else if (key.startsWith("bein") && !key.startsWith("beinsport")) {
            val rest = key.drop(4)
            if (rest.firstOrNull()?.isDigit() == true || rest.startsWith("max")) key = "beinsport$rest"
        }
        if (key.startsWith("ocscineplus")) key = key.drop(3)
        return aliases[key] ?: key
    }

    /** Clé de regroupement : même nom et même pays ; une chaîne sans pays rejoint la française. */
    fun key(name: String, country: String): String {
        if (country.isEmpty() || country == "fr") {
            val base = unifiedName(name)
            return base.ifEmpty { normalize(name) }
        }
        val words = normalize(cleanName(name)).split(" ").filter { it.isNotEmpty() }.toMutableList()
        if (words.size > 1 && (countryCodes[words.last()] != null || countryWords[words.last()] != null)) words.removeAt(words.lastIndex)
        val base = unifiedName(words.joinToString(" "))
        return "$country:" + base.ifEmpty { normalize(name) }
    }

    // MARK: Catégories et numéros

    private val categories = listOf(
        "Sport" to Rx("\\bsports?\\b|^(?:bein|rmc sport|eurosport|l ?equipe|dazn|ligue 1|golf|infosport|equidia|automoto|multisports|canal plus (?:foot|ligue|top|moto|formula|f1|premier|rugby)|foot|nba|nfl|ufc|f1|motors?v|tennis|trace sport|olympia|sport en france|premier sports|team ?tv|ol tv)|\\b(?:foot|football|rugby|tennis|golf|racing|fight)\\b"),
        "Info" to Rx("^(?:bfm ?(?:tv|business)?|c ?news|europe ?1|la chaine meteo|b ?smart|rt$|lci|france ?info|franceinfo|france ?24|euronews|i24|lcp|public senat|tv5 ?monde info|rt france|africanews|bloomberg|cnn|bbc (?:world )?news|sky news|al jazeera|monaco info)(?:\\s|$)|\\b(?:news|info|infos)$"),
        "Jeunesse" to Rx("^(?:disney|nickelodeon|nick|gulli|tiji|piwi|canal j|boomerang|cartoon|cartoonito|boing|teletoon|mangas|j ?one|game ?one|mgg|nolife|baby ?tv|duck ?tv|pitchoun|toonami|kids|mon nickelodeon)|\\b(?:kids|junior|jr|jeunesse|enfants?|toons?)\\b"),
        "Cinéma" to Rx("^(?:cine ?plus|ocs|tcm|paramount|action|canal plus (?:cinemas?|box office|grand ecran|premier|decale)|tf1 series films|drive in|dreamsee|altice studio|film|movies?)|\\b(?:cinemas?|cine|movies?|films?)\\b"),
        "Séries" to Rx("^(?:13 ?e?(?:me)? ?rue|syfy|warner|polar ?plus|comedie ?plus|novelas|crime district|serie club|ab ?1|rtl ?9|teva|canal plus series|elle girl|e ?!|comedy central|mtv|abxplore|tv breizh)|\\bseries?\\b"),
        "Découverte" to Rx("^(?:planete|ushuaia|histoire|toute l ?histoire|national geographic|nat ?geo|discovery|animaux|science|trek|chasse|seasons|rmc decouverte|museum|ultra nature|love nature|canal plus docs|culturebox|crime ?\\+? ?investigation|investigation discovery|explore)|\\b(?:docs?|documentaires?|decouverte|nature|histoire|voyage)\\b"),
        "Musique" to Rx("^(?:mcm|nrj hits|trace|m6 music|melody|mezzo|rfm|stingray|mtv (?:hits|live)|clubbing|bet|cstar hits|europe 2|djazz|brava)|\\b(?:music|musique|hits|radio)\\b"),
        "Généralistes" to Rx("^(?:tf1|france ?[2-5]|m6|arte|c8|w9|tmc|tfx|nrj ?12|c ?star|ab ?3|6 ?ter|rmc story|rmc life|cherie 25|paris premiere|canal plus|c ?plus|t18|novo ?19|l ?equipe|gulli|france ?3 .+|tv5 ?monde|kto|rtl|lci)(?:\\s|$)")
    )

    private val groupRules = listOf(
        "Sport" to Rx("\\bsports?\\b|foot|ligue|match"), "Info" to Rx("\\b(?:info|infos|news|actualite)"),
        "Jeunesse" to Rx("kids|enfant|jeunesse|junior|cartoon|dessin"), "Cinéma" to Rx("cinema|cine|film|movie"),
        "Séries" to Rx("\\bseries?\\b"), "Découverte" to Rx("docu|decouverte|nature|histoire"), "Musique" to Rx("music|musique"),
        "Généralistes" to Rx("general|tnt")
    )

    val categoryOrder = listOf("Généralistes", "Info", "Sport", "Cinéma", "Séries", "Jeunesse", "Découverte", "Musique", "Autres")

    fun category(name: String, groups: List<String>): String {
        val brand = brandName(name)
        for ((label, pattern) in categories) if (pattern.test(brand)) return label
        val normalized = groups.map { normalize(it) }
        for ((label, pattern) in groupRules) if (normalized.any { pattern.test(it) }) return label
        return "Autres"
    }

    val tntNumbers = mapOf(
        "tf1" to 1, "france2" to 2, "france3" to 3, "canalplus" to 4, "france5" to 5, "m6" to 6, "arte" to 7, "c8" to 8, "w9" to 9, "tmc" to 10, "tfx" to 11, "nrj12" to 12,
        "lcp" to 13, "lcppublicsenat" to 13, "publicsenat" to 13, "france4" to 14, "bfm" to 15, "cnews" to 16, "cstar" to 17, "gulli" to 18, "tf1seriesfilms" to 20,
        "lequipe" to 21, "6ter" to 22, "rmcstory" to 23, "rmcdecouverte" to 24, "cherie25" to 25, "lci" to 26, "franceinfo" to 27, "t18" to 28, "novo19" to 29
    )

    private val frenchEnding = Regex("\\s(?:france|fr|fra|french)$", RegexOption.IGNORE_CASE)
    private val letterDigit = Regex("[A-Za-zÀ-ÿ+]\\s\\d")

    /** Nom affiché d'une chaîne réunie : l'écriture la plus soignée et la plus courante. */
    fun displayName(names: List<String>, keyDigits: String): String {
        val scores = LinkedHashMap<String, Double>()
        val seen = HashMap<String, Int>()
        for (raw in names) {
            val name = cleanName(raw)
            if (name.isEmpty()) continue
            if (name !in scores) {
                val letters = name.filter { it.isLetter() }
                var score = if (letters.isNotEmpty() && letters != letters.uppercase() && letters != letters.lowercase()) 3.0 else if (letters == letters.uppercase()) 1.0 else 0.0
                if (frenchEnding.containsMatchIn(name)) score -= 2
                if (name.filter { it.isDigit() } != keyDigits) score -= 2
                if (letterDigit.containsMatchIn(name)) score += 0.5
                scores[name] = score - name.length / 60.0
                seen[name] = 0
            }
            seen[name] = (seen[name] ?: 0) + 1
            if ((seen[name] ?: 0) <= 3) scores[name] = (scores[name] ?: 0.0) + 0.3
        }
        return scores.maxByOrNull { it.value }?.key ?: names.firstOrNull() ?: ""
    }
}
