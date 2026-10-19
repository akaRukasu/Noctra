/* Noctra 200.0.128 — « Toutes les chaînes », comme sur Noctra TV.
   Les chaînes de toutes les sources sont réunies (une carte par chaîne :
   noms, pays, catégories et numéros TNT de la version TV), et les serveurs
   d'une chaîne sont testés puis classés comme sur la TV : fiabilité passée,
   type de lecteur, test « en ligne » et rapidité de réponse.
   Les règles de noms, de pays, de catégories et de regroupement sont reprises
   telles quelles de apps/androidtv/web/app.js (branche Noctra TV).
   Aucun lien de flux n'est mémorisé : seuls des noms de serveurs et des
   compteurs de réussite restent dans ce navigateur. */
(function () {
  'use strict';
  var TV_DATA = window.NOCTRA_TV_DATA || null;

  var LOGO_BASE = 'https://cdn.jsdelivr.net/gh/tv-logo/tv-logos@main/countries/france/';
  var logoIndex = null;
  // Clé de logo : « canal-plus-sport-360 » → même clé que « Canal+ Sport 360 HD ».
  function logoIndexGet() {
    if (logoIndex) return logoIndex;
    logoIndex = {};
    var files = String((typeof TV_DATA !== 'undefined' && TV_DATA && TV_DATA.logos) || '').split(' ');
    files.forEach(function (file) {
      if (!file) return;
      var key = unifiedName(file.replace(/^hd\//, '').replace(/-french$/, '').replace(/-/g, ' '));
      if (key && !logoIndex[key]) logoIndex[key] = file + '-fr.png';
    });
    // Écritures courantes absentes des noms de fichiers.
    var aliases = { disneyjunior: 'disneyjr', nickelodeonjr: 'nickelodeonjunior', canalplusf1: 'canalplusformula1', automoto: 'automotolachaine',
      europe2: 'europe2pop', teletoon: 'teletoonplus', piwi: 'piwiplus', infosport: 'infosportplus', meteo: 'lachainemeteo' };
    Object.keys(aliases).forEach(function (key) { if (!logoIndex[key] && logoIndex[aliases[key]]) logoIndex[key] = logoIndex[aliases[key]]; });
    return logoIndex;
  }
  // Logos iptv-org des autres chaînes françaises (tv-data.js) : adresse complète.
  var iptvLogoIndex = null;
  function iptvLogo(name) {
    if (!iptvLogoIndex) {
      iptvLogoIndex = {};
      String((typeof TV_DATA !== 'undefined' && TV_DATA && TV_DATA.iptvLogos) || '').split('|').forEach(function (item) {
        var cut = item.indexOf(' ');
        if (cut > 0) iptvLogoIndex[item.slice(0, cut)] = item.slice(cut + 1).replace(/^i:/, 'https://i.imgur.com/');
      });
    }
    var key = unifiedName(name);
    return key ? iptvLogoIndex[key] || '' : '';
  }
  function logoFile(name) {
    var index = logoIndexGet();
    var key = unifiedName(name);
    if (!key) return '';
    return index[key] || index[key + 's'] || (/s$/.test(key) ? index[key.slice(0, -1)] : '') || '';
  }
  // Nom de fichier deviné (chaîne absente de la liste) : « canal-plus-sport-360-fr.png ».
  var LOGO_SLUG_FIXES = { cnews: 'c-news', cstar: 'c-star', bfm: 'bfm-tv', bfmtv: 'bfm-tv', 'france-info': 'franceinfo', 'lequipe-21': 'lequipe',
    'lequipe-tv': 'lequipe', eurosport: 'eurosport-1', 'la-chaine-lequipe': 'lequipe', 'd8': 'c8', 'd17': 'c-star',
    'nt1': 'tfx', 'hd1': 'tf1-series-films', 'numero-23': 'rmc-story', 'cine-plus': 'cine-plus-premier', 'bein-sport': 'bein-sports' };
  function logoSlugs(name) {
    var slug = normalize(cleanChannelName(name).replace(/\+/g, ' plus ').replace(/&/g, ' and ').replace(/['’]/g, ''))
      .replace(/\b(?:hd|fhd|uhd|sd|4k|tv hd)\b/g, ' ').replace(/\s+(?:france|fr|fra)$/, '').trim().replace(/\s+/g, '-');
    if (!slug) return [];
    slug = slug.replace(/^c-plus-/, 'canal-plus-').replace(/^bein-sport-/, 'bein-sports-').replace(/-sport-(\d)/, '-sport-$1');
    var fixed = LOGO_SLUG_FIXES[slug] || slug;
    var list = [];
    // beIN Sports 1/2/3 : fichiers « -french ».
    if (/^bein-sports-\d$/.test(fixed)) list.push(fixed + '-french');
    list.push(fixed);
    return list.map(function (item) { return LOGO_BASE + item + '-fr.png'; });
  }
  // ── Pays des chaînes ──
  var COUNTRY_CODES = { fr: 'fr', fra: 'fr', uk: 'uk', gb: 'uk', en: 'uk', us: 'us', usa: 'us', de: 'de', ger: 'de', es: 'es', spa: 'es', esp: 'es', it: 'it', ita: 'it',
    pt: 'pt', por: 'pt', br: 'br', ar: 'arab', ara: 'arab', nl: 'nl', be: 'be', ch: 'ch', ca: 'ca', au: 'au', tr: 'tr', pl: 'pl', ro: 'ro', ru: 'ru', mx: 'mx',
    gr: 'gr', se: 'se', dk: 'dk', no: 'no', fi: 'fi', hu: 'hu', cz: 'cz', sk: 'sk', rs: 'rs', hr: 'hr', al: 'al', bg: 'bg', ua: 'ua', il: 'il', in: 'in', pk: 'pk',
    za: 'za', ie: 'ie', at: 'at', lat: 'latam', latam: 'latam', ma: 'ma', dz: 'dz', tn: 'tn', qa: 'arab', sa: 'arab', ae: 'arab', eg: 'arab' };
  var COUNTRY_WORDS = { france: 'fr', french: 'fr', francais: 'fr', francaise: 'fr', 'united kingdom': 'uk', england: 'uk', britain: 'uk', usa: 'us', america: 'us',
    germany: 'de', deutschland: 'de', allemagne: 'de', spain: 'es', espana: 'es', espagne: 'es', italy: 'it', italia: 'it', italie: 'it', portugal: 'pt',
    brazil: 'br', brasil: 'br', bresil: 'br', arabic: 'arab', arab: 'arab', arabia: 'arab', mena: 'arab', netherlands: 'nl', holland: 'nl', belgium: 'be', belgique: 'be',
    switzerland: 'ch', suisse: 'ch', canada: 'ca', quebec: 'ca', australia: 'au', turkey: 'tr', turkiye: 'tr', poland: 'pl', polska: 'pl', romania: 'ro', russia: 'ru',
    mexico: 'mx', latino: 'latam', greece: 'gr', sweden: 'se', denmark: 'dk', norway: 'no', finland: 'fi', india: 'in', pakistan: 'pk', ireland: 'ie', austria: 'at',
    maroc: 'ma', morocco: 'ma', algerie: 'dz', algeria: 'dz', tunisie: 'tn', tunisia: 'tn', africa: 'afrique', afrique: 'afrique' };
  var COUNTRY_LABELS = { fr: 'France', uk: 'Royaume-Uni', us: 'États-Unis', de: 'Allemagne', es: 'Espagne', it: 'Italie', pt: 'Portugal', br: 'Brésil', arab: 'Monde arabe',
    nl: 'Pays-Bas', be: 'Belgique', ch: 'Suisse', ca: 'Canada', au: 'Australie', tr: 'Turquie', pl: 'Pologne', ro: 'Roumanie', ru: 'Russie', mx: 'Mexique', latam: 'Amérique latine',
    gr: 'Grèce', se: 'Suède', in: 'Inde', pk: 'Pakistan', ie: 'Irlande', at: 'Autriche', ma: 'Maroc', dz: 'Algérie', tn: 'Tunisie', za: 'Afrique du Sud',
    afrique: 'Afrique francophone', lu: 'Luxembourg', mc: 'Monaco', ht: 'Haïti' };
  // Chaînes françaises connues (reconnues même sans indication de pays).
  // 200.0.129 (client web) : beIN Sports 1 à 3, beIN Sports MAX 4 à 10 et Ligue 1+ (offre française).
  var FRENCH_BRANDS = /^(?:bein ?sports? (?:max ?)?(?:[1-9]|10)$|ligue ?1|tf1|tfx|tmc|france ?[2345]|france ?info|franceinfo|france ?24|m6|6ter|w9|arte|c8|cstar|nrj ?12|lcp|public senat|bfm|cnews|lci|gulli|l ?equipe|bfm ?tv|13 ?e?(?:me)? ?rue|ab ?[13]|rtl ?9|nrj ?hits|trace|rmc|cherie 25|canal ?plus|c ?plus|ocs|cine ?plus|paris premiere|teva|m6 music|mcm|game ?one|tiji|piwi|planete ?plus|ushuaia|histoire tv|toute l ?histoire|seasons|chasse ?(?:et|&) ?peche|equidia|infosport|tv5 ?monde|tv ?breizh|serie ?club|13e ?rue|comedie ?plus|polar ?plus|action ?(?:tv)?$|novelas|mangas|j ?one|automoto|kto|i24|b ?smart|bfm ?business|la chaine meteo|eurosport ?[12]? ?france|bein sports? .*france|rmc sport|dazn france|l ?equipe ?tv|olympia|melody|m6 boutique|tf1 series films|franceinfo tv|lcp an|t18|novo19|w ?9|6 ?ter)(?:\s|$)/;
  // Chaînes étrangères souvent rangées parmi les françaises (liste à la main,
  // prioritaire sur tout le reste : Africa 24 est enregistrée « FR » chez iptv-org).
  var FOREIGN_BRANDS = [
    [/^(?:al ?jazeera|al ?arabiya|al ?hadath|sky news arabia|mbc|rotana|dubai|abu dhabi|sharjah|al ?mayadeen|al ?manar|nile|france ?24 arab|bein sports? (?:arabia|mena|news))(?:\s|$)/, 'arab'],
    [/^(?:2m|al ?aoula|arryadia|medi ?1 ?tv|tamazight|assadissa)(?:\s|$)/, 'ma'],
    [/^(?:canal algerie|echorouk|ennahar|el ?bilad|beur ?tv|samira)(?:\s|$)/, 'dz'],
    [/^(?:watania|nessma|hannibal|el ?hiwar|attessia)(?:\s|$)/, 'tn'],
    [/^(?:la une|tipik|la trois|rtl ?tvi|club rtl|plug rtl|ln ?24|bx ?1|rtbf)(?:\s|$)/, 'be'],
    [/^(?:rts ?(?:un|deux|1 suisse)|leman bleu|la tele suisse)(?:\s|$)/, 'ch'],
    [/^(?:tva|tele ?quebec|noovo|lcn|rdi|ici (?:tele|rdi|artv|radio canada)|radio canada|rds|tva sports|canal vie|canal d|series ?plus|super ecran|vrak|yoopa|historia|evasion|unis)(?:\s|$)/, 'ca'],
    [/^(?:africa ?24|africable|a ?plus ?ivoire|trace africa|nollywood|rti ?[12]?|rts ?[12]?(?: senegal)?|ortm|crtv|ortb|rtnc|rtb|canal ?2 ?international|equinoxe|novelas tv afrique|canal plus afrique|life tv|nci|tele congo|rtg|tfm|2stv|sen ?tv|walf|vox africa|love world|kalac|bblack africa)(?:\s|$)/, 'afrique']
  ];
  var foreignIndex = null;
  function foreignCountry(name) {
    var raw = String(name || '');
    // Écriture arabe dans le nom.
    if (/[؀-ۿ]/.test(raw)) return 'arab';
    var brand = brandName(raw);
    for (var i = 0; i < FOREIGN_BRANDS.length; i++) if (FOREIGN_BRANDS[i][0].test(brand)) return FOREIGN_BRANDS[i][1];
    // Chaînes francophones hors de France (tv-data.js, d'après iptv-org).
    if (!foreignIndex) {
      foreignIndex = {};
      var data = (typeof TV_DATA !== 'undefined' && TV_DATA && TV_DATA.foreign) || {};
      Object.keys(data).forEach(function (country) { data[country].split(' ').forEach(function (key) { if (key) foreignIndex[key] = country; }); });
    }
    return foreignIndex[unifiedName(raw)] || '';
  }
  function countryOfCode(value) {
    var code = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
    return COUNTRY_CODES[code] || COUNTRY_WORDS[code] || '';
  }
  function countryOfWords(value) {
    var text = normalize(value);
    if (!text) return '';
    var words = text.split(' ');
    for (var i = 0; i < words.length; i++) {
      if (COUNTRY_WORDS[words[i]]) return COUNTRY_WORDS[words[i]];
      if (i < words.length - 1 && COUNTRY_WORDS[words[i] + ' ' + words[i + 1]]) return COUNTRY_WORDS[words[i] + ' ' + words[i + 1]];
    }
    return '';
  }
  // Pays : champ du fournisseur, « FR: », « [UK] », « … DE », « … France »,
  // identifiant du guide (« TF1.fr »), groupe, langue ; sinon source française.
  // Pays d'une chaîne : calculé une fois par chaîne (règles coûteuses sur un petit processeur).
  function channelCountry(channel) {
    if (channel._cc === undefined) channel._cc = computeCountry(channel);
    return channel._cc;
  }
  function computeCountry(channel) {
    // Pays du référentiel iptv-org (ajouté par le serveur) : le plus fiable.
    var name = String(channel.name || '');
    // Chaînes francophones d'autres pays (Afrique, Belgique, Québec…) et chaînes
    // arabes, souvent rangées dans les listes « FR » des sources.
    var found = foreignCountry(name);
    if (found) return found;
    // 200.0.131 (client web) : le pays iptv-org est deviné par le serveur
    // d'après le nom (« beIN Sports 1 » existe aussi au Qatar) : il passe après
    // les indications explicites (pays de la source, drapeau, « FR: », « … UK »)
    // et après les marques françaises connues. Avant, une même chaîne pouvait
    // être française dans une source et étrangère dans une autre : elle n'était
    // plus réunie, et ses serveurs « étrangers » disparaissaient.
    found = countryOfCode(channel.country) || countryOfWords(channel.country);
    if (found) return found;
    // Drapeau (🇫🇷, 🇬🇧…) dans le nom.
    var flag = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])/.exec(name);
    if (flag) {
      found = countryOfCode(String.fromCharCode(97 + flag[1].charCodeAt(0) - 0xDDE6, 97 + flag[2].charCodeAt(0) - 0xDDE6));
      if (found) return found;
    }
    var prefix = leadingCode(name);
    if (prefix) return prefix.country;
    var suffix = /[\s(\[|\-]([A-Z]{2,3})[)\]]?\s*$/.exec(name);
    if (suffix) { found = countryOfCode(suffix[1]); if (found) return found; }
    var words = normalize(name).split(' ');
    var last = words[words.length - 1];
    if (words.length > 1 && COUNTRY_WORDS[last]) return COUNTRY_WORDS[last];
    if (FRENCH_BRANDS.test(brandName(name))) return 'fr';
    found = countryOfCode(channel.iptvOrgCountry);
    if (found) return found;
    var id = /\.([a-z]{2})(?:@|$)/i.exec(String(channel.iptvOrgId || channel.epgId || ''));
    if (id) { found = countryOfCode(id[1]); if (found) return found; }
    var group = String(channel.group || '');
    var groupFlag = /\uD83C([\uDDE6-\uDDFF])\uD83C([\uDDE6-\uDDFF])/.exec(group);
    if (groupFlag) {
      found = countryOfCode(String.fromCharCode(97 + groupFlag[1].charCodeAt(0) - 0xDDE6, 97 + groupFlag[2].charCodeAt(0) - 0xDDE6));
      if (found) return found;
    }
    var groupCode = /(?:^|[^A-Za-z])([A-Z]{2,3})(?:[^A-Za-z]|$)/.exec(group);
    found = countryOfWords(group) || (groupCode ? countryOfCode(groupCode[1]) : '');
    if (found) return found;
    if (/^(?:fr|fra|fre|french|francais|français)$/i.test(String(channel.language || '').trim())) return 'fr';
    if (FRENCH_BRANDS.test(brandName(name))) return 'fr';
    return '';
  }
  // Code pays en tête du nom : « FR: », « FR| », « [FR] », « (UK) », « FR - », « FR TF1 »…
  function leadingCode(name) {
    // Pays en toutes lettres : « FRANCE: TF1 », « France | TF1 ».
    var word = /^\s*[\[(|]?\s*([A-Za-z]{4,12})\s*[\])|]?\s*[:|\-–]\s*/.exec(String(name || ''));
    if (word && COUNTRY_WORDS[word[1].toLowerCase()]) return { country: COUNTRY_WORDS[word[1].toLowerCase()], length: word[0].length };
    var match = /^\s*[\[(|]?\s*([A-Za-z]{2,3})\s*[\])|]?\s*([^\w\sÀ-ɏ]+|\s)\s*/.exec(String(name || ''));
    if (!match) return null;
    var code = match[1];
    var country = countryOfCode(code);
    // Séparé par une simple espace : code en majuscules seulement (« FR TF1 », pas « RMC Sport »).
    if (!country || (/^\s$/.test(match[2]) && code !== code.toUpperCase())) return null;
    return { country: country, length: match[0].length };
  }
  // « FR: TF1 HD », « [FR] TF1 (backup) », « FR| TF1 ᴴᴰ 🇫🇷 » → « TF1 ».
  // Règles de noms appelées des milliers de fois à chaque chargement : résultats gardés.
  function remembered(fn) {
    var store = {};
    var size = 0;
    return function (value) {
      var key = String(value === undefined || value === null ? '' : value);
      if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
      if (++size > 40000) { store = {}; size = 1; }
      return (store[key] = fn(key));
    };
  }
  var cleanChannelName = remembered(function (name) {
    var raw = String(name || '')
      .replace(/\uD83C[\uDDE6-\uDDFF]/g, ' ')
      .replace(/[ʰ-˿ᴀ-ᶿ⁰-₟℀-⅏]/g, ' ')
      .replace(/[─-◿☀-➿]/g, ' ');
    // Lettres « stylisées » (𝗧𝗙𝟭, ＴＦ１…) ramenées aux lettres ordinaires.
    try { raw = raw.normalize('NFKC'); } catch (error) { /* moteur ancien */ }
    raw = raw.trim();
    var lead = leadingCode(raw);
    if (lead) raw = raw.slice(lead.length);
    var clean = raw
      .replace(/^\s*(?:\[[^\]]*\]|\([^)]*\))\s*/, '')
      .replace(/^\s*(?:VIP|4K|HD|FHD)\s*[:|\-–]\s*/i, '')
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      // Numéro de lien : « BACKUP 2 », « Lien 3 », « BEIN SPORTS 1 · 2 », « … #2 ».
      .replace(/\b(?:backup|secours|alt|link|lien|source|server|serveur|mirror|option)\s*\d{1,2}\b/gi, ' ')
      .replace(/(\d)\s*(?:[·|•#–]|\s-)\s*\d{1,2}\s*$/, '$1')
      .replace(/\s#\d{1,2}\s*$/, ' ')
      .replace(/\b(?:UHD|FHD|FULL ?HD|HD|SD|4K|HEVC|H\.?265|1080[pi]?|720p|50 ?fps|backup|secours|raw|vip|multi ?audio)\b/gi, ' ')
      // Variantes LiveWatch : « TF1 · BASIC », « beIN SPORTS 1 · SAT · HD », « … · Flux 2 ».
      .replace(/(?:\s*·\s*(?:[A-Z0-9][A-Z0-9 +]{0,17}|Flux\s*\d+|Serveur\s*\d+|Variante\s+\S+)?)+\s*$/, '')
      .replace(/[|•·▎┃]+/g, ' ')
      // « CANAL + SPORT » = « Canal+ Sport » (le « + » détaché des marques connues).
      .replace(/(^|\s)(canal|c|cin[eé]|plan[eè]te|golf|piwi|teletoon|polar|com[eé]die|infosport|ligue 1)\s+\+(?=\s|$)/gi, '$1$2+')
      .replace(/(^|\s)\++(?=\s|$)/g, ' ')
      // Variantes d'une même chaîne dans certaines listes : « BEIN SPORTS 1 .b », « .c », « .s »…
      .replace(/\s+\.[A-Za-z0-9]{1,3}(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
    return clean || String(name || '').trim();
  });
  var brandName = remembered(function (name) {
    return normalize(cleanChannelName(name).replace(/\+/g, ' plus ')).replace(/\s+(?:france|fr|fra)$/, '').trim();
  });
  // Nom de rapprochement, tolérant aux écritures des sources :
  // « beIN Sport 1 » = « BEIN SPORTS 1 » = « beIN Sports 1 France »,
  // « BFM TV » = « BFMTV », « 13ème Rue » = « 13e rue », « C+ Sport » = « Canal+ Sport ».
  // Mots sans importance pour reconnaître une chaîne (qualité, variante, lien…).
  var NOISE_WORDS = { channel: 1, live: 1, direct: 1, officiel: 1, official: 1, hq: 1, lq: 1, h264: 1, h265: 1, x264: 1, x265: 1, fps: 1, '60fps': 1, '50fps': 1,
    '1080': 1, '1080p': 1, '720': 1, '720p': 1, '2160p': 1, premium: 1, multi: 1, audio: 1, vf: 1, vff: 1, vostfr: 1, stream: 1, server: 1, serveur: 1, source: 1,
    link: 1, lien: 1, alt: 1, backup: 1, secours: 1, mirror: 1, hevc: 1, uhd: 1, fhd: 1, hd: 1, sd: 1, '4k': 1, '8k': 1, tnt: 1 };
  // Anciens noms et écritures courantes → un seul nom.
  var NAME_ALIASES = { hd1: 'tf1seriesfilms', tf1seriefilm: 'tf1seriesfilms', nt1: 'tfx', numero23: 'rmcstory', d8: 'c8', d17: 'cstar', itele: 'cnews',
    lequipe21: 'lequipe', lequipetv: 'lequipe', franceinfotv: 'franceinfo', lcpan: 'lcp', lcpassembleenationale: 'lcp', artefrance: 'arte',
    canal: 'canalplus', canalplusfrance: 'canalplus', eurosport: 'eurosport1', beinsport: 'beinsport1', rmcsport: 'rmcsport1', tv5: 'tv5monde', france24fr: 'france24' };
  var unifiedName = remembered(function (name) {
    var words = brandName(name).replace(/^la chaine (?=l ?equipe)/, '').split(' ').filter(Boolean).map(function (word, index) {
      if (word === 'sports') return 'sport';
      if (NOISE_WORDS[word]) return '';
      // « Chasse & Pêche » = « Chasse et Pêche », « Science & Vie » = « Science and Vie ».
      if (index && (word === 'et' || word === 'and')) return '';
      return word.replace(/^(\d+)(?:eme|e|er|ere)$/, '$1');
    }).filter(Boolean);
    if (words.length > 1 && words[words.length - 1] === 'tv') words.pop();
    // Lettre de variante après un numéro (« BEIN SPORTS 1 S »).
    if (words.length > 2 && /^[a-z]$/.test(words[words.length - 1]) && /^\d+$/.test(words[words.length - 2])) words.pop();
    var key = words.join('');
    if (key.length > 4 && /tv$/.test(key) && !/^(?:tv|mtv|btv)/.test(key)) key = key.slice(0, -2);
    key = key.replace(/^cplus/, 'canalplus').replace(/^beinsports?/, 'beinsport').replace(/^bein(?=max\d|\d)/, 'beinsport');
    return NAME_ALIASES[key] || key;
  });
  // Clé de rapprochement : même nom et même pays (« DE: Eurosport 1 » n'est
  // pas la version française) ; une chaîne sans pays connu rejoint la française.
  function unifiedKey(name, country) {
    var base = unifiedName(name);
    if (country && country !== 'fr') {
      var words = normalize(cleanChannelName(name)).split(' ');
      var last = words[words.length - 1];
      if (words.length > 1 && (COUNTRY_CODES[last] || COUNTRY_WORDS[last])) base = unifiedName(words.slice(0, -1).join(' '));
      return country + ':' + base;
    }
    return base;
  }
  // 200.0.129 (client web) : toute chaîne que le lecteur sait ouvrir, même
  // quand son flux direct n'est pas marqué « stream » par la source.
  function playable(channel) {
    return Boolean(channel.streamUrl || channel.resolverUrl || channel.embedUrl || channel.externalUrl || channel.vipFallbackUrl);
  }
  // Événements (matchs du jour) : pas des chaînes. Les catalogues de chaînes
  // (LiveWatch, NorthTV, FrameTV, Daddy TV…) donnent parfois une date ou un
  // identifiant à leurs chaînes : seules les sources sport sont jugées sur ces
  // champs, les autres seulement sur un vrai match (« A vs B »).
  function isEvent(channel, source) {
    var match = Boolean(channel.homeName && channel.awayName) || /\s(?:vs\.?|v\.?|contre)\s/i.test(channel.name);
    if (source && source.section && source.section !== 'sports') return match;
    return Boolean(match || channel.eventId || channel.startTime || /\s[x×]\s/i.test(channel.name) || /\b\d{1,2}[:h]\d{2}\b/.test(channel.name));
  }
  // Identité iptv-org (« BeINSports1.fr ») : même chaîne quel que soit son nom.
  function iptvKey(channel) {
    var id = String(channel.iptvOrgId || '').toLowerCase().replace(/@.*$/, '').trim();
    return id ? 'id:' + id : '';
  }
  // Chaînes françaises : numéros habituels de la TNT (1 TF1, 2 France 2…
  // 27 franceinfo), puis 30, 31… pour les autres ; ailleurs 1, 2, 3… Les
  // numéros ne changent pas avec la catégorie ou la recherche, et les touches
  // chiffrées de la télécommande les utilisent pendant la lecture.
  var TNT_NUMBERS = { tf1: 1, france2: 2, france3: 3, canalplus: 4, france5: 5, m6: 6, arte: 7, c8: 8, w9: 9, tmc: 10, tfx: 11, nrj12: 12,
    lcp: 13, lcppublicsenat: 13, publicsenat: 13, france4: 14, bfm: 15, cnews: 16, cstar: 17, gulli: 18, tf1seriesfilms: 20, lequipe: 21, '6ter': 22,
    rmcstory: 23, rmcdecouverte: 24, cherie25: 25, lci: 26, franceinfo: 27, t18: 28, novo19: 29 };
  function tntNumber(channel) {
    if (TNT_NUMBERS[channel._key]) return TNT_NUMBERS[channel._key];
    var entries = channel._entries || [];
    for (var i = 0; i < entries.length; i++) if (TNT_NUMBERS[entries[i].nameKey]) return TNT_NUMBERS[entries[i].nameKey];
    return TNT_NUMBERS[unifiedName(channel.name)] || 0;
  }
  function numberChannels(channels, french) {
    var list = channels.slice();
    if (french) {
      var used = {};
      list.forEach(function (channel) {
        var number = tntNumber(channel);
        channel._lcn = number && !used[number] ? number : 0;
        if (channel._lcn) used[number] = true;
      });
      list.sort(function (a, b) { return (a._lcn || 1000) - (b._lcn || 1000); });
      var next = 30;
      list.forEach(function (channel) { if (!channel._lcn) channel._lcn = next++; });
    } else {
      list.forEach(function (channel, index) { channel._lcn = index + 1; });
    }
    return list;
  }
  // ── Catégories de « TV en direct » ──
  // Les catégories des sources (« FR| FRANCE TV », « Haloule section 1.1 »…)
  // sont remplacées par quelques catégories claires, d'après le nom de la
  // chaîne, puis ses catégories dans les sources.
  var CATEGORIES = [
    ['Sport', /\bsports?\b|^(?:bein|rmc sport|eurosport|l ?equipe|dazn|ligue 1|golf|infosport|equidia|automoto|multisports|canal plus (?:foot|ligue|top|moto|formula|f1|premier|rugby)|foot|nba|nfl|ufc|f1|motors?v|tennis|trace sport|olympia|sport en france|premier sports|team ?tv|ol tv)|\b(?:foot|football|rugby|tennis|golf|racing|fight)\b/],
    ['Info', /^(?:bfm ?(?:tv|business)?|c ?news|europe ?1|la chaine meteo|b ?smart|rt$|lci|france ?info|franceinfo|france ?24|euronews|i24|lcp|public senat|tv5 ?monde info|rt france|africanews|bloomberg|cnn|bbc (?:world )?news|sky news|al jazeera|monaco info)(?:\s|$)|\b(?:news|info|infos)$/],
    ['Jeunesse', /^(?:disney|nickelodeon|nick|gulli|tiji|piwi|canal j|boomerang|cartoon|cartoonito|boing|teletoon|mangas|j ?one|game ?one|mgg|nolife|baby ?tv|duck ?tv|pitchoun|toonami|kids|mon nickelodeon)|\b(?:kids|junior|jr|jeunesse|enfants?|toons?)\b/],
    ['Cinéma', /^(?:cine ?plus|ocs|tcm|paramount|action|canal plus (?:cinemas?|box office|grand ecran|premier|decale)|tf1 series films|drive in|dreamsee|altice studio|film|movies?)|\b(?:cinemas?|cine|movies?|films?)\b/],
    ['Séries', /^(?:13 ?e?(?:me)? ?rue|syfy|warner|polar ?plus|comedie ?plus|novelas|crime district|serie club|ab ?1|rtl ?9|teva|canal plus series|elle girl|e ?!|comedy central|mtv|abxplore|tv breizh)|\bseries?\b/],
    ['Découverte', /^(?:planete|ushuaia|histoire|toute l ?histoire|national geographic|nat ?geo|discovery|animaux|science|trek|chasse|seasons|rmc decouverte|museum|ultra nature|love nature|canal plus docs|culturebox|crime ?\+? ?investigation|investigation discovery|explore)|\b(?:docs?|documentaires?|decouverte|nature|histoire|voyage)\b/],
    ['Musique', /^(?:mcm|nrj hits|trace|m6 music|melody|mezzo|rfm|stingray|mtv (?:hits|live)|clubbing|bet|cstar hits|europe 2|djazz|brava)|\b(?:music|musique|hits|radio)\b/],
    ['Généralistes', /^(?:tf1|france ?[2-5]|m6|arte|c8|w9|tmc|tfx|nrj ?12|c ?star|ab ?3|6 ?ter|rmc story|rmc life|cherie 25|paris premiere|canal plus|c ?plus|t18|novo ?19|l ?equipe|gulli|france ?3 .+|tv5 ?monde|kto|rtl|lci)(?:\s|$)/]
  ];
  var CATEGORY_ORDER = ['Généralistes', 'Info', 'Sport', 'Cinéma', 'Séries', 'Jeunesse', 'Découverte', 'Musique', 'Autres'];
  function channelCategory(channel) {
    var name = brandName(channel.iptvOrgName || channel.name);
    var i;
    for (i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][1].test(name)) return CATEGORIES[i][0];
    // Catégories des sources (« Sport FR », « Cinéma », « Kids »…).
    var groups = Object.keys(channel._groups || {}).concat(channel.group ? [channel.group] : []).map(normalize);
    var rules = [['Sport', /\bsports?\b|foot|ligue|match/], ['Info', /\b(?:info|infos|news|actualite)/], ['Jeunesse', /kids|enfant|jeunesse|junior|cartoon|dessin/],
      ['Cinéma', /cinema|cine|film|movie/], ['Séries', /\bseries?\b/], ['Découverte', /docu|decouverte|nature|histoire/], ['Musique', /music|musique/],
      ['Généralistes', /general|tnt/]];
    for (i = 0; i < rules.length; i++) {
      for (var g = 0; g < groups.length; g++) if (rules[i][1].test(groups[g])) return rules[i][0];
    }
    return 'Autres';
  }
  // Deux mots égaux à une lettre près (ajoutée, retirée, remplacée ou inversée).
  function oneEdit(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0;
    while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++;
    if (a.length === b.length) {
      // Remplacée, ou deux lettres inversées (« premeir »).
      return a.slice(i + 1) === b.slice(i + 1) || (a.charAt(i) === b.charAt(i + 1) && a.charAt(i + 1) === b.charAt(i) && a.slice(i + 2) === b.slice(i + 2));
    }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  // Chaîne réunie « unified » ajoutée à « twin » (sources, catégories, logo, guide).
  function absorb(twin, unified) {
    unified._entries.forEach(function (entry) { twin._entries.push(entry); });
    Object.keys(unified._groups).forEach(function (group) { twin._groups[group] = (twin._groups[group] || 0) + unified._groups[group]; });
    if (!twin.logo) twin.logo = unified.logo;
    if (!twin.iptvOrgId && unified.iptvOrgId) twin.iptvOrgId = unified.iptvOrgId;
    if (!twin.epgId && unified.epgId) twin.epgId = unified.epgId;
    if (!twin.now && unified.now) { twin.now = unified.now; twin.next = unified.next; }
    if (!twin.country) twin.country = unified.country;
    if (unified.isLive) twin.isLive = true;
  }
  function mergeChannels(loaded) {
    var byKey = {};
    var list = [];
    // 1. Liens nom ↔ identité iptv-org : les variantes de nom d'une même chaîne
    //    identifiée se rejoignent (ex. « BEIN SPORTS 1 .b » et « beIN Sports 1 France »).
    var parent = {};
    function root(key) {
      while (parent[key] && parent[key] !== key) key = parent[key] = parent[parent[key]] || parent[key];
      return key;
    }
    function union(a, b) {
      var ra = root(a), rb = root(b);
      if (!parent[ra]) parent[ra] = ra;
      if (!parent[rb]) parent[rb] = rb;
      if (ra !== rb) parent[rb] = ra;
    }
    var prepared = [];
    loaded.forEach(function (part) {
      part.channels.forEach(function (channel) {
        if (!channel || !channel.name || !playable(channel) || isEvent(channel, part.source)) return;
        var country = channelCountry(channel);
        var nameKey = unifiedKey(channel.name, country) || normalize(channel.name);
        var idKey = iptvKey(channel);
        if (!parent[nameKey]) parent[nameKey] = nameKey;
        if (idKey) {
          var idCountry = countryOfCode((/\.([a-z]{2})$/.exec(idKey) || [])[1]);
          // Jamais de lien entre pays différents (la version étrangère reste à part).
          if (!idCountry || idCountry === (country || 'fr')) union(idKey, nameKey);
        }
        prepared.push({ channel: channel, source: part.source, country: country, nameKey: nameKey, part: part });
      });
    });
    prepared.forEach(function (item) {
        var channel = item.channel;
        var country = item.country;
        var key = root(item.nameKey);
        var unified = byKey[key];
        if (!unified) {
          var display = channel.iptvOrgName ? String(channel.iptvOrgName) : cleanChannelName(channel.name);
          if (country && country.length === 2 && country !== 'fr' && !countryOfWords(display) && !/\s[A-Z]{2,3}$/.test(display)) display += ' ' + country.toUpperCase();
          unified = byKey[key] = { name: display, logo: channel.logo || '', group: '', _groups: {}, _entries: [], _key: key, country: country };
          list.push(unified);
        }
        if (!unified.country && country) unified.country = country;
        // Nom affiché : l'écriture la plus soignée (« beIN Sports 1 » plutôt que « BEIN SPORTS 1 »).
        var candidate = cleanChannelName(channel.name);
        if (!unified._official && unified.name === unified.name.toUpperCase() && candidate !== candidate.toUpperCase() && !(country && country !== 'fr')) unified.name = candidate;
        // Nom officiel iptv-org quand une des sources en fournit un.
        if (channel.iptvOrgName && !unified._official && !(country && country !== 'fr')) { unified.name = String(channel.iptvOrgName); unified._official = true; }
        unified._entries.push({ channel: channel, source: item.source, nameKey: item.nameKey, key: item.part.key, stale: Boolean(item.part.stale) });
        if (!unified.logo && channel.logo) unified.logo = channel.logo;
        if (!unified.iptvOrgId && channel.iptvOrgId) unified.iptvOrgId = channel.iptvOrgId;
        if (!unified.epgId && channel.epgId) unified.epgId = channel.epgId;
        if (!unified.now && channel.now && channel.now.title) { unified.now = channel.now; unified.next = channel.next; }
        if (channel.isLive) unified.isLive = true;
        if (channel.group) unified._groups[channel.group] = (unified._groups[channel.group] || 0) + 1;
    });
    // Même chaîne, mots dans un autre ordre (« Sport 360 Canal+ ») : réunies aussi.
    var byWords = {};
    list = list.filter(function (unified) {
      var parts = unified._key.split(':');
      var country = parts.length > 1 ? parts[0] + ':' : '';
      // Mots triés, nombres dans leur ordre (« France 2 3 » ≠ « France 3 2 »).
      var words = brandName(unified._entries[0].channel.name).split(' ').filter(function (word) { return word && !NOISE_WORDS[word]; })
        .map(function (word) { return word === 'sports' ? 'sport' : word; });
      var tokens = words.filter(function (word) { return !/^\d+$/.test(word); }).sort().join(' ') + '|' + words.filter(function (word) { return /^\d+$/.test(word); }).join(' ');
      if (tokens === '|') return true;
      var twin = byWords[country + tokens];
      if (!twin) { byWords[country + tokens] = unified; return true; }
      absorb(twin, unified);
      return false;
    });
    // Même chaîne à une lettre près (faute de frappe d'une source :
    // « Cinéplus Premeir ») : noms d'au moins 9 lettres, mêmes numéros.
    var buckets = {};
    list = list.filter(function (unified) {
      var parts = unified._key.split(':');
      var key = parts[parts.length - 1];
      if (key.replace(/\d/g, '').length < 9) return true;
      var bucket = (parts.length > 1 ? parts[0] : '') + '|' + key.replace(/\D/g, '') + '|' + key.slice(0, 2);
      var others = buckets[bucket] = buckets[bucket] || [];
      var letters = key.replace(/\d/g, '');
      for (var i = 0; i < others.length; i++) {
        if (oneEdit(others[i].letters, letters)) { absorb(others[i].unified, unified); return false; }
      }
      others.push({ unified: unified, letters: letters });
      return true;
    });
    list.forEach(function (unified) {
      // Nom affiché (chaîne française) : l'écriture la plus soignée et la plus
      // courante des sources (« beIN SPORTS 1 » plutôt que « bein sports 1 France »).
      if (!unified._official && (!unified.country || unified.country === 'fr')) {
        var scores = {};
        var seen = {};
        var keyDigits = unified._key.replace(/\D/g, '');
        unified._entries.forEach(function (entry) {
          var name = cleanChannelName(entry.channel.name);
          if (!name) return;
          if (scores[name] === undefined) {
            var letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
            scores[name] = (letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase() ? 3 : letters === letters.toUpperCase() ? 1 : 0)
              - (/\s(?:france|fr|fra|french)$/i.test(name) ? 2 : 0)
              - (name.replace(/\D/g, '') !== keyDigits ? 2 : 0)
              + (/[A-Za-zÀ-ÿ+]\s\d/.test(name) ? 0.5 : 0) - name.length / 60;
            seen[name] = 0;
          }
          // Écriture la plus répandue : léger avantage.
          if (++seen[name] <= 3) scores[name] += 0.3;
        });
        var best = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; })[0];
        if (best) unified.name = best;
      }
      var groups = Object.keys(unified._groups);
      groups.sort(function (a, b) { return unified._groups[b] - unified._groups[a]; });
      unified.group = groups[0] || '';
      var names = [];
      unified._entries.forEach(function (entry) { if (names.indexOf(entry.source.name) < 0) names.push(entry.source.name); });
      unified._sources = names;
      unified.provider = names.length > 2 ? names.length + ' sources' : names.join(' · ');
      unified.category = channelCategory(unified);
    });
    // Ordre alphabétique (clé calculée une fois : localeCompare est très lent sur les TV).
    list.forEach(function (unified) { unified._sort = normalize(unified.name); });
    list.sort(function (a, b) { return a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0; });
    // Chaîne d'une source → sa chaîne réunie (serveurs des autres sources).
    var byName = {};
    list.forEach(function (unified) { unified._entries.forEach(function (entry) { if (entry.nameKey && !byName[entry.nameKey]) byName[entry.nameKey] = unified; }); });
    list._byName = byName;
    return list;
  }
  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // ── Logos officiels (collection tv-logo/tv-logos, logos iptv-org) ──
  function officialLogo(channel) {
    var country = channel.country;
    if (country && country !== 'fr') return '';
    var names = [channel.iptvOrgName, channel.name];
    (channel._entries || []).forEach(function (entry) { names.push(entry.channel.iptvOrgName, entry.channel.name); });
    for (var i = 0; i < names.length; i++) if (names[i]) { var file = logoFile(names[i]); if (file) return LOGO_BASE + file; }
    for (var j = 0; j < names.length; j++) if (names[j]) { var other = iptvLogo(names[j]); if (other) return other; }
    return '';
  }

  // ── Fiabilité des serveurs (mémorisée dans ce navigateur) ──
  // Réussites et échecs de chaque serveur d'une chaîne, et de chaque famille
  // (source + type de lecteur), toutes chaînes confondues. Un échec récent
  // fait passer le serveur après les autres ; un serveur fiable passe devant.
  var HEALTH_KEY = 'noctra-web-tv-health-v1';
  var HEALTH_RECENT_MS = 20 * 60000;
  var healthData = null;
  function healthStore() {
    if (healthData) return healthData;
    try { healthData = JSON.parse(localStorage.getItem(HEALTH_KEY) || '{}') || {}; } catch (error) { healthData = {}; }
    if (typeof healthData !== 'object' || Array.isArray(healthData)) healthData = {};
    return healthData;
  }
  function saveHealth() {
    var store = healthStore();
    var keys = Object.keys(store);
    if (keys.length > 600) {
      keys.sort(function (a, b) { return Math.max(store[a].o || 0, store[a].f || 0) - Math.max(store[b].o || 0, store[b].f || 0); });
      keys.slice(0, keys.length - 600).forEach(function (key) { delete store[key]; });
    }
    try { localStorage.setItem(HEALTH_KEY, JSON.stringify(store)); } catch (error) { /* stockage indisponible */ }
  }
  function healthIds(server, key) {
    return ['c|' + key + '|' + server.label, 'f|' + server.sourceId + '|' + server.kind];
  }
  function recordHealth(server, key, ok) {
    var store = healthStore();
    var now = Date.now();
    healthIds(server, key).forEach(function (id) {
      var entry = store[id] || (store[id] = { ok: 0, fail: 0 });
      if (ok) { entry.ok = Math.min(50, entry.ok + 1); entry.o = now; }
      else { entry.fail = Math.min(50, entry.fail + 1); entry.f = now; }
      if (entry.ok + entry.fail > 20) { entry.ok = Math.round(entry.ok * 0.7); entry.fail = Math.round(entry.fail * 0.7); }
    });
    saveHealth();
  }
  // Fiabilité estimée : 'good', 'recent-fail', 'unstable' ou '' (inconnue).
  function serverHealth(server, key) {
    var store = healthStore();
    var ids = healthIds(server, key);
    var now = Date.now();
    var score = 0;
    var verdict = '';
    [store[ids[0]], store[ids[1]]].forEach(function (entry, level) {
      if (!entry) return;
      var weight = level === 0 ? 1 : 0.3;
      var rate = (entry.ok + 1) / (entry.ok + entry.fail + 2);
      score += (rate - 0.5) * 2 * weight;
      var failedRecently = entry.f && now - entry.f < HEALTH_RECENT_MS && (!entry.o || entry.f > entry.o);
      if (failedRecently) score -= 2 * weight;
      if (level === 0 && failedRecently) verdict = 'recent-fail';
      else if (!verdict && level === 0 && entry.fail >= 2 && rate < 0.45) verdict = 'unstable';
      else if (!verdict && level === 0 && entry.ok >= 2 && rate >= 0.75) verdict = 'good';
    });
    return { score: score, verdict: verdict };
  }
  function healthText(server, key) {
    var store = healthStore();
    var ids = healthIds(server, key);
    var own = store[ids[0]];
    var family = store[ids[1]];
    if (own && own.ok + own.fail) return own.ok + '/' + (own.ok + own.fail) + ' réussites';
    if (family && family.ok + family.fail) return 'même source · ' + family.ok + '/' + (family.ok + family.fail);
    return 'jamais essayé';
  }
  function rememberedServer(key) {
    try { return localStorage.getItem('noctra-web-tv-server:' + key) || ''; } catch (error) { return ''; }
  }
  function rememberServer(key, label) {
    try { localStorage.setItem('noctra-web-tv-server:' + key, label); } catch (error) { /* stockage indisponible */ }
  }
  // Serveur en ligne mais lent (liste + segment) : un peu moins bien classé
  // que les rapides (0 à 2 points entre 0,8 s et 6 s), signe d'un relais chargé.
  function probePenalty(server) {
    var ms = server.probeMs || 0;
    return ms > 800 ? Math.min(2, (ms - 800) / 2600) : 0;
  }
  // Classement : dernier serveur fonctionnel, test « en ligne », fiabilité,
  // type de lecteur (direct, automatique, lecteur web), rapidité.
  function rankServers(servers, key) {
    var remembered = rememberedServer(key);
    var weight = { native: 0, resolve: 1, web: 2 };
    function score(server) {
      var health = serverHealth(server, key);
      // Page web préparée, secours manuel, secours : après les autres (comme la TV).
      var base = weight[server.kind] + (server.compatPage ? 3 : 0) + (server.manualOnly ? 4 : 0) + (server.fallback ? 0.5 : 0) - health.score
        + (server.probeState === 'up' ? -6 + probePenalty(server) : server.probeState === 'down' ? 8 : 0);
      if (remembered && server.label === remembered && health.verdict !== 'recent-fail' && server.probeState !== 'down') return base - 10;
      return base;
    }
    return servers.map(function (server, index) { return { server: server, index: index, score: score(server) }; })
      .sort(function (a, b) { return a.score - b.score || a.index - b.index; })
      .map(function (entry) { return entry.server; });
  }

  // ── Test d'un serveur, comme le ferait le lecteur ──
  // Liste de lecture, sous-liste de qualité puis dernier segment (en-têtes
  // seulement). Flux continu (MPEG-TS) : la réponse suffit. Résultat : 'up',
  // 'down' ou '' (non testable ou trop lent : inconnu, jamais compté comme
  // un échec). Seuls les flux relayés par le serveur Noctra sont testés.
  var PROBE_MS = 9000;
  function probeStream(address, signal) {
    var url;
    try { url = new URL(address, location.href); } catch (error) { return Promise.resolve(''); }
    if (url.origin !== location.origin) return Promise.resolve('');
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, PROBE_MS);
    var stop = function () { if (controller) controller.abort(); };
    if (signal) signal.addEventListener('abort', stop, { once: true });
    function get(target) {
      return fetch(target, { credentials: 'same-origin', cache: 'no-store', signal: controller ? controller.signal : undefined });
    }
    function playlist(target, depth) {
      return get(target).then(function (response) {
        if (!response.ok) return 'down';
        var type = String(response.headers.get('content-type') || '').toLowerCase();
        if (!/mpegurl|text|json/.test(type)) return 'up';
        return response.text().then(function (text) {
          if (!/^\s*#EXTM3U/.test(text)) return 'down';
          var uris = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line && line.charAt(0) !== '#'; });
          if (!uris.length) return 'down';
          var base = response.url || target;
          if (/#EXT-X-STREAM-INF/.test(text)) {
            if (depth >= 2) return 'up';
            return playlist(new URL(uris[0], base).toString(), depth + 1);
          }
          var segment = new URL(uris[uris.length - 1], base);
          if (segment.origin !== location.origin) return 'up';
          return get(segment.toString()).then(function (answer) { return answer.ok ? 'up' : 'down'; });
        });
      });
    }
    return playlist(url.toString(), 0).then(function (result) { return result; }, function () { return timedOut || (signal && signal.aborted) ? '' : 'down'; })
      .then(function (result) {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', stop);
        stop();
        return result;
      });
  }

  // Chaîne affichée « TV en direct » : une source peut contenir des matchs
  // (événements) : ils restent dans leur source, pas dans les chaînes réunies.
  function keepChannel(channel, source) {
    return Boolean(channel && channel.name && playable(channel) && !isEvent(channel, source));
  }

  window.NoctraTvUnified = {
    version: '200.0.131',
    normalize: normalize,
    cleanChannelName: cleanChannelName,
    unifiedName: unifiedName,
    unifiedKey: unifiedKey,
    channelCountry: channelCountry,
    channelCategory: channelCategory,
    isEvent: isEvent,
    playable: playable,
    keepChannel: keepChannel,
    mergeChannels: mergeChannels,
    numberChannels: numberChannels,
    officialLogo: officialLogo,
    countryLabel: function (code) { return code === '?' || !code ? 'Pays non indiqué' : COUNTRY_LABELS[code] || String(code).toUpperCase(); },
    CATEGORY_ORDER: CATEGORY_ORDER.slice(),
    recordHealth: recordHealth,
    serverHealth: serverHealth,
    healthText: healthText,
    rememberedServer: rememberedServer,
    rememberServer: rememberServer,
    rankServers: rankServers,
    probeStream: probeStream
  };
})();
