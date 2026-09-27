package com.noctra.tv;

import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Compatibilité des lecteurs web avec un moteur web ancien (Chrome 83 et
 * avant, fréquent sur les vidéoprojecteurs dont « Android System WebView »
 * ne se met pas à jour).
 *
 * Les scripts récents des lecteurs utilisent une syntaxe que ce moteur ne
 * comprend pas : le script entier est alors refusé (« SyntaxError:
 * Unexpected token '(' »), puis tout ce qui en dépend échoue (« aclib is not
 * defined »…). Les scripts et les pages sont donc adaptés avant d'arriver au
 * moteur web :
 * - méthodes et champs privés (#nom, Chrome 84) → membres ordinaires ;
 * - affectations logiques (a ??= b, a ||= b, a &&= b, Chrome 85) ;
 * - blocs statiques de classe (static { … }, Chrome 94) ;
 * - drapeau d des expressions régulières (Chrome 90) ;
 * - fonctions récentes absentes (Array.at, Object.hasOwn, replaceAll,
 *   structuredClone, WeakRef…) ajoutées au début de chaque page.
 *
 * Un petit analyseur distingue le code des chaînes, commentaires, modèles
 * (`…${…}…`) et expressions régulières, qui ne sont jamais modifiés. En cas
 * de doute (structure incohérente), le script est rendu tel quel.
 */
final class NoctraJsCompat {
    private NoctraJsCompat() { }

    /** Fonctions récentes, en JavaScript compris par les moteurs anciens. */
    static final String POLYFILL = "(function(){try{var d=function(o,n,v){if(!o[n])Object.defineProperty(o,n,{value:v,writable:true,configurable:true})};"
        + "var at=function(i){i=Math.trunc(i)||0;if(i<0)i+=this.length;return i<0||i>=this.length?undefined:this[i]};"
        + "d(Array.prototype,'at',at);d(String.prototype,'at',at);"
        + "['Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array'].forEach(function(t){if(window[t])d(window[t].prototype,'at',at)});"
        + "d(Object,'hasOwn',function(o,k){return Object.prototype.hasOwnProperty.call(o,k)});"
        + "d(String.prototype,'replaceAll',function(s,r){if(s instanceof RegExp)return this.replace(s,r);return this.replace(new RegExp(String(s).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'g'),r)});"
        + "d(Array.prototype,'findLast',function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return this[i]});"
        + "d(Array.prototype,'findLastIndex',function(f,t){for(var i=this.length-1;i>=0;i--)if(f.call(t,this[i],i,this))return i;return -1});"
        + "d(Array.prototype,'toReversed',function(){return this.slice().reverse()});"
        + "d(Array.prototype,'toSorted',function(f){return this.slice().sort(f)});"
        + "d(Array.prototype,'toSpliced',function(){var a=this.slice();a.splice.apply(a,arguments);return a});"
        + "d(Array.prototype,'with',function(i,v){var a=this.slice();if(i<0)i+=a.length;a[i]=v;return a});"
        + "d(Object,'groupBy',function(l,f){var r={},i=0;Array.prototype.forEach.call(l,function(v){var k=f(v,i++);(r[k]=r[k]||[]).push(v)});return r});"
        + "if(!window.AggregateError){window.AggregateError=function(e,m){var x=new Error(m);x.name='AggregateError';x.errors=e;return x}}"
        + "d(Promise,'any',function(l){return new Promise(function(ok,ko){var a=Array.prototype.slice.call(l),n=a.length,e=[];if(!n)ko(new AggregateError([],'All promises were rejected'));a.forEach(function(p,i){Promise.resolve(p).then(ok,function(x){e[i]=x;if(--n===0)ko(new AggregateError(e,'All promises were rejected'))})})})});"
        + "if(!window.WeakRef){window.WeakRef=function(t){this._t=t};window.WeakRef.prototype.deref=function(){return this._t}}"
        + "if(!window.FinalizationRegistry){window.FinalizationRegistry=function(){};window.FinalizationRegistry.prototype.register=function(){};window.FinalizationRegistry.prototype.unregister=function(){return false}}"
        + "if(!window.structuredClone){window.structuredClone=function(v){return v===undefined?v:JSON.parse(JSON.stringify(v))}}"
        + "if(window.AbortSignal&&!AbortSignal.timeout){AbortSignal.timeout=function(ms){var c=new AbortController();setTimeout(function(){c.abort()},ms);return c.signal}}"
        + "if(window.crypto&&!crypto.randomUUID&&crypto.getRandomValues){crypto.randomUUID=function(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)})}}"
        + "if(window.Element&&!Element.prototype.replaceChildren){Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);this.append.apply(this,arguments)}}"
        + "}catch(e){}})();";

    private static final Pattern SCRIPT = Pattern.compile("(<script\\b)([^>]*)>([\\s\\S]*?)(</script\\s*>)", Pattern.CASE_INSENSITIVE);
    private static final Pattern TYPE = Pattern.compile("\\btype\\s*=\\s*[\"']?([^\"'\\s>]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern INTEGRITY = Pattern.compile("\\s+integrity\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern HEAD = Pattern.compile("<head\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern HTML = Pattern.compile("<html\\b[^>]*>", Pattern.CASE_INSENSITIVE);

    /** Page HTML : scripts intégrés adaptés, contrôles d'intégrité retirés, fonctions récentes ajoutées. */
    static String html(String page) {
        try {
            StringBuffer out = new StringBuffer(page.length() + POLYFILL.length() + 64);
            Matcher scripts = SCRIPT.matcher(page);
            while (scripts.find()) {
                String attributes = scripts.group(2);
                String body = scripts.group(3);
                Matcher type = TYPE.matcher(attributes);
                String kind = type.find() ? type.group(1).toLowerCase() : "";
                boolean code = kind.isEmpty() || kind.contains("javascript") || kind.contains("ecmascript") || kind.equals("module");
                // Intégrité (SRI) : le contenu adapté ne correspondrait plus.
                attributes = INTEGRITY.matcher(attributes).replaceAll("");
                String replaced = scripts.group(1) + attributes + ">" + (code && !body.trim().isEmpty() ? script(body) : body) + scripts.group(4);
                scripts.appendReplacement(out, Matcher.quoteReplacement(replaced));
            }
            scripts.appendTail(out);
            String result = INTEGRITY.matcher(out.toString()).replaceAll("");
            String tag = "<script>" + POLYFILL + "</script>";
            Matcher head = HEAD.matcher(result);
            if (head.find()) return result.substring(0, head.end()) + tag + result.substring(head.end());
            Matcher html = HTML.matcher(result);
            if (html.find()) return result.substring(0, html.end()) + tag + result.substring(html.end());
            return tag + result;
        } catch (Throwable error) {
            return page;
        }
    }

    /** Adresse de base (page obtenue après redirection) : premier élément de head, s'il n'y en a pas déjà une. */
    static String base(String page, String url) {
        if (Pattern.compile("<base\\b", Pattern.CASE_INSENSITIVE).matcher(page).find()) return page;
        String tag = "<base href=\"" + url.replace("&", "&amp;").replace("\"", "&quot;") + "\">";
        Matcher head = HEAD.matcher(page);
        if (head.find()) return page.substring(0, head.end()) + tag + page.substring(head.end());
        return tag + page;
    }

    /** Script adapté ; en cas de doute, le script d'origine. */
    static String script(String source) {
        if (source == null) return null;
        if (source.indexOf('#') < 0 && source.indexOf("??=") < 0 && source.indexOf("||=") < 0 && source.indexOf("&&=") < 0
            && source.indexOf("static") < 0 && source.indexOf('/') < 0) return source;
        try {
            String result = transform(source);
            return result == null ? source : result;
        } catch (Throwable error) {
            return source;
        }
    }

    /** Affectation logique en attente de sa parenthèse fermante. */
    private static final class Closer {
        final int depth;
        int ternaries;

        Closer(int depth) {
            this.depth = depth;
        }
    }

    private static String transform(String s) {
        int n = s.length();
        StringBuilder out = new StringBuilder(n + 256);
        ArrayList<Integer> templates = new ArrayList<Integer>();
        ArrayList<Integer> staticBlocks = new ArrayList<Integer>();
        ArrayList<Closer> closers = new ArrayList<Closer>();
        int depth = 0;
        int staticCount = 0;
        boolean templateText = false;
        char last = 0;
        String lastWord = "";
        int i = 0;
        if (s.startsWith("#!")) {
            int end = s.indexOf('\n');
            if (end < 0) return s;
            out.append(s, 0, end);
            i = end;
        }
        while (i < n) {
            char c = s.charAt(i);
            if (templateText) {
                if (c == '\\') {
                    out.append(s, i, Math.min(n, i + 2));
                    i += 2;
                } else if (c == '`') {
                    out.append(c);
                    i++;
                    templateText = false;
                    last = '"';
                    lastWord = "";
                } else if (c == '$' && i + 1 < n && s.charAt(i + 1) == '{') {
                    out.append("${");
                    i += 2;
                    depth++;
                    templates.add(depth);
                    templateText = false;
                    last = '{';
                    lastWord = "";
                } else {
                    out.append(c);
                    i++;
                }
                continue;
            }
            if (c == '/' && i + 1 < n && s.charAt(i + 1) == '/') {
                int end = s.indexOf('\n', i);
                if (end < 0) end = n;
                out.append(s, i, end);
                i = end;
                continue;
            }
            if (c == '/' && i + 1 < n && s.charAt(i + 1) == '*') {
                int end = s.indexOf("*/", i + 2);
                end = end < 0 ? n : end + 2;
                out.append(s, i, end);
                i = end;
                continue;
            }
            if (c == '\'' || c == '"') {
                int end = i + 1;
                while (end < n && s.charAt(end) != c) {
                    if (s.charAt(end) == '\\') end++;
                    else if (s.charAt(end) == '\n') break;
                    end++;
                }
                end = Math.min(n, end + 1);
                out.append(s, i, end);
                i = end;
                last = '"';
                lastWord = "";
                continue;
            }
            if (c == '`') {
                out.append(c);
                i++;
                templateText = true;
                continue;
            }
            if (c == '/' && regexAllowed(last, lastWord)) {
                int end = regexEnd(s, i);
                if (end > i) {
                    int flags = end;
                    while (flags > i && Character.isLetter(s.charAt(flags - 1))) flags--;
                    out.append(s, i, flags);
                    // Drapeau d (indices) inconnu des moteurs anciens.
                    out.append(s.substring(flags, end).replace("d", ""));
                    i = end;
                    last = 'a';
                    lastWord = "";
                    continue;
                }
            }
            if (c == '#' && i + 1 < n && isIdStart(s.charAt(i + 1)) && last != '.') {
                // « #x in objet » (test de présence, Chrome 91) → « "__p_x" in objet ».
                int end = i + 1;
                while (end < n && isIdPart(s.charAt(end))) end++;
                int next = end;
                while (next < n && Character.isWhitespace(s.charAt(next))) next++;
                if (s.startsWith("in", next) && (next + 2 >= n || !isIdPart(s.charAt(next + 2)))) {
                    out.append("\"__p_").append(s, i + 1, end).append('"');
                    i = end;
                    last = '"';
                    lastWord = "";
                    continue;
                }
            }
            if (c == '#' && i + 1 < n && isIdStart(s.charAt(i + 1))) {
                // « async#x() », « get#x() » (code réduit) : un espace entre les deux mots.
                if (out.length() > 0 && isIdPart(out.charAt(out.length() - 1))) out.append(' ');
                out.append("__p_");
                i++;
                continue;
            }
            if (isIdStart(c)) {
                int end = i + 1;
                while (end < n && isIdPart(s.charAt(end))) end++;
                String word = s.substring(i, end);
                if (word.equals("static") && (last == '{' || last == ';' || last == '}')) {
                    int next = end;
                    while (next < n && Character.isWhitespace(s.charAt(next))) next++;
                    if (next < n && s.charAt(next) == '{') {
                        // Bloc statique de classe → champ statique initialisé par une fonction.
                        out.append("static __noctra_static").append(staticCount++).append("=(()=>{");
                        depth++;
                        staticBlocks.add(depth);
                        i = next + 1;
                        last = '{';
                        lastWord = "";
                        continue;
                    }
                }
                out.append(word);
                i = end;
                last = 'a';
                lastWord = word;
                continue;
            }
            if (c >= '0' && c <= '9') {
                int end = i + 1;
                while (end < n && (isIdPart(s.charAt(end)) || s.charAt(end) == '.')) end++;
                out.append(s, i, end);
                i = end;
                last = 'a';
                lastWord = "";
                continue;
            }
            if ((c == '?' && s.startsWith("??=", i)) || (c == '|' && s.startsWith("||=", i)) || (c == '&' && s.startsWith("&&=", i))) {
                int stop = out.length();
                while (stop > 0 && Character.isWhitespace(out.charAt(stop - 1))) stop--;
                int start = lhsStart(out, stop);
                if (start < 0 || start >= stop) return null;
                String lhs = out.substring(start, stop);
                out.setLength(start);
                out.append(lhs).append('=').append(lhs).append(s, i, i + 2).append('(');
                closers.add(new Closer(depth));
                i += 3;
                last = '(';
                lastWord = "";
                continue;
            }
            if (c == '?' && !s.startsWith("??", i) && !s.startsWith("?.", i) && !closers.isEmpty() && top(closers).depth == depth) {
                top(closers).ternaries++;
            }
            if (c == ':' && !closers.isEmpty() && top(closers).depth == depth) {
                if (top(closers).ternaries > 0) top(closers).ternaries--;
                else close(out, closers, depth);
            }
            if (c == '(' || c == '[' || c == '{') {
                depth++;
                out.append(c);
                i++;
                last = c;
                lastWord = "";
                continue;
            }
            if (c == ')' || c == ']' || c == '}') {
                close(out, closers, depth);
                if (c == '}' && !templates.isEmpty() && templates.get(templates.size() - 1) == depth) {
                    templates.remove(templates.size() - 1);
                    depth--;
                    out.append('}');
                    i++;
                    templateText = true;
                    continue;
                }
                if (c == '}' && !staticBlocks.isEmpty() && staticBlocks.get(staticBlocks.size() - 1) == depth) {
                    staticBlocks.remove(staticBlocks.size() - 1);
                    depth--;
                    out.append("})();");
                    i++;
                    last = ';';
                    lastWord = "";
                    continue;
                }
                depth--;
                if (depth < 0) return null;
                out.append(c);
                i++;
                last = c;
                lastWord = "";
                continue;
            }
            if (c == ',' || c == ';') {
                close(out, closers, depth);
                out.append(c);
                i++;
                last = c;
                lastWord = "";
                continue;
            }
            if (c == '\n' && !closers.isEmpty() && top(closers).depth == depth && endsExpression(last) && startsStatement(s, i + 1)) {
                close(out, closers, depth);
            }
            out.append(c);
            i++;
            if (!Character.isWhitespace(c)) {
                last = c;
                lastWord = "";
            }
        }
        if (templateText || !templates.isEmpty() || !staticBlocks.isEmpty()) return null;
        while (!closers.isEmpty()) {
            out.append(')');
            closers.remove(closers.size() - 1);
        }
        return out.toString();
    }

    private static Closer top(ArrayList<Closer> closers) {
        return closers.get(closers.size() - 1);
    }

    private static void close(StringBuilder out, ArrayList<Closer> closers, int depth) {
        while (!closers.isEmpty() && top(closers).depth == depth) {
            out.append(')');
            closers.remove(closers.size() - 1);
        }
    }

    /** Début de la cible d'une affectation (a, a.b, a[b].c, f().x…) à la fin de out. */
    private static int lhsStart(StringBuilder out, int stop) {
        int k = stop;
        // Dernier élément lu : 'w' nom, 'g' groupe (…) ou […], '.' point.
        char previous = 0;
        while (k > 0) {
            char c = out.charAt(k - 1);
            if (isIdPart(c)) {
                if (previous == 'w') break;
                while (k > 0 && isIdPart(out.charAt(k - 1))) k--;
                previous = 'w';
            } else if (c == '.') {
                if (previous == '.' || previous == 0) break;
                k--;
                previous = '.';
            } else if (c == ']' || c == ')') {
                // Un nom juste après « ) » ou « ] » commence une nouvelle expression (if(…)x) ;
                // un groupe suivi d'un point, d'un autre groupe ou de rien fait partie de la cible (a[b].c, f().x, a[0]).
                if (previous == 'w') break;
                char open = c == ']' ? '[' : '(';
                int level = 0;
                int j = k - 1;
                for (; j >= 0; j--) {
                    char d = out.charAt(j);
                    if (d == c) level++;
                    else if (d == open && --level == 0) break;
                }
                if (j < 0) return -1;
                k = j;
                previous = 'g';
            } else {
                break;
            }
        }
        if (k >= stop || previous == '.' || previous == 'g' || (out.charAt(k) >= '0' && out.charAt(k) <= '9')) return -1;
        return k;
    }

    private static boolean regexAllowed(char last, String lastWord) {
        if (!lastWord.isEmpty()) {
            return lastWord.equals("return") || lastWord.equals("typeof") || lastWord.equals("instanceof") || lastWord.equals("in")
                || lastWord.equals("of") || lastWord.equals("new") || lastWord.equals("delete") || lastWord.equals("void")
                || lastWord.equals("throw") || lastWord.equals("case") || lastWord.equals("do") || lastWord.equals("else")
                || lastWord.equals("yield") || lastWord.equals("await");
        }
        return !(last == ')' || last == ']' || last == '}' || last == 'a' || last == '"');
    }

    /** Fin d'une expression régulière littérale (drapeaux compris), ou -1. */
    private static int regexEnd(String s, int start) {
        int n = s.length();
        boolean inClass = false;
        for (int i = start + 1; i < n; i++) {
            char c = s.charAt(i);
            if (c == '\n' || c == '\r') return -1;
            if (c == '\\') { i++; continue; }
            if (inClass) { if (c == ']') inClass = false; continue; }
            if (c == '[') { inClass = true; continue; }
            if (c == '/') {
                int end = i + 1;
                while (end < n && Character.isLetter(s.charAt(end))) end++;
                return end;
            }
        }
        return -1;
    }

    private static boolean endsExpression(char last) {
        return last == 'a' || last == '"' || last == ')' || last == ']' || last == '}';
    }

    private static boolean startsStatement(String s, int from) {
        int n = s.length();
        while (from < n && (s.charAt(from) == ' ' || s.charAt(from) == '\t' || s.charAt(from) == '\r' || s.charAt(from) == '\n')) from++;
        return from < n && (isIdStart(s.charAt(from)) || s.charAt(from) == '#');
    }

    private static boolean isIdStart(char c) {
        return Character.isLetter(c) || c == '$' || c == '_' || c == '\\';
    }

    private static boolean isIdPart(char c) {
        return Character.isLetterOrDigit(c) || c == '$' || c == '_' || c == '\\' || c == '\u200c' || c == '\u200d';
    }
}
