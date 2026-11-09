import argparse
from array import array
import ctypes
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import wave
from tempfile import TemporaryDirectory
from threading import Thread
from time import monotonic, sleep
from urllib.parse import parse_qs, urlsplit

from PIL import Image, ImageDraw, ImageGrab
from pywinauto import Application, Desktop
from pywinauto.keyboard import send_keys
import win32api, win32gui, win32con


parser = argparse.ArgumentParser()
parser.add_argument("exe", type=Path)
parser.add_argument("video", type=Path)
parser.add_argument("ffmpeg", type=Path)
parser.add_argument("--mpv", type=Path)
parser.add_argument("--screens", type=Path)
parser.add_argument("--fullscreen-only",action="store_true")
parser.add_argument("--header-only", action="store_true")
parser.add_argument("--tv-quality-only", action="store_true")
parser.add_argument("--external-only",action="store_true")
parser.add_argument("--audio-inspector",type=Path)
args = parser.parse_args()
video = args.video.read_bytes()
external_video=video
events = []
catalog_calls = defaultdict(int)
progress = defaultdict(lambda: 100_000_000, {"profile-b": 0})
played = defaultdict(lambda: True)
favorites = set()

series = {"Id": "teen", "Name": "Teen Wolf", "Type": "Series", "ProductionYear": 2011, "Genres": ["Fantastique", "Drame"],
          "ImageTags": {"Primary": "teen"}, "BackdropImageTags": ["teen"],
          "Overview": "Une morsure change la vie de Scott McCall. Il doit apprendre à maîtriser ses nouveaux pouvoirs."}
episode = {"Id": "episode", "Name": "Abomination", "SeriesId": "teen", "SeriesName": "Teen Wolf", "Type": "Episode",
           "ParentIndexNumber": 2, "IndexNumber": 4, "RunTimeTicks": 1_200_000_000,
           "ParentBackdropItemId": "teen", "ParentBackdropImageTags": ["teen"], "Overview": series["Overview"]}
next_episode = dict(episode, Id="episode-next", Name="Venomous", IndexNumber=5)
movies = [{"Id": key, "Name": title, "Type": "Movie", "ProductionYear": year, "ImageTags": {"Primary": key},
           "BackdropImageTags": [key], "RunTimeTicks": 1_200_000_000}
          for key, title, year in [("film", "Horizon polaire", 2024), ("orbit", "Dernière orbite", 2025),
                                   ("land", "Les Terres lointaines", 2023), ("blue", "Le Grand Bleu", 2024),
                                   ("dawn", "Après l’aube", 2026), ("desert", "Traverse", 2024)]]


def art(key, landscape):
    width, height = (1024, 540) if landscape else (280, 415)
    colors = [(54, 133, 153), (140, 86, 144), (147, 100, 56), (57, 94, 155), (110, 125, 87)]
    color = colors[sum(map(ord, key)) % len(colors)]
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        level = .45 + .55 * (1 - abs(.44 - y / height))
        draw.line((0, y, width, y), fill=tuple(int(v * level) for v in color))
    sun = int(width * (.73 if landscape else .55))
    radius = int(height * .22)
    draw.ellipse((sun - radius, height * .15, sun + radius, height * .15 + radius * 2),
                 fill=tuple(min(255, v + 67) for v in color))
    for index in range(5):
        y = int(height * (.43 + index * .12))
        step = width // 10
        ridge = [(x, y + (x * (index + 5) * 13 % 93)) for x in range(0, width + step, step)]
        draw.polygon(ridge + [(width, height), (0, height)],
                     fill=tuple(int(v * (.66 - index * .12)) for v in color))
    out = BytesIO()
    image.save(out, "JPEG", quality=85)
    return out.getvalue()


artwork = {(item["Id"], kind): art(item["Id"], kind == "Backdrop")
           for item in [series, *movies] for kind in ("Backdrop", "Primary")}


def with_state(item, user):
    return dict(item, UserData={"Played": played[user, item["Id"]], "PlaybackPositionTicks": progress[user]
                                if item["Id"] == "episode" else 0, "IsFavorite": (user, item["Id"]) in favorites})


class Fixture(BaseHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError):
            pass

    def log_message(self, *args):
        pass

    def send(self, body=b"", status=200, content_type="application/json", headers=None):
        if isinstance(body,dict) and "channels" in body:
            for channel in body["channels"]:
                channel.setdefault("country","France")
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, str(value))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def page(self, items):
        self.send({"Items": items, "TotalRecordCount": len(items)})

    @property
    def user(self):
        match = re.search(r'Token="(profile-[ab])"', self.headers.get("Authorization", ""))
        token = self.headers.get("x-noctra-token") or (match[1] if match else None)
        assert token in ("profile-a", "profile-b"), self.path
        return token

    def do_GET(self):
        target = urlsplit(self.path)
        path = target.path
        q = parse_qs(target.query)
        if path == "/api/config":
            return self.send({"jellyfinUrl": origin + "/jellyfin"})
        if path == "/jellyfin/api/config":
            return self.send(b"<html/>", content_type="text/html")
        if path == "/jellyfin/System/Info/Public":
            return self.send({"Version": "10.11.0"})
        if path == "/favicon.ico":
            return self.send(status=204)
        user = "public-fixture" if path == "/fixture-video.webm" else self.user
        if "UserId" in q:
            assert q["UserId"] == [user]
        if path == "/api/session":
            return self.send({"isAdmin": user == "profile-a", "user": {"id": user}})
        if path == "/api/downloads":
            return self.send({"torrents": [{"hash": "a" * 40, "name": "Transfert de test", "progress": .42, "size": 100_000_000,
                                            "state": "downloading"}], "downloadSpeed": 300_000, "uploadSpeed": 120_000, "freeSpace": 50_000_000_000})
        if path == "/api/files/roots":
            assert "external" not in q, "A provider page reached a management API"
            return self.send({"roots": [{"id": "films", "label": "Films", "available": True}]})
        if path == "/api/library/series-status":
            return self.send({"state":"complete", "label":"Complet", "description":"Tous les épisodes diffusés sont présents."})
        if path == "/api/tv/embed/test":
            assert self.headers["x-noctra-token"] == user
            return self.send(b'<!doctype html><html><body style="margin:0;background:#000"><iframe src="/api/tv/embed/nested" style="width:100%;height:100vh;border:0" allow="autoplay;fullscreen"></iframe></body></html>',content_type="text/html")
        if path == "/api/tv/embed/nested":
            assert self.headers["x-noctra-token"] == user
            html = b'''<!doctype html><html><body style="margin:0;background:#000"><video id="main-video" controls autoplay style="width:100%;height:90vh" src="/fixture-video.webm"></video><iframe src="/api/files/roots?external=1" hidden></iframe><script src="/ads/banner.js"></script><div id="opera-scam" style="position:fixed;top:20px;left:20px;width:400px;height:160px;background:white">Veuillez installer Opera One pour continuer</div><div id="dating-bubble" style="position:fixed;right:10px;top:20px;width:270px;height:100px;z-index:2147483647"><svg width="270" height="100"><rect fill="blue" width="270" height="100"/><text x="10" y="50">Faites des rencontres uniques. Devenir membre</text></svg></div><div id="click-layer" class="randoname" style="position:absolute;inset:0;z-index:2147483647"></div><script>window.open('https://popads.net/');setTimeout(()=>{const ad=document.createElement('div');ad.id='second-player';ad.style='position:fixed;top:25%;left:25%;width:420px;height:236px;z-index:2147483647';ad.innerHTML='<video controls autoplay muted style="width:100%;height:100%" src="/fixture-video.webm"></video>';document.body.append(ad);},500);setTimeout(()=>fetch('/api/tv/embed/cosmetic-result?present='+Number(['opera-scam','dating-bubble','click-layer','second-player'].some(id=>document.getElementById(id)))+'&main='+Number(!!document.getElementById('main-video'))),2400);</script></body></html>'''
            if args.external_only and args.audio_inspector:
                # Regular UI stalls should not turn an otherwise continuous tone into audible gaps.
                html = html.replace(b"</body>", b"<script>setInterval(()=>{const end=performance.now()+60;while(performance.now()<end){}},173)</script></body>")
            return self.send(html,content_type="text/html")
        if path == "/api/tv/embed/cosmetic-result":
            events.append(("cosmetic-result",user,{"present":q.get("present"),"main":q.get("main")}))
            return self.send({})
        if path == "/api/tv/oha/embed/mixed-test":
            assert self.headers["x-noctra-token"] == user
            html=b'''<!doctype html><html><body><video autoplay muted style="width:100%"></video><script>fetch('/api/tv/oha/media-resolve').then(r=>r.json()).then(data=>{const url=atob(data.encoded);if(new URL(url).origin===location.origin){document.querySelector('video').src=url;}else{document.body.innerText='Mixed content not rewritten';}});</script></body></html>'''
            return self.send(html,content_type="text/html")
        if path == "/api/tv/oha/media-resolve":
            import base64
            return self.send({"encoded":base64.b64encode(b'http://media.example/fixture.webm').decode()})
        if path == "/ads/banner.js":
            raise AssertionError("An advertising request was not blocked")
        if path == "/api/files":
            return self.send({"root": {"id": "films", "label": "Films"}, "path": "", "parent": None,
                              "items": [{"name": "Collection de test", "path": "Collection de test", "type": "directory", "manageable": True}]})
        if path == "/api/servarr/center":
            return self.send({"items": [{"id": 1, "title": "Film automatisé", "year": 2026, "monitored": True, "status": "Disponible"}]})
        if path == "/jellyfin/Sessions":
            return self.send([{"Id": "session", "UserId": user, "DeviceName": "PC de test", "Client": "Noctra", "SupportsRemoteControl": True}])
        if path == "/api/discovery":
            return self.send({"results": [{"id": 2, "mediaType": "movie", "title": "Éclipse",
                                           "overview": "Sélection de la semaine", "mediaInfo": {"status": 5, "jellyfinMediaId": "film"}}, {"id":99,"mediaType":"movie","title":"Nouveau voyage"}]})
        if path == "/api/jellyseerr/destinations":
            return self.send({"servers":[{"id":1,"name":"Cinéma","isDefault":True,"defaultProfileId":7,"defaultRootFolder":"/films","profiles":[{"id":7,"name":"Haute définition"},{"id":8,"name":"Très haute définition"}],"rootFolders":[{"path":"/films"}]}]})
        if path == "/api/jellyseerr/requests":
            return self.send({"results": [{"id": 22, "displayTitle": "Le Grand Bleu", "status": 1}]})
        if path == "/api/roulette":
            assert q["count"] == ["3"]
            return self.send({"results": [{"id": "orbit", "title": "Dernière orbite"}]})
        if path == "/api/tv/sources":
            tv_provider = [{"id": "witv-public", "name": "WiTV", "section": "channels"}] if args.tv_quality_only else []
            return self.send({"sources": [{"id": "oha-live", "name": "OHA", "section":"channels"}, {"id":"movix-test","name":"Movix test","type":"additional","section":"channels"}, {"id":"progressive-test","name":"Catalogue progressif","section":"channels"}, {"id":"variants-test","name":"Variantes test","section":"channels"}, {"id":"countries-test","name":"Pays test","section":"channels"}, {"id":"quality-test","name":"Qualités test","section":"channels"}, {"id": "broken", "name": "Source indisponible", "section":"channels"}, {"id": "ppv", "name": "PPV", "section":"sports"}] + tv_provider})
        if path == "/api/tv/resolve/witv-fixture":
            events.append(("witv-server-options", user, {}))
            return self.send({"options": [
                {"label": f"Source {number} · à choisir sur WiTV", "playbackType": "external", "manualOnly": True,
                 "url": f"/api/tv/embed/witv-fixture#player{number}", "externalUrl": f"/api/tv/embed/witv-fixture#player{number}"}
                for number in range(1, 4)
            ]})
        if path == "/api/tv/catalog":
            if q.get("source") == ["witv-public"]:
                events.append(("witv-server-catalog", user, {}))
                return self.send({"channels": [{"name": "Chaîne WiTV de test", "provider": "WiTV", "country": "fr",
                                                "resolverUrl": "/api/tv/resolve/witv-fixture"}]})
            if q.get("ref") == ["bouquet-de"]:
                events.append(("german-bouquet",user,{}))
                return self.send({"channels":[{"name":"ZDF régional","country":"Germany","streamUrl":"/api/tv/relay/index.m3u8"}]})
            if q.get("ref") == ["bouquet-fr"]:
                return self.send({"channels":[{"name":"Noctra Bouquet HD .b","provider":"Movix","streamUrl":"/api/tv/relay/dead.m3u8"},{"name":"Noctra Bouquet SD .s","provider":"Movix","streamUrl":"/api/tv/relay/index.m3u8"}]})
            if q["source"] == ["movix-test"]:
                return self.send({"groups":[{"name":"France · test","ref":"bouquet-fr"},{"name":"Germany · test","ref":"bouquet-de"}],"channels":[]})
            if q["source"] == ["countries-test"]:
                return self.send({"channels":[{"name":name,"country":country,"streamUrl":"/api/tv/relay/index.m3u8"} for name,country in [("TF1","France"),("BBC One","United Kingdom"),("ZDF","Germany"),("La Une","France"),("Mystère TV","")]]})
            if q["source"] == ["quality-test"]:
                return self.send({"channels":[{"name":"Qualité multiple","streamUrl":"/api/tv/relay/master.m3u8"}]})
            if q["source"] == ["progressive-test"]:
                catalog_calls["progressive"] += 1
                return self.send({"progressive":catalog_calls["progressive"]==1,"channels":[] if catalog_calls["progressive"]==1 else [{"name":"Chaîne enrichie","streamUrl":"/api/tv/relay/index.m3u8"}]})
            if q["source"] == ["variants-test"]:
                return self.send({"channels":[{"name":["BEIN SPORTS 1 HD .b","beIN Sport 1 France FHD","[FR] beIN Sports 1 SD (backup)"][index%3],"provider":"Variantes test","resolverUrl":"/api/tv/oha/resolve/variant/"+str(index)} for index in range(18)] + [{"name":"beIN Sports 2 HD","streamUrl":"/api/tv/relay/index.m3u8"}]})
            if q["source"] == ["broken"]:
                events.append(("catalog-failed",user,{}))
                return self.send({"error":"Fournisseur temporairement indisponible"},status=503)
            if q["source"] == ["oha-live"]:
                return self.send({"channels": [{"name": "Noctra Première", "provider": "OHA", "eventId":"regular-channel-id", "resolverUrl": "/api/tv/oha/resolve/test"}, {"name":"Accès immédiat","provider":"OHA","streamUrl":"/api/tv/relay/index.m3u8","resolverUrl":"/api/tv/oha/resolve/slow"}]})
            return self.send({"channels": [{"name": "Épreuve du soir", "provider": "PPV", "isEvent": True, "eventId": 27,
                                            "streamUrl": "/api/tv/relay/index.m3u8"}]})
        if path.startswith("/api/tv/oha/resolve/variant/"):
            number=path.rsplit("/",1)[1]
            return self.send({"options":[{"label":"Variante "+number,"streamUrl":"/api/tv/relay/index.m3u8?variant="+number}]})
        if path == "/api/tv/oha/resolve/slow":
            sleep(5)
            return self.send({"options":[]})
        if path == "/api/tv/oha/resolve/test":
            return self.send({"options": [{"label": "Huhu", "streamUrl": "/api/tv/relay/dead.m3u8"},
                                          {"label": "Kool", "streamUrl": "/api/tv/relay/index.m3u8"},
                                          {"label": "HTML incorrect", "streamUrl":"/api/tv/relay/html.m3u8"},
                                          {"label": "Lecteur web", "url":"/api/tv/embed/test", "playbackType":"embed"}],
                              "embeds":[{"label":"Lecteur HTTP", "url":"/api/tv/oha/embed/mixed-test", "playbackType":"embed"}],
                              "serverChoices": [{"label": "Vavoo", "resolveUrl": "/api/tv/oha/resolve/test?mirror=vavoo.top"},
                                                {"label":"Hors ligne", "resolveUrl":"/api/tv/oha/resolve/unavailable"}]})
        if path == "/api/tv/oha/resolve/unavailable":
            return self.send({"error":"Ce serveur TV est hors ligne"},status=502)
        if path == "/api/tv/relay/dead.m3u8":
            events.append(("live-failed", user, {}))
            return self.send(status=404)
        if path == "/api/tv/relay/html.m3u8":
            events.append(("live-html-200",user,{}))
            return self.send(b'<html>Not a video</html>',content_type="text/html")
        if path.startswith("/api/tv/relay/") and path.rsplit("/", 1)[1] in hls:
            assert self.headers["x-noctra-token"] == user
            name = path.rsplit("/", 1)[1]
            events.append(("live-" + name, user, {}))
            return self.send(hls[name], content_type="application/vnd.apple.mpegurl" if name.endswith("m3u8") else "video/mp2t")
        if path == "/jellyfin/Users/Me":
            return self.send({"Id": user, "Name": "Camille" if user == "profile-a" else "Alex"})
        if path == f"/jellyfin/Users/{user}/Items/Resume":
            return self.page([with_state(episode, user)] if user == "profile-a" else [])
        if path == "/jellyfin/Shows/NextUp":
            assert "NextUpDateCutoff" in q and q["EnableRewatching"] == ["true"]
            return self.page([next_episode] if user == "profile-a" else [])
        if path == f"/jellyfin/Users/{user}/Views":
            return self.page([{"Id": "cinema", "Name": "Cinéma", "Type": "CollectionFolder"}, {"Id":"series-lib","Name":"Séries","Type":"CollectionFolder"}])
        if path == "/jellyfin/Items":
            events.append(("catalog-query",user,q))
            term = q.get("SearchTerm", [""])[0].lower()
            types = q["IncludeItemTypes"][0].split(",")
            return self.page([with_state(item, user) for item in [series, *movies]
                              if term in item["Name"].lower() and item["Type"] in types
                              and (not q.get("ParentId") or (item["Type"] == "Series") == (q["ParentId"] == ["series-lib"]))
                              and ("IsFavorite" not in q.get("Filters", [""])[0] or (user, item["Id"]) in favorites)])
        if path.startswith(f"/jellyfin/Users/{user}/Items/"):
            key = path.rsplit("/", 1)[1]
            return self.send(with_state(next(item for item in [series, episode, next_episode, *movies] if item["Id"] == key), user))
        if path == "/jellyfin/Shows/teen/Seasons":
            return self.page([{"Id": "season2", "Name": "Saison 2", "IndexNumber": 2}])
        if path == "/jellyfin/Shows/teen/Episodes":
            if "SeasonId" in q:
                assert q["SeasonId"] == ["season2"]
            return self.page([with_state(episode, user), with_state(next_episode, user)])
        if path == "/jellyfin/MediaSegments/episode":
            return self.page([{"Type": "Intro", "StartTicks": 60_000_000, "EndTicks": 240_000_000}])
        if "/Images/" in path:
            _, _, _, key, _, kind = path.split("/")
            data = artwork.get((key, kind))
            return self.send(data or b"", status=200 if data else 404, content_type="image/jpeg")
        if path in ["/jellyfin/Videos/episode/stream.webm", "/fixture-video.webm", "/api/tv/oha/http/mixed-test"]:
            if path=="/fixture-video.webm":
                assert not self.headers.get("x-noctra-token"),"Session token leaked outside the TV API"
                return self.send(external_video,content_type="video/webm")
            if path == "/fixture-video.webm":
                assert not self.headers.get("x-noctra-token"), "Session token leaked outside the TV API"
            elif path == "/api/tv/oha/http/mixed-test":
                assert self.headers["x-noctra-token"] == user
            else:
                assert q["static"] == ["true"]
            events.append(("stream", user, {}))
            match = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            if match:
                start = int(match[1])
                end = min(int(match[2]), len(video) - 1) if match[2] else len(video) - 1
                return self.send(video[start:end + 1], 206, "video/webm", {
                    "Accept-Ranges": "bytes", "Content-Range": f"bytes {start}-{end}/{len(video)}"})
            return self.send(video, content_type="video/webm", headers={"Accept-Ranges": "bytes"})
        if path == "/jellyfin/Videos/film/stream.webm":
            events.append(("direct-failed", user, {}))
            return self.send(status=404)
        if path.startswith("/jellyfin/Videos/film/") and path.rsplit("/", 1)[1] in hls:
            name = path.rsplit("/", 1)[1]
            events.append((name, user, {}))
            return self.send(hls[name], content_type="application/vnd.apple.mpegurl" if name.endswith("m3u8") else "video/mp2t")
        self.send(status=404)

    def do_POST(self):
        target = urlsplit(self.path)
        path = target.path
        if "/PlayedItems/" in path:
            return self.mark(True)
        if "/FavoriteItems/" in path:
            favorites.add((self.user, path.rsplit("/", 1)[1]))
            return self.send({"IsFavorite": True})
        payload = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if path == "/jellyfin/Users/AuthenticateByName":
            assert payload["Pw"] == "motdepasse", repr(payload["Pw"])
            user = "profile-a" if payload["Username"] == "Camille" else "profile-b"
            return self.send({"User": {"Id": user, "Name": payload["Username"]}, "AccessToken": user})
        user = self.user
        if path.endswith("/PlaybackInfo"):
            q = parse_qs(target.query)
            assert q["UserId"] == [user] and payload["EnableTranscoding"] is True
            assert payload["DeviceProfile"]["TranscodingProfiles"][0]["Protocol"] == "hls"
            events.append(("prepare", user, payload))
            return self.send({"PlaySessionId": "test-session", "MediaSources": [{
                "Id": "source", "Protocol": "File", "Container": "webm", "SupportsDirectPlay": payload["EnableDirectPlay"],
                "TranscodingUrl": "/Videos/film/index.m3u8" if "/film/" in path else None}]})
        events.append((path, user, payload))
        if path.endswith("/Stopped") and payload["ItemId"] == "episode":
            progress[user] = payload["PositionTicks"]
        self.send(status=204)

    def do_DELETE(self):
        self.mark(False)

    def mark(self, value):
        user = self.user
        assert self.path.startswith(f"/jellyfin/Users/{user}/PlayedItems/")
        item_id = self.path.rsplit("/", 1)[1]
        played[user, item_id] = value
        events.append(("mark", user, {"played": value}))
        self.send({"Played": value})


def check_audio_continuity(path):
    with wave.open(str(path)) as recording:
        assert recording.getframerate() == 48000 and recording.getnchannels() == 2
        samples = array("h", recording.readframes(recording.getnframes()))[::2]
    window = 4800
    assert len(samples) >= 48000 * 5, "Audio capture ended early"
    sine = [math.sin(2 * math.pi * 440 * i / 48000) for i in range(window)]
    cosine = [math.cos(2 * math.pi * 440 * i / 48000) for i in range(window)]
    ratios = []
    for start in range(window * 5, len(samples) - window + 1, window):
        block = samples[start:start + window]
        energy = sum(value * value for value in block)
        sin_sum = sum(value * ref for value, ref in zip(block, sine))
        cos_sum = sum(value * ref for value, ref in zip(block, cosine))
        ratios.append(2 * (sin_sum ** 2 + cos_sum ** 2) / (window * energy) if energy else 0)
    continuous = sum(ratio >= .96 for ratio in ratios)
    print(json.dumps({"tone_windows": len(ratios), "continuous_tone_windows": continuous}), flush=True)
    assert continuous >= len(ratios) * .95, "The output tone contains audible discontinuities"


def until(condition, description, timeout=20):
    deadline = monotonic() + timeout
    last = None
    while monotonic() < deadline:
        try:
            result = condition()
            if result:
                return result
        except Exception as error:
            last = error
        sleep(.15)
    raise AssertionError(f"{description} (last UI error: {last})")


def control(auto_id, kind=None):
    return window.child_window(auto_id=auto_id, **({"control_type": kind} if kind else {}))


def by_name(name, kind="Button", **params):
    return window.child_window(title=name, control_type=kind, **params)


def login(name, remember=False):
    until(lambda: control("SignInButton").is_enabled(), "Sign-in form unavailable")
    control("Username").set_edit_text(name)
    password = control("Password").wrapper_object()
    password.click_input()
    password.set_focus()
    send_keys("motdepasse", pause=.05, vk_packet=False)
    if remember:
        control("Remember").toggle()
    control("SignInButton").invoke()


def report(kind, item, method=None):
    return next((p for path, user, p in events if path == "/jellyfin/Sessions/Playing" + kind and
                 user == "profile-a" and p["ItemId"] == item and (method is None or p["PlayMethod"] == method)), None)


def screenshot(name):
    if args.screens:
        args.screens.mkdir(parents=True, exist_ok=True)
        window.set_focus()
        sleep(.5)
        window.capture_as_image().save(args.screens / f"{name}.png")


def monitor_rect(target):
    return tuple(win32api.GetMonitorInfo(win32api.MonitorFromWindow(target.handle,2))["Monitor"])

def check_header_layout():
    dpi=ctypes.windll.user32.GetDpiForWindow(window.handle)/96
    measured=[]
    for width in [920,1000,1320,1600,1920,2560]:
        win32gui.SetWindowPos(window.handle,0,40,40,round(width*dpi),round(880*dpi),win32con.SWP_NOZORDER)
        sleep(.25)
        controls=[control(name).rectangle() for name in ["HomeTab","LibraryTab","DiscoverTab","TvTab","MoreTab","SearchBox","ProfileButton"]]
        assert all(rect.height() >= 44*dpi-2 for rect in controls),(width,controls)
        assert abs(controls[-1].height()-controls[-2].height())<=1,(width,controls)
        assert controls[4].right < controls[5].left,"Header controls overlap at width "+str(width)
        assert all(abs((rect.top+rect.bottom)-(controls[0].top+controls[0].bottom))<=2 for rect in controls),"Header controls are vertically misaligned"
        close=control("CaptionClose").rectangle()
        assert close.right<=win32gui.GetWindowRect(window.handle)[2],"Caption exceeds the window"
        measured.append({"width_dip":width,"control_height_px":controls[0].height(),"caption_height_px":close.height()})
        if args.header_only and width in [1000,1920]: screenshot("bandeau-"+str(width))
    win32gui.ShowWindow(window.handle,win32con.SW_MAXIMIZE)
    sleep(.5)
    work=win32api.GetMonitorInfo(win32api.MonitorFromWindow(window.handle,2))["Work"]
    close=control("CaptionClose").rectangle()
    screenshot("bandeau-agrandi")
    assert close.top>=work[1] and close.right<=work[2],f"Maximized caption is cropped: {close}, work={work}"
    win32gui.ShowWindow(window.handle,win32con.SW_RESTORE)
    win32gui.SetWindowPos(window.handle,0,80,40,round(1320*dpi),round(880*dpi),win32con.SWP_NOZORDER)
    print(json.dumps({"header_layout":"pass","dpi":dpi,"sizes":measured,"maximized_caption_visible":True}),flush=True)


def popup_buttons():
    return [button for root in Desktop(backend="uia").windows() if root.process_id()==process.pid
            for button in root.descendants(control_type="Button") if button.element_info.automation_id=="FullscreenButton"]


def idle_tv_controls():
    video=window.child_window(title="Surface vidéo",control_type="Pane").rectangle()
    win32api.SetCursorPos(((video.left+video.right)//2,(video.top+video.bottom)//2))
    sleep(3.3)
    until(lambda:not popup_buttons(),"TV controls remained over the idle video",timeout=3)
    win32api.SetCursorPos((video.left+200,video.bottom-40))
    until(lambda:len(popup_buttons())>=1,"Mouse movement did not restore TV controls")


def check_tv_variants():
    control("TvTab").invoke()
    until(lambda:by_name("Variantes test").exists(timeout=.1),"Variant source missing")
    by_name("Variantes test").invoke()
    def variant_cards():
        return [button for button in window.descendants(control_type="Button") if button.window_text().lower().startswith('bein')]
    until(lambda:len(variant_cards())==2,"Variant cards are not grouped by channel")
    next(button for button in variant_cards() if '1' in button.window_text()).invoke()
    until(lambda:window.child_window(title_re="18 variante.*",control_type="Text").exists(timeout=.1),"Variants were discarded")
    assert len([button for button in window.descendants(control_type="Button") if button.element_info.automation_id.startswith('NativeServer')])>=18,"Not all variants are selectable servers"


def check_tv_provider_options():
    control("TvTab").invoke()
    until(lambda: by_name("WiTV").exists(timeout=.1), "WiTV source missing")
    by_name("WiTV").invoke()
    until(lambda: by_name("Chaîne WiTV de test").exists(timeout=.1), "WiTV catalogue did not come from Noctra")
    by_name("Chaîne WiTV de test").invoke()
    for number in range(1, 4):
        until(lambda: by_name(f"WiTV · Source {number} · à choisir sur WiTV").exists(timeout=.1),
              f"Server option {number} missing")
    assert {"witv-server-catalog", "witv-server-options"} <= {name for name, _, _ in events}
    assert not by_name("▶   Lire le direct").is_enabled()
    assert not window.child_window(title="Noctra · Lecteur externe", control_type="Window").exists(timeout=.1)
    print("OK · Windows receives the WiTV catalog and three separate manual options from the Noctra API.", flush=True)


def check_tv_countries_and_qualities():
    control("TvTab").invoke()
    until(lambda:control("TvCountry").exists(timeout=.1),"Country selector is missing")
    until(lambda:by_name("TF1").exists(timeout=.1),"French channels missing")
    assert control("TvCountry").selected_text()=="France"
    assert not by_name("BBC One").exists(timeout=.1) and not by_name("La Une").exists(timeout=.1),"Foreign channels leak into France"
    assert not any(name=="german-bouquet" for name,_,_ in events),"Foreign bouquets loaded before they were requested"
    control("TvCountry").select("Royaume-Uni")
    until(lambda:by_name("BBC One").exists(timeout=.1),"UK selection has no BBC channel")
    assert not by_name("TF1").exists(timeout=.1)
    control("TvCountry").select("Allemagne")
    until(lambda:by_name("ZDF régional").exists(timeout=.1),"German bouquet did not load after country selection")
    control("TvCountry").select("Belgique")
    until(lambda:by_name("La Une").exists(timeout=.1),"Belgian French-language channel classified as France")
    control("TvCountry").select("Pays non précisé")
    until(lambda:by_name("Mystère TV").exists(timeout=.1),"Unknown country channels cannot be accessed")
    control("TvTab").invoke()
    until(lambda:by_name("Qualité multiple").exists(timeout=.1),"Adaptive TV fixture missing")
    by_name("Qualité multiple").invoke()
    until(lambda:window.child_window(title_re="Image reçue.*1080p.*Qualités annoncées.*720p.*360p.*",control_type="Text").exists(timeout=.1),"Server check does not list all HLS qualities",timeout=30)
    by_name("▶   Lire le direct").invoke()
    until(lambda:"1080p" in control("PlaybackMode").window_text(),"Highest HLS quality was not selected by default",timeout=30)
    def menu_items():
        return [item for root in Desktop(backend="uia").windows() if root.process_id()==process.pid for item in root.descendants(control_type="MenuItem")]
    def open_qualities():
        rectangle=window.child_window(title="Surface vidéo",control_type="Pane").rectangle()
        win32api.SetCursorPos((rectangle.left+200,rectangle.bottom-30))
        def button():
            return next((item for root in Desktop(backend="uia").windows() if root.process_id()==process.pid for item in root.descendants(control_type="Button") if item.element_info.automation_id=="LiveQualityButton"),None)
        until(button,"Quality button missing").invoke()
        until(lambda:len(menu_items())>=4,"Quality menu is empty")
        return menu_items()
    items=open_qualities()
    assert all(any(item.window_text().startswith(str(height)+"p") for item in items) for height in [1080,720,360]),"Some HLS renditions are missing"
    next(item for item in items if item.window_text().startswith("720p")).invoke()
    until(lambda:"720p" in control("PlaybackMode").window_text(),"Quality selection did not switch to 720p")
    items=open_qualities();next(item for item in items if item.window_text().startswith("Auto")).invoke()
    until(lambda:"1080p" in control("PlaybackMode").window_text(),"Automatic quality did not restore 1080p")
    control("ReturnButton").invoke()
    until(lambda:control("TvTab").is_visible(),"TV navigation was not restored after quality switching")
    print("OK · France by default, selectable countries/bouquets/unknowns, all HLS qualities, 1080p default and live 720p/1080p switching.",flush=True)


def enter_native_fullscreen():
    target=window
    original=tuple(win32gui.GetWindowRect(target.handle))
    target.set_focus()
    window.child_window(title="Surface vidéo",control_type="Pane").click_input()
    send_keys("{F11}")
    until(lambda:tuple(win32gui.GetWindowRect(target.handle))==monitor_rect(target),"Native fullscreen did not cover the monitor")
    assert not control("CaptionClose").exists(timeout=.1),"Caption remained in fullscreen"
    # Leave the pointer in the center, outside the controls, and allow idle controls to disappear.
    bounds=monitor_rect(target);win32api.SetCursorPos(((bounds[0]+bounds[2])//2,(bounds[1]+bounds[3])//2))
    sleep(3.3)
    until(lambda:not popup_buttons(),"Fullscreen controls remained over the idle video",timeout=3)
    screenshot("tv-plein-ecran")
    video_rect=window.child_window(title="Surface vidéo",control_type="Pane").rectangle()
    assert (video_rect.left,video_rect.top,video_rect.right,video_rect.bottom)==monitor_rect(target),"Video did not fill the monitor after controls hid"
    win32api.SetCursorPos((bounds[0]+200,bounds[3]-40))
    until(lambda:len(popup_buttons())>=1,"Mouse movement did not restore fullscreen controls")
    send_keys("{ESC}")
    until(lambda:control("CaptionClose").exists(timeout=.1),"Escape did not restore the caption")
    until(lambda:tuple(win32gui.GetWindowRect(target.handle))==original,"Window placement was not restored")
    return True


def open_app(profile, address=None):
    command = [str(args.exe.resolve())]
    if address:
        command += ["--server", address]
    process = subprocess.Popen(command, env={**os.environ, "NOCTRA_WINDOWS_DATA": str(profile)})
    try:
        app = Application(backend="uia").connect(process=process.pid, timeout=30)
        dialog = app.window(title="Noctra", control_type="Window")
        dialog.wait("visible", timeout=30)
        return process, app.window(handle=dialog.handle)
    except Exception:
        process.terminate();process.wait(timeout=10)
        raise


with TemporaryDirectory(prefix="native-smoke-", dir=Path.cwd()) as temporary:
    profile = Path(temporary)
    hls_dir = profile / "hls"
    hls_dir.mkdir()
    external_path=profile/"external-audio.webm"
    subprocess.run([str(args.ffmpeg.resolve()),"-v","error","-i",str(args.video.resolve()),"-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","120","-c:v","copy","-af","volume=0.02","-c:a","libopus","-ac","2",str(external_path)],check=True)
    external_video=external_path.read_bytes()
    subprocess.run([str(args.ffmpeg.resolve()), "-v", "error", "-i", str(args.video.resolve()), "-t", "30",
                    "-vf", "scale=480:-2", "-c:v", "libx264", "-preset", "ultrafast", "-g", "48",
                    "-c:a", "aac", "-output_ts_offset", "17", "-hls_time", "4", "-hls_list_size", "0", str(hls_dir / "index.m3u8")], check=True)
    hls = {file.name: file.read_bytes() for file in hls_dir.iterdir()}
    if not args.header_only and not args.external_only:
        for height in [360,720,1080]:
            subprocess.run([str(args.ffmpeg.resolve()),"-v","error","-i",str(args.video.resolve()),"-t","30","-vf",f"scale=-2:{height}","-c:v","libx264","-threads","2","-preset","ultrafast","-g","48","-c:a","aac","-hls_time","4","-hls_list_size","0",str(hls_dir/f"quality{height}.m3u8")],check=True)
        hls={file.name:file.read_bytes() for file in hls_dir.iterdir()}
        hls["master.m3u8"]=b'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360\nquality360.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\nquality720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nquality1080.m3u8\n'
    if args.mpv:
        shutil.copyfile(args.mpv, profile / "libmpv-2.dll")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    origin = f"http://127.0.0.1:{server.server_port}"
    Thread(target=server.serve_forever, daemon=True).start()
    process = window = main_handle = None
    try:
        process, window = open_app(profile, origin)
        main_handle=window.handle
        app = Application(backend="uia").connect(process=process.pid, timeout=20)
        screenshot("connexion")
        login("Camille", remember=True)
        until(lambda: by_name("CONTINUER À REGARDER", "Text").exists(timeout=.1), "Personal resume not visible")
        until(lambda: by_name("À suivre", "Text").exists(timeout=.1), "Next Up not visible")
        until(lambda: window.child_window(title_re=".*Venomous", control_type="Text").exists(timeout=.1), "Second episode missing")
        assert b"profile-a" not in (profile / "account.dat").read_bytes()
        check_header_layout()
        if args.header_only:
            window.close(); process.wait(timeout=12)
            print("OK · Responsive header, control alignment and maximized caption visibility.",flush=True)
            raise SystemExit(0)
        if args.tv_quality_only:
            check_tv_provider_options()
            check_tv_countries_and_qualities()
            window.close();process.wait(timeout=12)
            raise SystemExit(0)
        if args.external_only:
            control("TvTab").invoke();until(lambda:by_name("Noctra Première").exists(timeout=.1),"TV fixture missing");by_name("Noctra Première").invoke()
            until(lambda:by_name("OHA · Lecteur web").exists(timeout=.1),"External server missing");by_name("OHA · Lecteur web").invoke()
            external=window.child_window(title="Noctra · Lecteur externe",control_type="Window");external.wait("visible",timeout=20)
            until(lambda:external.child_window(auto_id="ExternalPlaybackStatus").window_text().startswith("Image reçue"),"External video missing",timeout=35)
            until(lambda:any(name=="cosmetic-result" and body.get("present")==["0"] and body.get("main")==["1"] for name,_,body in events),"Advertising overlays or floating video remain")
            until(lambda:external.child_window(auto_id="ExternalAudioStatus").element_info.element.CurrentHelpText=="Signal audio reçu par Noctra","Audio is not rendered through Noctra",timeout=20)
            if args.audio_inspector:
                measured=json.loads(subprocess.check_output(["dotnet",str(args.audio_inspector),str(process.pid)],text=True))
                assert measured and any(row["name"]=="Noctra" and row["peak"]>0.00001 for row in measured),measured
                print(json.dumps({"native_audio_sessions":measured}),flush=True)
                capture = profile / "audio-continuity.wav"
                subprocess.run(["dotnet", str(args.audio_inspector), "--capture", str(process.pid), "6000", str(capture)], check=True, timeout=16)
                check_audio_continuity(capture)
            external.capture_as_image().save(args.screens/"lecteur-externe.png") if args.screens else None
            external.close();window.close();process.wait(timeout=12)
            print("OK · Nested external video, delayed SVG/click/floating-video ads removed, main player preserved and real PCM rendered by Noctra.",flush=True)
            raise SystemExit(0)
        screenshot("accueil")
        headings = [element.window_text() for element in window.descendants(control_type="Text")]
        assert headings.index("Ajouts récents · Cinéma") < headings.index("Ajouts récents · Séries") < headings.index("À suivre") < headings.index("Vos médiathèques")
        window=app.window(handle=window.handle)
        if args.fullscreen_only:
            check_tv_variants()
            control("TvTab").invoke()
            until(lambda:by_name("Noctra Première").exists(timeout=.1),"TV channel missing")
            by_name("Noctra Première").invoke()
            until(lambda:by_name("▶   Lire le direct").is_enabled(),"Stream choices missing")
            by_name("▶   Lire le direct").invoke()
            until(lambda:control("PlaybackMode").window_text().startswith("EN DIRECT"),"TV playback missing")
            idle_tv_controls()
            enter_native_fullscreen()
            target=window
            win32gui.ShowWindow(target.handle,win32con.SW_MAXIMIZE);sleep(.3)
            enter_native_fullscreen()
            assert win32gui.GetWindowPlacement(target.handle)[1]==win32con.SW_SHOWMAXIMIZED
            control("ReturnButton").invoke()
            by_name("OHA · Lecteur web").invoke()
            external=window.child_window(title="Noctra · Lecteur externe",control_type="Window");external.wait("visible",timeout=15)
            until(lambda:external.child_window(auto_id="ExternalPlaybackStatus").window_text().startswith("Image reçue"),"External video missing",timeout=30)
            external.child_window(title="Plein écran",control_type="Button").invoke()
            until(lambda:tuple(win32gui.GetWindowRect(external.handle))==monitor_rect(external),"External fullscreen bounds")
            external.child_window(auto_id="ExternalVideo").click_input();send_keys("{ESC}")
            until(lambda:external.child_window(auto_id="ExternalClose",control_type="Button").exists(timeout=.1),"External fullscreen escape")
            external.close();window.close();process.wait(timeout=12)
            print("OK · Native and external TV fullscreen, idle controls, video focus keys, normal/maximized restoration and header geometry.",flush=True)
            raise SystemExit(0)
        control("PrimaryPlayback", "Button").invoke()
        if not args.mpv:
            until(lambda: control("InstallButton").is_visible(), "Install action missing")
            control("InstallButton").invoke()
        until(lambda: report("", "episode", "DirectPlay"), "Direct playback did not start", timeout=110)
        assert report("", "episode")["PositionTicks"] >= 95_000_000
        until(lambda: control("SkipCredits").is_visible(), "Skip credits button not visible")
        control("SkipCredits").invoke()
        until(lambda: "0:00:24" in control("PositionLabel").window_text() or "0:00:25" in control("PositionLabel").window_text(),
              "Skip credits did not seek")
        screenshot("lecture")
        control("PauseButton").invoke()
        until(lambda: control("PauseButton").window_text() == "Reprendre", "Pause failed")
        control("ReturnButton").invoke()
        until(lambda: report("/Stopped", "episode"), "Stop report missing")
        assert report("/Stopped", "episode")["PositionTicks"] >= 235_000_000
        until(lambda: control("LibraryTab").is_visible(), "Returned to library")
        control("LibraryTab").invoke()
        by_name("Séries").invoke()
        until(lambda: by_name("Teen Wolf").exists(timeout=.1), "Series card missing")
        by_name("Teen Wolf").invoke()
        until(lambda: by_name("S02 E04 · Abomination", "Text").exists(timeout=.1), "Season episodes missing")
        window.child_window(title="Marquer non vu", control_type="Button", found_index=0).invoke()
        until(lambda: not played["profile-a", "episode"], "Mark unplayed did not persist")
        by_name("♡  Ajouter aux favoris").invoke()
        until(lambda: ("profile-a", "teen") in favorites, "Favorite was not written")
        screenshot("serie")
        assert not control("FavoritesTab").exists(timeout=.1), "Ma liste remains in the navigation"
        control("MoreTab").invoke()
        by_name("Favoris").invoke()
        until(lambda: by_name("Teen Wolf").exists(timeout=.1), "Favorite not listed")
        control("SearchBox").set_edit_text("Horizon")
        by_name("Rechercher").invoke()
        until(lambda: by_name("Horizon polaire").exists(timeout=.1), "Search result missing")
        by_name("Horizon polaire").invoke()
        until(lambda: window.child_window(title_re=r"^▶\s+Lire$", control_type="Button").exists(timeout=.1), "Film detail missing")
        window.child_window(title_re=r"^▶\s+Lire$", control_type="Button").invoke()
        until(lambda: report("", "film", "Transcode"), "HLS fallback did not start")
        assert any(event[0] == "direct-failed" for event in events)
        assert any(event[0].endswith(".ts") for event in events)
        control("ReturnButton").invoke()
        until(lambda: report("/Stopped", "film"), "HLS stop report missing")
        until(lambda: control("LibraryTab").is_visible(), "Returned to catalog after HLS")
        control("LibraryTab").invoke()
        until(lambda: by_name("Cinéma").exists(timeout=.1), "Library not displayed")
        by_name("Cinéma").invoke()
        until(lambda: by_name("Horizon polaire").exists(timeout=.1), "Library contents not displayed")
        control("DiscoverTab").invoke()
        until(lambda: by_name("Éclipse").exists(timeout=.1), "Discovery items missing")
        by_name("Nouveau voyage").invoke()
        until(lambda:by_name("Demander ce titre").exists(timeout=.1),"Request entry point missing")
        by_name("Demander ce titre").invoke()
        until(lambda:control("RequestQuality").exists(timeout=.1),"Native request form missing")
        assert control("RequestDestination").selected_text() == "Cinéma"
        quality=control("RequestQuality")
        quality.expand()
        screenshot("menu-qualite")
        quality.select("Très haute définition")
        assert quality.selected_text() == "Très haute définition"
        control("RequestSubmit").invoke()
        until(lambda:any(name=="/api/jellyseerr/request" for name,_,_ in events),"The request was not submitted")
        body=next(body for name,_,body in events if name=="/api/jellyseerr/request")
        assert body["profileId"] == 8 and body["rootFolder"] == "/films" and body["selectionMode"] == "auto"
        by_name("Suivre ma demande").invoke()
        control("DiscoverTab").invoke()
        until(lambda:by_name("Roulette").exists(timeout=.1),"Discovery navigation missing")
        by_name("Roulette").invoke()
        by_name("Lancer la roulette").invoke()
        until(lambda: by_name("Dernière orbite").exists(timeout=.1), "Roulette result missing")
        control("BackButton").invoke()
        by_name("Mes demandes").invoke()
        until(lambda: by_name("Le Grand Bleu · En attente", "Text").exists(timeout=.1), "Requests not displayed")
        control("TvTab").invoke()
        until(lambda: by_name("Noctra Première").exists(timeout=.1), "Channel missing")
        until(lambda:sum(name=="catalog-failed" for name,_,_ in events)>=2,"A failing source did not exercise the bounded GET retry")
        check_tv_countries_and_qualities()
        check_tv_variants()
        control("TvTab").invoke()
        by_name("Movix test").invoke()
        until(lambda:by_name("France · test").exists(timeout=.1),"Movix bouquets are hidden")
        by_name("France · test").invoke()
        until(lambda:by_name("Noctra Bouquet").exists(timeout=.1),"Movix bouquet did not open")
        control("TvTab").invoke()
        by_name("Catalogue progressif").invoke()
        until(lambda:by_name("Chaîne enrichie").exists(timeout=.1),"Progressive catalogs did not refresh")
        control("TvTab").invoke()
        until(lambda:by_name("Accès immédiat").exists(timeout=.1),"Immediate channel missing")
        started=monotonic(); by_name("Accès immédiat").invoke()
        until(lambda:by_name("▶   Lire le direct").is_enabled(),"Known streams waited for a slow resolver",timeout=2)
        assert monotonic()-started<3,"Server selection still blocks on all resolvers"
        control("TvTab").invoke()
        until(lambda:by_name("Noctra Première").exists(timeout=.1),"Channel missing after navigation")
        by_name("Noctra Première").invoke()
        until(lambda: by_name("OHA · Vavoo").exists(timeout=.1), "A named mirror is missing")
        by_name("OHA · Hors ligne").invoke()
        until(lambda:by_name("Ce serveur TV est hors ligne","Text").exists(timeout=.1),"A failed resolver did not preserve the TV menu")
        until(lambda: window.child_window(title_re="Image reçue.*",control_type="Text").exists(timeout=.1), "No decoded image from the server health test",timeout=25)
        until(lambda:any(name=="live-html-200" for name,_,_ in events),"The HTTP 200 HTML response was not probed")
        until(lambda:sum(element.window_text().startswith("Aucune image reçue") for element in window.descendants(control_type="Text")) >= 2,"A false HTTP 200 stream was not rejected")
        by_name("OHA · Lecteur web").invoke()
        external=window.child_window(title="Noctra · Lecteur externe",control_type="Window")
        external.wait("visible",timeout=15)
        until(lambda: external.child_window(auto_id="ExternalPlaybackStatus").window_text().startswith("Image reçue"),"External embedded video did not play",timeout=35)
        until(lambda:any(name=="cosmetic-result" and body.get("present")==["0"] for name,_,body in events),"The fake Opera installation overlay remained visible")
        assert int(external.child_window(auto_id="BlockedRequestCount").window_text().split()[0]) >= 3
        if args.screens:
            external.capture_as_image().save(args.screens/"lecteur-externe.png")
        external_original=tuple(win32gui.GetWindowRect(external.handle))
        external.child_window(title="Plein écran",control_type="Button").invoke()
        until(lambda:tuple(win32gui.GetWindowRect(external.handle))==monitor_rect(external),"External fullscreen does not cover the monitor")
        assert not external.child_window(auto_id="ExternalClose",control_type="Button").exists(timeout=.1),"External header remained in fullscreen"
        external.child_window(auto_id="ExternalVideo").click_input()
        send_keys("{ESC}")
        until(lambda:external.child_window(auto_id="ExternalClose",control_type="Button").exists(timeout=.1),"External escape did not restore controls")
        until(lambda:tuple(win32gui.GetWindowRect(external.handle))==external_original,"External window placement was not restored")
        external.close()
        by_name("OHA · Lecteur HTTP").invoke()
        external=window.child_window(title="Noctra · Lecteur externe",control_type="Window")
        external.wait("visible",timeout=15)
        until(lambda:external.child_window(auto_id="ExternalPlaybackStatus").window_text().startswith("Image reçue"),"OHA mixed-content compatibility failed",timeout=30)
        external.close()
        window.child_window(title="Multivue +",control_type="Button",found_index=1).invoke()
        by_name("Lancer la multivue").invoke()
        multi=window.child_window(title="Noctra · Multivue",control_type="Window")
        try:
            multi.wait("visible",timeout=12)
        except Exception:
            screenshot("multivue-echec")
            print("Multiview windows:", [(item.window_text(), item.element_info.control_type) for item in Desktop(backend="uia").windows() if item.process_id()==process.pid], flush=True)
            raise
        until(lambda:any(name.startswith("live-") and name.endswith(".ts") for name,_,_ in events),"Multiview did not receive media")
        multi.close()
        control("TvTab").invoke()
        until(lambda: by_name("Noctra Première").exists(timeout=.1), "Channel missing after multiview")
        by_name("Noctra Première").invoke()
        live_event_start = len(events)
        by_name("▶   Lire le direct").invoke()
        until(lambda: any(name.startswith("live-") and name.endswith(".ts") for name, _, _ in events[live_event_start:]), "Live HLS fallback missing")
        assert any(name == "live-failed" for name, _, _ in events), "Unavailable mirror was not detected"
        until(lambda: control("PlaybackMode").window_text().startswith("EN DIRECT"), "TV did not start")
        idle_tv_controls()
        enter_native_fullscreen()
        target=window
        win32gui.ShowWindow(target.handle,win32con.SW_MAXIMIZE)
        sleep(.3)
        enter_native_fullscreen()
        assert win32gui.GetWindowPlacement(target.handle)[1]==win32con.SW_SHOWMAXIMIZED,"Maximized state was not restored"
        win32gui.ShowWindow(target.handle,win32con.SW_RESTORE)
        control("ReturnButton").invoke()
        until(lambda: control("TvTab").is_visible(), "Returned to TV catalog")
        control("TvTab").invoke()
        by_name("Sports et PPV").invoke()
        until(lambda: by_name("Épreuve du soir").exists(timeout=.1), "PPV item missing")
        screenshot("tv")
        control("MoreTab").invoke()
        until(lambda: by_name("Téléchargements").exists(timeout=.1), "Administrative tools missing")
        by_name("Téléchargements").invoke()
        until(lambda: by_name("Transfert de test", "Text").exists(timeout=.1), "Download list missing")
        control("MoreTab").invoke()
        by_name("Fichiers").invoke()
        until(lambda: by_name("Collection de test", "Text").exists(timeout=.1), "File explorer missing")
        control("MoreTab").invoke()
        by_name("Automatisation").invoke()
        until(lambda: by_name("Film automatisé", "Text").exists(timeout=.1), "Automation list missing")
        window.close()
        process.wait(timeout=12)
        sleep(.4)

        process, window = open_app(profile)
        until(lambda: control("ProfileName").window_text() == "Camille", "Encrypted session was not restored")
        by_name("Profil et réglages").invoke()
        by_name("Se déconnecter").invoke()
        until(lambda: not (profile / "account.dat").exists(), "Sign-out did not remove encrypted session")
        control("ServerSettings").wrapper_object().iface_expand_collapse.Expand()
        control("ServerAddress").set_edit_text(origin + "/jellyfin")
        login("Alex")
        until(lambda: by_name("Vos films et épisodes en cours apparaîtront ici.", "Text").exists(timeout=.1), "Second profile was not empty")
        until(lambda: by_name("Les prochains épisodes de vos séries apparaîtront ici.", "Text").exists(timeout=.1), "Next Up was not isolated")
        assert not window.child_window(title_re=".*Venomous", control_type="Text").exists(timeout=.1)
        assert not (profile / "account.dat").exists(), "A new profile inherited the previous profile's remember setting"
        window.close()
        process.wait(timeout=12)
        print("OK · WPF navigation, isolated profiles, DPAPI, resume, watched state, favorites, seasons, search, discovery, requests, TV mirrors, multiview, live HLS fallback, PPV and administration pages.")
    except Exception:
        if main_handle and process is not None:
            print(json.dumps({"process_exit":process.poll(),"window_exists":bool(win32gui.IsWindow(main_handle)),"native_title":win32gui.GetWindowText(main_handle) if win32gui.IsWindow(main_handle) else ""}),flush=True)
            if args.screens and win32gui.IsWindow(main_handle):
                ImageGrab.grab(bbox=win32gui.GetWindowRect(main_handle),all_screens=True).save(args.screens/"echec-natif.png")
        if window is not None:
            try:
                screenshot("echec")
                print(json.dumps({"visible_messages":[element.window_text() for element in window.descendants(control_type="Text")][-16:],"last_queries":[body for name,_,body in events if name=="catalog-query"][-3:]},ensure_ascii=True),flush=True)
            except Exception:
                pass
        raise
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        server.shutdown()

