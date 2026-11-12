package com.noctra.mobile.core

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Erreur lisible, comme NoctraError dans l'appli iOS. */
class NoctraException(message: String, val code: Int = 0) : Exception(message) {
    companion object {
        val badAddress get() = NoctraException("Adresse du serveur invalide.")
        val unreachable get() = NoctraException("Serveur injoignable. Vérifiez l’adresse et la connexion.")
        val credentials get() = NoctraException("Nom d’utilisateur ou mot de passe incorrect.")
        val empty get() = NoctraException("Aucun contenu disponible.")
        fun http(code: Int) = NoctraException(
            if (code == 401) "Session expirée : reconnectez-vous." else "Le serveur a répondu par une erreur ($code).", code
        )
    }
}

/** Cookies (session Noctra des chaînes relayées), gardés en mémoire pour l'appli. */
class NoctraCookies : CookieJar {
    private val store = ConcurrentHashMap<String, Cookie>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (cookie in cookies) store["${cookie.domain}|${cookie.path}|${cookie.name}"] = cookie
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        store.entries.removeAll { it.value.expiresAt < now }
        return store.values.filter { it.matches(url) }
    }

    /** Cookies d'une adresse, au format de l'en-tête « Cookie » (lecteurs web). */
    fun header(url: HttpUrl): String = loadForRequest(url).joinToString("; ") { "${it.name}=${it.value}" }

    fun all(): List<Cookie> = store.values.toList()

    fun clear() = store.clear()
}

object Net {
    val cookies = NoctraCookies()

    val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookies)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    fun client(timeoutSeconds: Double): OkHttpClient {
        val millis = (timeoutSeconds * 1000).toLong()
        return client.newBuilder()
            .callTimeout(millis, TimeUnit.MILLISECONDS)
            .readTimeout(millis, TimeUnit.MILLISECONDS)
            .build()
    }

    /** Appel annulable (la coroutine annulée annule la requête). */
    suspend fun call(request: Request, http: OkHttpClient = client): Response = suspendCancellableCoroutine { continuation ->
        val call = http.newCall(request)
        continuation.invokeOnCancellation { runCatching { call.cancel() } }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                if (continuation.isActive) continuation.resume(response) else response.close()
            }
        })
    }

    /** Corps texte d'une réponse, lu hors du fil principal. */
    suspend fun text(request: Request, http: OkHttpClient = client): Pair<Int, String> {
        val response = call(request, http)
        return withContext(Dispatchers.IO) { response.use { it.code to (it.body?.string() ?: "") } }
    }
}

/** Réglages de l'appli ; jeton dans un stockage chiffré (repli simple si le trousseau Android est indisponible). */
object Prefs {
    lateinit var plain: SharedPreferences
        private set
    lateinit var secure: SharedPreferences
        private set

    fun init(context: Context) {
        plain = context.getSharedPreferences("noctra", Context.MODE_PRIVATE)
        secure = try {
            EncryptedSharedPreferences.create(
                "noctra-secure", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (error: Throwable) {
            context.getSharedPreferences("noctra-secure-fallback", Context.MODE_PRIVATE)
        }
    }

    fun string(key: String): String? = plain.getString(key, null)
    fun set(key: String, value: String?) = plain.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    fun bool(key: String, default: Boolean = false): Boolean = plain.getBoolean(key, default)
    fun set(key: String, value: Boolean) = plain.edit().putBoolean(key, value).apply()
    fun int(key: String, default: Int = 0): Int = plain.getInt(key, default)
    fun set(key: String, value: Int) = plain.edit().putInt(key, value).apply()
    fun strings(key: String): List<String> = plain.getString(key, null)?.let { raw -> (Json.parse(raw) as? List<*>)?.mapNotNull { it as? String } } ?: emptyList()
    fun setStrings(key: String, value: List<String>) = plain.edit().putString(key, Json.stringify(value)).apply()
    fun json(key: String): Any? = plain.getString(key, null)?.let { runCatching { Json.parse(it) }.getOrNull() }
    fun setJson(key: String, value: Any?) = plain.edit().putString(key, Json.stringify(value)).apply()
}
