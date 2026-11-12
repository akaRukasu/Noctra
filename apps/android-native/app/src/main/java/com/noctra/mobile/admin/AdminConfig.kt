package com.noctra.mobile.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.noctra.mobile.core.JsonMap
import com.noctra.mobile.core.Session
import com.noctra.mobile.core.asMap
import com.noctra.mobile.ui.Theme
import kotlinx.coroutines.launch

/** Champ d'un formulaire de réglages du serveur. */
class ConfigField(val key: String, val label: String, val kind: Kind = Kind.Toggle) {
    sealed interface Kind {
        data object Toggle : Kind
        data class Number(val suffix: String) : Kind
        data object Decimal : Kind
        data object Text : Kind
        data object TextArea : Kind
        data class Choice(val options: List<Pair<String, String>>) : Kind
        data object ReadOnly : Kind
    }
}

class ConfigSection(val title: String, val fields: List<ConfigField>, val footer: String? = null)

/** Réglages lus puis renvoyés en entier au serveur (seules les rubriques présentes dans sa version sont affichées). */
@Composable
fun ConfigFormScreen(title: String, path: String, sections: List<ConfigSection>, warning: String? = null) {
    val scope = rememberCoroutineScope()
    var config by remember { mutableStateOf<JsonMap>(emptyMap()) }
    var loaded by remember { mutableStateOf(false) }
    var dirty by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var note by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf(false) }
    LaunchedEffect(path) {
        runCatching { jellyfin(path).asMap() }.getOrNull()?.let { config = it }
        loaded = true
    }
    fun set(key: String, value: Any?) { config = config + (key to value); dirty = true }
    fun save() {
        saving = true
        scope.launch {
            try {
                Session.data("POST", path, json = config)
                dirty = false
                note = "Réglages enregistrés."
            } catch (failure: Exception) {
                note = failure.message
            } finally {
                saving = false
            }
        }
    }

    AdminScaffold(title, actions = {
        SaveButton(enabled = dirty, busy = saving) { if (warning != null) confirm = true else save() }
    }) {
        if (warning != null) item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Warning, contentDescription = null, tint = Theme.orange)
                Text(warning, color = Theme.orange, fontSize = 13.sp)
            }
        }
        if (!loaded) item { LoadingLine() }
        note?.let { text -> item { NoteLine(text) } }
        for (section in sections) {
            val fields = section.fields.filter { config.containsKey(it.key) }
            if (fields.isEmpty()) continue
            section(section.title, section.footer, key = section.title) {
                fields.forEachIndexed { index, field ->
                    if (index > 0) RowDivider()
                    FieldView(field, config[field.key]) { set(field.key, it) }
                }
            }
        }
    }
    if (confirm) Confirm("Enregistrer ces réglages ?", warning, "Enregistrer", onDismiss = { confirm = false }) { save() }
}

@Composable
private fun FieldView(field: ConfigField, value: Any?, change: (Any?) -> Unit) {
    when (val kind = field.kind) {
        ConfigField.Kind.Toggle -> ToggleLine(field.label, value == true) { change(it) }
        is ConfigField.Kind.Number -> FieldLine(field.label + if (kind.suffix.isNotEmpty()) " (${kind.suffix})" else "", (value as? Number)?.toLong()?.toString() ?: "", numeric = true) { text ->
            change(text.filter { it.isDigit() || it == '-' }.toLongOrNull() ?: 0L)
        }
        ConfigField.Kind.Decimal -> FieldLine(field.label, (value as? Number)?.toString() ?: "", numeric = true) { text -> change(text.replace(',', '.').toDoubleOrNull() ?: 0.0) }
        ConfigField.Kind.Text -> FieldLine(field.label, value as? String ?: "") { change(it) }
        ConfigField.Kind.TextArea -> FieldLine(field.label, value as? String ?: "", lines = 6, mono = true) { change(it) }
        is ConfigField.Kind.Choice -> {
            // Garde l'écriture du serveur (« none » ou « None » selon sa version).
            val current = value as? String ?: ""
            val capitalized = current.firstOrNull()?.isUpperCase() == true && kind.options.all { it.first.firstOrNull()?.isLowerCase() ?: true }
            val list = if (current.isNotEmpty() && kind.options.none { it.first.equals(current, ignoreCase = true) }) kind.options + (current to current) else kind.options
            val selected = list.firstOrNull { it.first.equals(current, ignoreCase = true) }?.first ?: current
            ChoiceLine(field.label, list, selected) { chosen -> change(if (capitalized) chosen.replaceFirstChar { it.uppercase() } else chosen) }
        }
        ConfigField.Kind.ReadOnly -> AdminRow(field.label, detail = describe(value))
    }
}

private fun describe(value: Any?): String = when (value) {
    is List<*> -> if (value.isEmpty()) "—" else value.joinToString(", ")
    is Number -> value.toString()
    is String -> value.ifEmpty { "—" }
    else -> "—"
}

/** Rubriques des réglages du serveur. */
object AdminForms {
    private val languages = listOf("fr" to "Français", "en" to "Anglais", "de" to "Allemand", "es" to "Espagnol", "it" to "Italien", "ja" to "Japonais", "pt" to "Portugais")
    private val countries = listOf("FR" to "France", "BE" to "Belgique", "CA" to "Canada", "CH" to "Suisse", "US" to "États-Unis", "GB" to "Royaume-Uni", "DE" to "Allemagne", "ES" to "Espagne", "IT" to "Italie", "JP" to "Japon")
    private fun n(suffix: String = "") = ConfigField.Kind.Number(suffix)

    val general = listOf(
        ConfigSection("Serveur", listOf(
            ConfigField("ServerName", "Nom du serveur", ConfigField.Kind.Text),
            ConfigField("UICulture", "Langue de l’interface", ConfigField.Kind.Choice(listOf("fr" to "Français", "en-US" to "Anglais", "de" to "Allemand", "es" to "Espagnol", "it" to "Italien"))),
            ConfigField("QuickConnectAvailable", "Connexion rapide (code)")
        )),
        ConfigSection("Métadonnées", listOf(
            ConfigField("PreferredMetadataLanguage", "Langue préférée", ConfigField.Kind.Choice(languages)),
            ConfigField("MetadataCountryCode", "Pays", ConfigField.Kind.Choice(countries))
        )),
        ConfigSection("Médiathèques", listOf(
            ConfigField("EnableFolderView", "Afficher la vue Dossiers"),
            ConfigField("EnableGroupingIntoCollections", "Regrouper les films en collections"),
            ConfigField("DisplaySpecialsWithinSeasons", "Épisodes spéciaux dans les saisons"),
            ConfigField("EnableExternalContentInSuggestions", "Contenu externe dans les suggestions"),
            ConfigField("LibraryMonitorDelay", "Délai de surveillance", n("s")),
            ConfigField("LibraryScanFanoutConcurrency", "Analyses en parallèle", n()),
            ConfigField("LibraryMetadataRefreshConcurrency", "Actualisations en parallèle", n()),
            ConfigField("ParallelImageEncodingLimit", "Images encodées en parallèle", n())
        ), "0 : valeur automatique."),
        ConfigSection("Reprise de lecture", listOf(
            ConfigField("MinResumePct", "Reprise à partir de", n("%")),
            ConfigField("MaxResumePct", "Vu au-delà de", n("%")),
            ConfigField("MinResumeDurationSeconds", "Durée minimale", n("s")),
            ConfigField("MinAudiobookResume", "Livres audio : reprise après", n("min")),
            ConfigField("MaxAudiobookResume", "Livres audio : terminé à moins de", n("min"))
        )),
        ConfigSection("Journal et performances", listOf(
            ConfigField("ActivityLogRetentionDays", "Conserver l’activité", n("j")),
            ConfigField("LogFileRetentionDays", "Conserver les journaux", n("j")),
            ConfigField("EnableSlowResponseWarning", "Signaler les réponses lentes"),
            ConfigField("SlowResponseThresholdMs", "Seuil des réponses lentes", n("ms"))
        )),
        ConfigSection("Dossiers", listOf(
            ConfigField("CachePath", "Cache", ConfigField.Kind.ReadOnly),
            ConfigField("MetadataPath", "Métadonnées", ConfigField.Kind.ReadOnly)
        ))
    )

    val encoding = listOf(
        ConfigSection("Accélération matérielle", listOf(
            ConfigField("HardwareAccelerationType", "Accélération", ConfigField.Kind.Choice(listOf("none" to "Aucune", "qsv" to "Intel Quick Sync", "vaapi" to "VA-API", "nvenc" to "NVIDIA NVENC",
                "amf" to "AMD AMF", "videotoolbox" to "Apple VideoToolbox", "v4l2m2m" to "V4L2", "rkmpp" to "Rockchip MPP"))),
            ConfigField("VaapiDevice", "Périphérique VA-API", ConfigField.Kind.Text),
            ConfigField("EnableHardwareEncoding", "Encodage matériel"),
            ConfigField("EnableDecodingColorDepth10Hevc", "Décodage HEVC 10 bits"),
            ConfigField("EnableDecodingColorDepth10Vp9", "Décodage VP9 10 bits"),
            ConfigField("PreferSystemNativeHwDecoder", "Décodeur matériel du système"),
            ConfigField("EnableEnhancedNvdecDecoder", "Décodeur NVDEC amélioré"),
            ConfigField("EnableIntelLowPowerH264HwEncoder", "Encodeur Intel basse consommation H.264"),
            ConfigField("EnableIntelLowPowerHevcHwEncoder", "Encodeur Intel basse consommation HEVC")
        )),
        ConfigSection("Encodage", listOf(
            ConfigField("EncodingThreadCount", "Fils d’encodage", n()),
            ConfigField("EncoderPreset", "Préréglage", ConfigField.Kind.Choice(listOf("auto" to "Automatique", "veryslow" to "Très lent", "slower" to "Plus lent", "slow" to "Lent", "medium" to "Moyen",
                "fast" to "Rapide", "faster" to "Plus rapide", "veryfast" to "Très rapide", "superfast" to "Super rapide", "ultrafast" to "Ultra rapide"))),
            ConfigField("H264Crf", "Qualité H.264 (CRF)", n()),
            ConfigField("H265Crf", "Qualité HEVC (CRF)", n()),
            ConfigField("AllowHevcEncoding", "Autoriser l’encodage HEVC"),
            ConfigField("AllowAv1Encoding", "Autoriser l’encodage AV1"),
            ConfigField("DeinterlaceMethod", "Désentrelacement", ConfigField.Kind.Choice(listOf("yadif" to "YADIF", "bwdif" to "BWDIF"))),
            ConfigField("DeinterlaceDoubleRate", "Doubler la fréquence d’images"),
            ConfigField("MaxMuxingQueueSize", "File de multiplexage", n())
        ), "Fils d’encodage : -1 pour automatique. CRF : plus bas = meilleure qualité."),
        ConfigSection("HDR", listOf(
            ConfigField("EnableTonemapping", "Conversion HDR → SDR (tone mapping)"),
            ConfigField("EnableVppTonemapping", "Tone mapping VPP (Intel)"),
            ConfigField("TonemappingAlgorithm", "Algorithme", ConfigField.Kind.Choice(listOf("bt2390" to "BT.2390", "hable" to "Hable", "reinhard" to "Reinhard", "mobius" to "Mobius", "linear" to "Linéaire", "clip" to "Écrêtage", "none" to "Aucun"))),
            ConfigField("TonemappingRange", "Plage", ConfigField.Kind.Choice(listOf("auto" to "Automatique", "tv" to "TV", "pc" to "PC")))
        )),
        ConfigSection("Audio et sous-titres", listOf(
            ConfigField("DownMixAudioBoost", "Amplification du mixage stéréo", ConfigField.Kind.Decimal),
            ConfigField("EnableSubtitleExtraction", "Extraire les sous-titres à la volée"),
            ConfigField("EnableFallbackFont", "Police de secours"),
            ConfigField("FallbackFontPath", "Dossier de la police", ConfigField.Kind.Text)
        ), "« Extraire les sous-titres » doit rester activé pour lire les sous-titres intégrés aux fichiers MKV dans l’appli."),
        ConfigSection("Fichiers temporaires", listOf(
            ConfigField("EnableThrottling", "Ralentir le transcodage en avance"),
            ConfigField("ThrottleDelaySeconds", "Avance avant ralentissement", n("s")),
            ConfigField("EnableSegmentDeletion", "Supprimer les anciens segments"),
            ConfigField("SegmentKeepSeconds", "Garder les segments", n("s")),
            ConfigField("TranscodingTempPath", "Dossier temporaire", ConfigField.Kind.Text),
            ConfigField("EncoderAppPathDisplay", "FFmpeg", ConfigField.Kind.ReadOnly)
        ))
    )

    val network = listOf(
        ConfigSection("Accès", listOf(
            ConfigField("EnableRemoteAccess", "Accès hors du réseau local"),
            ConfigField("BaseUrl", "Adresse de base", ConfigField.Kind.Text),
            ConfigField("AutoDiscovery", "Découverte automatique"),
            ConfigField("EnableUPnP", "UPnP"),
            ConfigField("EnableIPv4", "IPv4"),
            ConfigField("EnableIPv6", "IPv6")
        )),
        ConfigSection("Ports et HTTPS", listOf(
            ConfigField("InternalHttpPort", "Port HTTP local", n()),
            ConfigField("InternalHttpsPort", "Port HTTPS local", n()),
            ConfigField("PublicHttpPort", "Port HTTP public", n()),
            ConfigField("PublicHttpsPort", "Port HTTPS public", n()),
            ConfigField("EnableHttps", "HTTPS"),
            ConfigField("RequireHttps", "Exiger HTTPS")
        )),
        ConfigSection("Réseaux et relais", listOf(
            ConfigField("LocalNetworkSubnets", "Réseaux locaux", ConfigField.Kind.ReadOnly),
            ConfigField("LocalNetworkAddresses", "Adresses d’écoute", ConfigField.Kind.ReadOnly),
            ConfigField("KnownProxies", "Relais connus", ConfigField.Kind.ReadOnly),
            ConfigField("RemoteIPFilter", "Filtre d’adresses", ConfigField.Kind.ReadOnly)
        ))
    )

    val branding = listOf(
        ConfigSection("Écran de connexion", listOf(
            ConfigField("LoginDisclaimer", "Message", ConfigField.Kind.TextArea),
            ConfigField("SplashscreenEnabled", "Écran d’accueil animé")
        )),
        ConfigSection("Apparence du site", listOf(ConfigField("CustomCss", "CSS personnalisé", ConfigField.Kind.TextArea)))
    )
}
