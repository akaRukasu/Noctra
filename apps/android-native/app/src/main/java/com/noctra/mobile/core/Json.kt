package com.noctra.mobile.core

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** JSON lu en dictionnaires et listes Kotlin, comme [String: Any] dans l'appli iOS. */
typealias JsonMap = Map<String, Any?>

object Json {
    fun parse(text: String): Any? {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return null
        return unwrap(JSONTokener(trimmed).nextValue())
    }

    fun parseMap(text: String): JsonMap? = parse(text) as? JsonMap

    private fun unwrap(value: Any?): Any? = when (value) {
        is JSONObject -> {
            val map = LinkedHashMap<String, Any?>(value.length())
            val keys = value.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                map[key] = unwrap(value.opt(key))
            }
            map
        }
        is JSONArray -> List(value.length()) { unwrap(value.opt(it)) }
        JSONObject.NULL -> null
        else -> value
    }

    fun stringify(value: Any?): String = wrap(value).toString()

    private fun wrap(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().also { obj -> value.forEach { (k, v) -> obj.put(k.toString(), wrap(v)) } }
        is Collection<*> -> JSONArray().also { array -> value.forEach { array.put(wrap(it)) } }
        is Array<*> -> JSONArray().also { array -> value.forEach { array.put(wrap(it)) } }
        else -> value
    }
}

fun JsonMap.str(key: String): String? = (this[key] as? String)?.takeIf { it.isNotEmpty() }
fun JsonMap.string(key: String): String? = when (val v = this[key]) {
    is String -> v
    is Number -> if (v.toDouble() % 1.0 == 0.0) v.toLong().toString() else v.toString()
    is Boolean -> v.toString()
    else -> null
}
fun JsonMap.int(key: String): Int? = when (val v = this[key]) {
    is Number -> v.toInt()
    is String -> v.toIntOrNull()
    else -> null
}
fun JsonMap.long(key: String): Long? = when (val v = this[key]) {
    is Number -> v.toLong()
    is String -> v.toLongOrNull()
    else -> null
}
fun JsonMap.double(key: String): Double? = when (val v = this[key]) {
    is Number -> v.toDouble()
    is String -> v.toDoubleOrNull()
    else -> null
}
fun JsonMap.bool(key: String): Boolean? = this[key] as? Boolean
fun JsonMap.flag(key: String): Boolean = this[key] == true
@Suppress("UNCHECKED_CAST")
fun JsonMap.map(key: String): JsonMap? = this[key] as? JsonMap
@Suppress("UNCHECKED_CAST")
fun JsonMap.list(key: String): List<Any?>? = this[key] as? List<Any?>
@Suppress("UNCHECKED_CAST")
fun JsonMap.maps(key: String): List<JsonMap> = (this[key] as? List<Any?>)?.mapNotNull { it as? JsonMap } ?: emptyList()
fun JsonMap.strings(key: String): List<String> = (this[key] as? List<*>)?.mapNotNull { it as? String } ?: emptyList()

@Suppress("UNCHECKED_CAST")
fun Any?.asMap(): JsonMap? = this as? JsonMap
@Suppress("UNCHECKED_CAST")
fun Any?.asMaps(): List<JsonMap> = (this as? List<Any?>)?.mapNotNull { it as? JsonMap } ?: emptyList()
