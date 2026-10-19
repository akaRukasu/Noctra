package com.noctra.mobile.core

import android.content.Context
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.noctra.mobile.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URI
import java.util.UUID

/**
 * Session : serveur Jellyfin du serveur Noctra, jeton, utilisateur.
 * Jeton gardé dans le stockage chiffré, le reste dans les réglages de l'appli.
 */
object Session {
    const val defaultServer = "https://akarukasu.merlion.usbx.me"
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var jellyfinBase by mutableStateOf("")
        private set
    var noctraBase by mutableStateOf("")
        private set
    var token by mutableStateOf<String?>(null)
        private set
    var userId by mutableStateOf<String?>(null)
        private set
    var userName by mutableStateOf<String?>(null)
        private set
    /** Photo de profil Jellyfin (étiquette de l'image) : affichée à la place de l'initiale. */
    var avatarTag by mutableStateOf<String?>(null)
        private set
    var hasNoctra by mutableStateOf(false)
        private set
    var isAdmin by mutableStateOf(false)
        private set
    lateinit var deviceId: String
        private set
    private var deviceName = "Android"

    val isSignedIn: Boolean get() = token != null && userId != null && jellyfinBase.isNotEmpty()
    val lastServer: String get() = Prefs.string("noctra.server") ?: defaultServer

    fun init(context: Context) {
        jellyfinBase = Prefs.string("noctra.jellyfin") ?: ""
        noctraBase = Prefs.string("noctra.noctra") ?: ""
        userId = Prefs.string("noctra.userId")
        userName = Prefs.string("noctra.userName")
        avatarTag = Prefs.string("noctra.avatarTag")
        hasNoctra = Prefs.bool("noctra.hasNoctra")
        deviceId = Prefs.string("noctra.deviceId") ?: ("noctra-android-" + UUID.randomUUID().toString().lowercase()).also { Prefs.set("noctra.deviceId", it) }
        val model = listOfNotNull(Build.MANUFACTURER?.replaceFirstChar { it.uppercase() }, Build.MODEL).distinct().joinToString(" ")
        deviceName = model.ifBlank { "Android" }.replace("\"", "")
        token = Prefs.secure.getString("noctra.token", null)
        if (token == null) userId = null
    }

    // MARK: Connexion

    /** Adresse saisie → serveur Jellyfin (/jellyfin ou la racine) et serveur Noctra (/noctra). */
    suspend fun signIn(server: String, username: String, password: String) {
        var text = server.trim()
        if (text.isEmpty()) text = defaultServer
        if (!text.lowercase().startsWith("http")) text = "https://$text"
        while (text.endsWith("/")) text = text.dropLast(1)
        for (suffix in listOf("/noctra", "/jellyfin", "/web")) if (text.lowercase().endsWith(suffix)) text = text.dropLast(suffix.length)
        if (text.toHttpUrlOrNull() == null) throw NoctraException.badAddress

        val jellyfin = listOf("$text/jellyfin", text).firstOrNull { isJellyfin(it) } ?: throw NoctraException.unreachable
        val request = Request.Builder().url("$jellyfin/Users/AuthenticateByName")
            .header("Authorization", authorization(null))
            .post(Json.stringify(mapOf("Username" to username, "Pw" to password)).toRequestBody(jsonType))
            .build()
        val (status, body) = try { Net.text(request, Net.client(20.0)) } catch (error: Exception) { throw NoctraException.unreachable }
        if (status == 401 || status == 403) throw NoctraException.credentials
        if (status !in 200..299) throw NoctraException.http(status)
        val json = Json.parseMap(body) ?: throw NoctraException.empty
        val accessToken = json.str("AccessToken") ?: throw NoctraException.empty
        val user = json.map("User") ?: throw NoctraException.empty

        val noctra = "$text/noctra"
        val noctraOK = isNoctra(noctra)
        Prefs.secure.edit().putString("noctra.token", accessToken).apply()
        Prefs.set("noctra.jellyfin", jellyfin)
        Prefs.set("noctra.noctra", noctra)
        Prefs.set("noctra.userId", user.string("Id"))
        Prefs.set("noctra.userName", user.str("Name"))
        Prefs.set("noctra.avatarTag", user.str("PrimaryImageTag"))
        Prefs.set("noctra.hasNoctra", noctraOK)
        Prefs.set("noctra.server", text)
        jellyfinBase = jellyfin
        noctraBase = noctra
        hasNoctra = noctraOK
        userName = user.str("Name")
        avatarTag = user.str("PrimaryImageTag")
        userId = user.string("Id")
        token = accessToken
    }

    fun signOut() {
        val current = token
        if (current != null) {
            val request = Request.Builder().url("$jellyfinBase/Sessions/Logout").header("Authorization", authorization(current))
                .post(ByteArray(0).toRequestBody(null)).build()
            scope.launch { runCatching { Net.call(request).close() } }
        }
        Prefs.secure.edit().remove("noctra.token").apply()
        Prefs.set("noctra.userId", null)
        Prefs.set("noctra.avatarTag", null)
        Net.cookies.clear()
        token = null
        userId = null
        avatarTag = null
        isAdmin = false
    }

    private suspend fun isJellyfin(base: String): Boolean = try {
        val (status, body) = Net.text(Request.Builder().url("$base/System/Info/Public").build(), Net.client(10.0))
        val json = if (status == 200) Json.parseMap(body) else null
        json != null && (json["Id"] != null || json["ServerName"] != null)
    } catch (error: Exception) { false }

    private suspend fun isNoctra(base: String): Boolean = try {
        val (status, body) = Net.text(Request.Builder().url("$base/health").build(), Net.client(10.0))
        status == 200 && Json.parseMap(body)?.str("client") == "Noctra"
    } catch (error: Exception) { false }

    // MARK: Requêtes Jellyfin

    fun authorization(token: String? = this.token): String {
        var value = "MediaBrowser Client=\"Noctra Android\", Device=\"$deviceName\", DeviceId=\"$deviceId\", Version=\"${BuildConfig.VERSION_NAME}\""
        if (token != null) value += ", Token=\"$token\""
        return value
    }

    val authHeaders: Map<String, String> get() = mapOf("Authorization" to authorization())

    fun url(path: String, query: Map<String, String?> = emptyMap()): HttpUrl? {
        val resolved = path.replace("{userId}", userId ?: "")
        val builder = (jellyfinBase + resolved).toHttpUrlOrNull()?.newBuilder() ?: return null
        for ((key, value) in query.entries.sortedBy { it.key }) if (value != null) builder.addQueryParameter(key, value)
        return builder.build()
    }

    fun urlString(path: String, query: Map<String, String?> = emptyMap()): String? = url(path, query)?.toString()

    private fun body(method: String, json: Any?): RequestBody? = when {
        json != null -> Json.stringify(json).toRequestBody(jsonType)
        method == "GET" || method == "HEAD" -> null
        else -> ByteArray(0).toRequestBody(null)
    }

    /** Requête Jellyfin : texte de la réponse (déconnexion si le jeton n'est plus valable). */
    suspend fun data(method: String = "GET", path: String, query: Map<String, String?> = emptyMap(), json: Any? = null, timeout: Double = 30.0): String {
        val url = url(path, query) ?: throw NoctraException.badAddress
        val request = Request.Builder().url(url).header("Authorization", authorization()).method(method, body(method, json)).build()
        val (status, text) = try { Net.text(request, Net.client(timeout)) } catch (error: kotlinx.coroutines.CancellationException) { throw error } catch (error: Exception) { throw NoctraException.unreachable }
        if (status == 401) signOut()
        if (status !in 200..299) throw NoctraException.http(status)
        return text
    }

    suspend fun json(path: String, query: Map<String, String?> = emptyMap()): Any? = Json.parse(data("GET", path, query))

    /** Route récente de Jellyfin, puis l'ancienne si le serveur ne la connaît pas. */
    suspend fun json(paths: List<String>, query: Map<String, String?> = emptyMap()): Any? {
        var last: Exception = NoctraException.empty
        for (path in paths) {
            try { return json(path, query) } catch (error: NoctraException) {
                if (error.code != 404 && error.code != 405) throw error
                last = error
            }
        }
        throw last
    }

    suspend fun send(method: String, paths: List<String>, query: Map<String, String?> = emptyMap(), json: Any? = null): String {
        var last: Exception = NoctraException.empty
        for (path in paths) {
            try { return data(method, path, query, json) } catch (error: NoctraException) {
                if (error.code != 404 && error.code != 405) throw error
                last = error
            }
        }
        throw last
    }

    suspend fun items(path: String, query: Map<String, String?>): List<BaseItem> = BaseItem.items(json(path, query))
    suspend fun items(paths: List<String>, query: Map<String, String?>): List<BaseItem> = BaseItem.items(json(paths, query))

    // MARK: Images

    fun image(id: String?, type: String = "Primary", tag: String? = null, width: Int): String? {
        if (id == null) return null
        return urlString("/Items/$id/Images/$type", mapOf("maxWidth" to width.toString(), "quality" to "88", "tag" to tag))
    }

    /** Affiche verticale (épisode : affiche de la série). */
    fun poster(item: BaseItem, width: Int = 360): String? {
        if ((item.type == "Episode" || item.type == "Season") && item.seriesId != null) {
            if (item.type == "Season") item.imageTags["Primary"]?.let { return image(item.id, tag = it, width = width) }
            return image(item.seriesId, tag = item.seriesPrimaryImageTag, width = width)
        }
        return image(item.id, tag = item.imageTags["Primary"], width = width)
    }

    /** Image large (fond de la fiche, carrousel). */
    fun backdrop(item: BaseItem, width: Int = 1280): String? {
        item.backdropImageTags.firstOrNull()?.let { return image(item.id, "Backdrop", it, width) }
        item.parentBackdropItemId?.let { return image(it, "Backdrop", item.parentBackdropImageTags.firstOrNull(), width) }
        return poster(item, width / 2)
    }

    /** Vignette 16:9 (épisodes, reprises). */
    fun thumb(item: BaseItem, width: Int = 640): String? {
        if (item.type == "Episode") item.imageTags["Primary"]?.let { return image(item.id, tag = it, width = width) }
        item.imageTags["Thumb"]?.let { return image(item.id, "Thumb", it, width) }
        return backdrop(item, width)
    }

    fun logo(item: BaseItem, width: Int = 600): String? {
        item.imageTags["Logo"]?.let { return image(item.id, "Logo", it, width) }
        item.parentLogoItemId?.let { return image(it, "Logo", item.parentLogoImageTag, width) }
        return null
    }

    // MARK: Serveur Noctra (TV en direct)

    /**
     * Adresse d'une ressource Noctra. Les routes de l'appli (« /api/… ») sont
     * relatives au dossier du serveur (/noctra) ; les liens renvoyés par le
     * serveur contiennent déjà ce dossier (« /noctra/api/tv/stream/… »).
     */
    fun noctraURL(raw: String): String? {
        if (raw.lowercase().startsWith("http")) return raw.toHttpUrlOrNull()?.toString() ?: raw.takeIf { runCatching { URI(it) }.isSuccess }
        val base = (noctraBase + "/").toHttpUrlOrNull() ?: return null
        if (raw.startsWith("/")) {
            val folder = noctraBase.toHttpUrlOrNull()?.encodedPath?.trimEnd('/') ?: ""
            val inFolder = folder.isEmpty() || raw == folder || raw.startsWith("$folder/")
            return if (inFolder) base.resolve(raw)?.toString() else (noctraBase + raw).toHttpUrlOrNull()?.toString()
        }
        return base.resolve(raw)?.toString()
    }

    /** Le jeton ne part que vers le serveur Noctra lui-même. */
    fun isNoctraOrigin(url: String): Boolean {
        val target = url.toHttpUrlOrNull() ?: return false
        val base = noctraBase.toHttpUrlOrNull() ?: return false
        return target.host == base.host && target.scheme == base.scheme && target.port == base.port
    }

    private fun noctraRequest(url: String, method: String = "GET", json: Any? = null): Request {
        val builder = Request.Builder().url(url).method(method, body(method, json))
        token?.let { builder.header("x-noctra-token", it) }
        return builder.build()
    }

    suspend fun noctraJSON(path: String, timeout: Double = 45.0): Any? {
        val url = noctraURL(path) ?: throw NoctraException.badAddress
        val (status, text) = try { Net.text(noctraRequest(url), Net.client(timeout)) } catch (error: kotlinx.coroutines.CancellationException) { throw error } catch (error: Exception) { throw NoctraException.unreachable }
        if (status !in 200..299) throw NoctraException.http(status)
        return Json.parse(text)
    }

    /** Requête Noctra avec corps JSON (demandes Jellyseerr…). */
    suspend fun noctraSend(method: String, path: String, json: Any? = null, timeout: Double = 45.0): Any? {
        val url = noctraURL(path) ?: throw NoctraException.badAddress
        val (status, text) = try { Net.text(noctraRequest(url, method, json), Net.client(timeout)) } catch (error: kotlinx.coroutines.CancellationException) { throw error } catch (error: Exception) { throw NoctraException.unreachable }
        val body = runCatching { Json.parse(text) }.getOrNull()
        if (status !in 200..299) {
            body.asMap()?.str("error")?.let { throw NoctraException(it, status) }
            throw NoctraException.http(status)
        }
        return body
    }

    /**
     * Cookie de session Noctra (posé par /api/session) : les segments des
     * chaînes relayées par le serveur passent avec lui ; droits de l'utilisateur.
     */
    suspend fun establishNoctraSession() {
        if (token == null) return
        if (noctraBase.isNotEmpty()) {
            val json = runCatching { noctraJSON("/api/session", 15.0) }.getOrNull().asMap()
            if (json != null) {
                hasNoctra = true
                Prefs.set("noctra.hasNoctra", true)
                isAdmin = json.flag("isAdmin")
                json.map("user")?.let { changeAvatar(it.str("primaryImageTag")) }
                return
            }
        }
        // Sans serveur Noctra : droits lus sur le compte Jellyfin.
        val me = runCatching { json("/Users/Me") }.getOrNull().asMap()
        isAdmin = me?.map("Policy")?.flag("IsAdministrator") == true
        if (me != null) changeAvatar(me.str("PrimaryImageTag"))
    }

    /** Photo de profil changée depuis Jellyfin ou le site : nouvelle étiquette, nouvelle image. */
    private fun changeAvatar(tag: String?) {
        val value = tag?.takeIf { it.isNotBlank() }
        if (value == avatarTag) return
        avatarTag = value
        Prefs.set("noctra.avatarTag", value)
    }

    /** Photo de profil de l'utilisateur connecté (null : initiale du nom). */
    fun avatarURL(size: Int = 160): String? {
        val id = userId ?: return null
        val tag = avatarTag ?: return null
        return urlString("/Users/$id/Images/Primary", mapOf("tag" to tag, "maxWidth" to size.toString(), "quality" to "90"))
    }

    /** En-têtes d'une requête vers une adresse Noctra (jeton et cookies), pour les lecteurs. */
    fun noctraHeaders(url: String): Map<String, String> {
        if (!isNoctraOrigin(url)) return emptyMap()
        val headers = mutableMapOf<String, String>()
        token?.let { headers["x-noctra-token"] = it }
        url.toHttpUrlOrNull()?.let { Net.cookies.header(it) }?.takeIf { it.isNotEmpty() }?.let { headers["Cookie"] = it }
        return headers
    }
}
