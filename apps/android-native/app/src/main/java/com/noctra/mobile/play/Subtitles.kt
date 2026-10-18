package com.noctra.mobile.play

import com.noctra.mobile.core.Prefs

/** Réplique de sous-titres (secondes). */
data class SubtitleCue(val start: Double, val end: Double, val text: String)

/** Lecture des fichiers WebVTT (et SRT) convertis par Jellyfin. */
object WebVTT {
    fun parse(raw: String): List<SubtitleCue> {
        val text = raw.replace("\r\n", "\n").replace("\r", "\n")
        val cues = mutableListOf<SubtitleCue>()
        for (block in text.split("\n\n")) {
            val lines = block.split("\n")
            val timing = lines.indexOfFirst { it.contains("-->") }
            if (timing < 0) continue
            val parts = lines[timing].split("-->")
            if (parts.size != 2) continue
            val start = seconds(parts[0]) ?: continue
            val end = seconds(parts[1].trim().split(" ").firstOrNull() ?: "") ?: continue
            val body = lines.drop(timing + 1).map { clean(it) }.filter { it.isNotEmpty() }.joinToString("\n")
            if (body.isNotEmpty() && end > start) cues += SubtitleCue(start, end, body)
        }
        return cues.sortedBy { it.start }
    }

    /** « 01:02:03.456 », « 02:03.456 » ou « 01:02:03,456 » (SRT). */
    fun seconds(value: String): Double? {
        val fields = value.trim().replace(",", ".").split(":")
        if (fields.size !in 2..3) return null
        var total = 0.0
        for (field in fields) total = total * 60 + (field.toDoubleOrNull() ?: return null)
        return total
    }

    /** Balises (<i>, <c.color>, {\an8}…) et entités retirées. */
    private fun clean(line: String): String = line
        .replace(Regex("<[^>]+>"), "")
        .replace(Regex("\\{[^}]*\\}"), "")
        .replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        .replace("\\N", "\n")
        .trim()

    /** Répliques affichées à l'instant donné (celles qui se chevauchent comprises). */
    fun at(cues: List<SubtitleCue>, time: Double): String {
        if (cues.isEmpty()) return ""
        var low = 0
        var high = cues.size - 1
        var found = -1
        while (low <= high) {
            val middle = (low + high) / 2
            if (cues[middle].start <= time) { found = middle; low = middle + 1 } else high = middle - 1
        }
        val lines = mutableListOf<String>()
        var index = found
        while (index >= 0 && index > found - 6) {
            if (cues[index].end > time) lines.add(0, cues[index].text)
            index -= 1
        }
        return lines.joinToString("\n")
    }
}

/** Taille des sous-titres choisie dans le compte (comme le réglage du site). */
enum class SubtitleSize(val label: String, val sp: Int) {
    Small("Petits", 16), Medium("Moyens", 20), Large("Grands", 25);

    companion object {
        var current: SubtitleSize
            get() = entries.getOrNull(Prefs.int("noctra.subtitles.size", 1)) ?: Medium
            set(value) = Prefs.set("noctra.subtitles.size", value.ordinal)
    }
}
