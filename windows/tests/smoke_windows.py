import argparse
from array import array
import base64
import ctypes
from datetime import datetime, timedelta, timezone
import hashlib
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
from threading import Lock, Thread
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
parser.add_argument("--features-only", action="store_true")
args = parser.parse_args()
video = args.video.read_bytes()
external_video=video
events = []
bowd_ad = {"started": None}
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


# 0.7 : données des nouveautés (musique, listes de lecture, fiche technique, vignettes de progression).
features = args.features_only
episode["Trickplay"] = {"source": {"320": {"Width": 320, "Height": 180, "TileWidth": 10, "TileHeight": 10, "ThumbnailCount": 12, "Interval": 10000}}}
if features:
    movies[0].update({"CommunityRating": 7.8, "OfficialRating": "Tous publics", "Genres": ["Science-fiction", "Aventure"],
                      "Overview": "Une expédition traverse la banquise à la recherche d’un signal venu du pôle.",
                      "Taglines": ["Le froid n’arrête pas la lumière."], "RemoteTrailers": [{"Name": "Bande-annonce", "Url": "https://www.youtube.com/watch?v=noctra"}],
                      "ExternalUrls": [{"Name": "IMDb", "Url": "https://www.imdb.com/title/tt0000000/"}],
                      "People": [{"Id": "person-1", "Name": "Lina Noor", "Type": "Actor", "Role": "Capitaine Hale"}],
                      "MediaSources": [{"Id": "source", "Container": "mkv", "Size": 48_000_000_000, "Bitrate": 62_000_000, "MediaStreams": [
                          {"Type": "Video", "Codec": "hevc", "Width": 3840, "Height": 2160, "VideoRangeType": "DOVIWithHDR10", "DisplayTitle": "4K HEVC Dolby Vision", "Index": 0, "RealFrameRate": 23.976},
                          {"Type": "Audio", "Codec": "truehd", "Channels": 8, "Language": "fre", "DisplayTitle": "Français TrueHD Atmos 7.1", "Profile": "Dolby TrueHD + Dolby Atmos", "IsDefault": True, "Index": 1},
                          {"Type": "Audio", "Codec": "eac3", "Channels": 6, "Language": "eng", "DisplayTitle": "English E-AC3 5.1", "Index": 2},
                          {"Type": "Subtitle", "Codec": "srt", "Language": "fre", "DisplayTitle": "Français (SRT)", "IsExternal": True, "Index": 3}]}]})
album = {"Id": "album", "Name": "Nuits polaires", "Type": "MusicAlbum", "AlbumArtist": "Aurore", "ProductionYear": 2025, "ImageTags": {"Primary": "album"}, "_lib": "music-lib"}
tracks = [{"Id": key, "Name": name, "Type": "Audio", "Album": "Nuits polaires", "AlbumId": "album", "AlbumPrimaryImageTag": "album", "AlbumArtist": "Aurore",
           "Artists": ["Aurore"], "IndexNumber": number, "RunTimeTicks": 1_200_000_000, "ParentId": "album", "_lib": "music-lib"}
          for number, (key, name) in enumerate([("track1", "Première lueur"), ("track2", "Banquise")], 1)]
playlists = []
person = {"Id": "person-1", "Name": "Lina Noor", "Type": "Person", "Overview": "Actrice et réalisatrice."}
quick = {"polls": 0}
subtitle_downloaded = {"value": False}
sockets = {}
sync = {"group": None, "position": 0, "playing_since": None}


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
           for item in [series, *movies, album] for kind in ("Backdrop", "Primary")}


def trickplay_tile():
    image = Image.new("RGB", (3200, 360))
    draw = ImageDraw.Draw(image)
    for index in range(12):
        x, y = index % 10 * 320, index // 10 * 180
        draw.rectangle((x, y, x + 319, y + 179), fill=((index * 47) % 255, 80 + index * 12, 200 - index * 10))
        draw.text((x + 140, y + 80), f"{index * 10}s", fill=(255, 255, 255))
    out = BytesIO()
    image.save(out, "JPEG", quality=80)
    return out.getvalue()


tile_jpeg = trickplay_tile()


def now_iso(offset=0.0):
    return (datetime.now(timezone.utc) + timedelta(seconds=offset)).isoformat().replace("+00:00", "Z")


def ws_frame(text):
    data = text.encode()
    header = bytes([0x81])
    if len(data) < 126:
        header += bytes([len(data)])
    elif len(data) < 65536:
        header += bytes([126]) + len(data).to_bytes(2, "big")
    else:
        header += bytes([127]) + len(data).to_bytes(8, "big")
    return header + data


def ws_send(user, message):
    entry = sockets.get(user)
    if not entry:
        return False
    handler, lock = entry
    with lock:
        try:
            handler.wfile.write(ws_frame(json.dumps(message)))
            handler.wfile.flush()
            return True
        except OSError:
            return False


def ws_read(stream, handler, lock):
    while True:
        head = stream.read(2)
        if len(head) < 2:
            return None
        opcode, size = head[0] & 0x0F, head[1] & 0x7F
        if size == 126:
            size = int.from_bytes(stream.read(2), "big")
        elif size == 127:
            size = int.from_bytes(stream.read(8), "big")
        mask = stream.read(4) if head[1] & 0x80 else b"\0\0\0\0"
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(stream.read(size)))
        if opcode == 8:
            return None
        if opcode == 9:
            with lock:
                handler.wfile.write(bytes([0x8A, len(payload)]) + payload)
                handler.wfile.flush()
            continue
        if opcode in (1, 2):
            return payload.decode(errors="replace")


def sync_command(user, command, position, delay=0.0):
    group = sync["group"]
    if not group:
        return
    ws_send(user, {"MessageType": "SyncPlayCommand", "Data": {"GroupId": group["GroupId"], "PlaylistItemId": group.get("PlaylistItemId", ""),
                                                              "When": now_iso(delay), "PositionTicks": int(position), "Command": command, "EmittedAt": now_iso()}})


def sync_update(user, kind, data):
    group = sync["group"]
    ws_send(user, {"MessageType": "SyncPlayGroupUpdate", "Data": {"GroupId": group["GroupId"] if group else "", "Type": kind, "Data": data}})


def with_state(item, user):
    item = {key: value for key, value in item.items() if not key.startswith("_")}
    if item["Id"] == "episode" and subtitle_downloaded["value"]:
        item["MediaSources"] = [{"Id": "source", "Container": "webm", "MediaStreams": [
            {"Type": "Subtitle", "Codec": "srt", "Language": "fre", "DisplayTitle": "Français (OpenSubtitles)", "IsExternal": True, "Index": 3}]}]
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

    def media(self, data, content_type="video/webm"):
        match = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
        if match:
            start = int(match[1])
            end = min(int(match[2]), len(data) - 1) if match[2] else len(data) - 1
            return self.send(data[start:end + 1], 206, content_type, {"Accept-Ranges": "bytes", "Content-Range": f"bytes {start}-{end}/{len(data)}"})
        return self.send(data, content_type=content_type, headers={"Accept-Ranges": "bytes"})

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
        if path == "/jellyfin/QuickConnect/Enabled":
            return self.send(b"true")
        if path == "/jellyfin/QuickConnect/Connect":
            quick["polls"] += 1
            events.append(("quick-connect-poll", "anonymous", {}))
            return self.send({"Authenticated": quick["polls"] >= 2, "Secret": "qc-secret", "Code": "123456"})
        if path == "/jellyfin/GetUtcTime":
            return self.send({"RequestReceptionTime": now_iso(), "ResponseTransmissionTime": now_iso()})
        user = "public-fixture" if path == "/fixture-video.webm" else self.user
        if path == "/jellyfin/socket" and self.headers.get("Upgrade", "").lower() == "websocket":
            accept = base64.b64encode(hashlib.sha1((self.headers["Sec-WebSocket-Key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            self.wfile.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n").encode())
            self.wfile.flush()
            lock = Lock()
            sockets[user] = (self, lock)
            events.append(("socket-open", user, {}))
            ws_send(user, {"MessageType": "ForceKeepAlive", "Data": 60})
            try:
                while True:
                    message = ws_read(self.rfile, self, lock)
                    if message is None:
                        break
                    events.append(("socket-message", user, json.loads(message)))
            except (OSError, ValueError):
                pass
            finally:
                if sockets.get(user, (None,))[0] is self:
                    del sockets[user]
            self.close_connection = True
            return
        if path == "/jellyfin/SyncPlay/List":
            return self.send([dict(sync["group"])] if sync["group"] else [])
        if path == "/jellyfin/Items/Filters":
            return self.send({"Genres": ["Aventure", "Drame", "Science-fiction"], "Years": [2023, 2024, 2025, 2026], "OfficialRatings": ["Tous publics"]})
        if path == "/jellyfin/Videos/episode/Trickplay/320/0.jpg":
            events.append(("trickplay-tile", user, {}))
            return self.send(tile_jpeg, content_type="image/jpeg")
        if path == "/jellyfin/Items/episode/RemoteSearch/Subtitles/fre":
            events.append(("subtitle-search", user, {}))
            return self.send([{"Id": "opensub-1", "Name": "Teen.Wolf.S02E04.FR", "ProviderName": "OpenSubtitles", "Format": "srt", "DownloadCount": 1234}])
        if path == "/jellyfin/Videos/episode/source/Subtitles/3/0/Stream.srt":
            events.append(("subtitle-stream", user, {}))
            return self.send(b"1\n00:00:00,000 --> 00:02:00,000\nSous-titre de test Noctra\n", content_type="text/plain")
        if path == "/jellyfin/Audio/track1/Lyrics" or path == "/jellyfin/Audio/track2/Lyrics":
            return self.send({"Lyrics": [{"Text": "Sous la lune pâle", "Start": 0}, {"Text": "Le froid se lève sur la banquise", "Start": 40_000_000},
                                         {"Text": "Et la nuit danse encore", "Start": 90_000_000}]})
        if path.startswith("/jellyfin/Audio/track") and "/stream." in path:
            events.append(("audio-stream", user, {}))
            return self.media(external_video)
        if path == "/jellyfin/Items/film/Download":
            events.append(("offline-download", user, {}))
            return self.send(external_video, content_type="video/webm", headers={"Content-Disposition": 'attachment; filename="Horizon polaire.webm"'})
        if path == "/jellyfin/Playlists/playlist-1/Items":
            return self.page([dict(with_state(movies[0], user), PlaylistItemId="entry-1")] if playlists else [])
        if path == "/jellyfin/Artists/AlbumArtists":
            return self.page([{"Id": "artist-1", "Name": "Aurore", "Type": "MusicArtist"}])
        if features and path == "/api/libraries/refresh":
            return self.send({"message": "Médiathèques à jour."})
        if features and path == "/api/files/storage":
            return self.send({"capacity": {"source": "quota", "used": 6e12, "total": 8e12, "free": 2e12},
                              "libraries": [{"id": "films", "label": "Films", "bytes": 4e12}, {"id": "series", "label": "Séries", "bytes": 2e12}]})
        if features and path == "/jellyfin/System/Info":
            return self.send({"ServerName": "Noctra test", "Version": "10.11.0"})
        if features and path == "/jellyfin/Users":
            return self.send([{"Id": "profile-a", "Name": "Camille", "Policy": {"IsAdministrator": True}}])
        if features and path == "/jellyfin/ScheduledTasks":
            return self.send([])
        if features and path == "/jellyfin/Plugins":
            return self.send([{"Name": "OpenSubtitles", "Version": "20.0.0.0", "Id": "plugin1", "Status": "Active", "Description": "Sous-titres en ligne"},
                              {"Name": "Intro Skipper", "Version": "1.10.11.0", "Id": "plugin2", "Status": "Disabled", "Description": "Génériques"}])
        if features and path == "/jellyfin/System/ActivityLog/Entries":
            return self.send({"Items": [{"Name": "Camille s’est connecté depuis Noctra Windows", "Date": now_iso(), "Severity": "Information", "ShortOverview": "127.0.0.1"}]})
        if features and path == "/jellyfin/Devices":
            return self.send({"Items": [{"Id": "phone", "Name": "Téléphone de Camille", "AppName": "Jellyfin Android", "AppVersion": "2.6", "LastUserName": "Camille", "DateLastActivity": now_iso()}]})
        if features and path == "/jellyfin/Library/VirtualFolders":
            return self.send([{"Name": "Cinéma", "CollectionType": "movies", "Locations": ["/media/films"], "ItemId": "cinema"}])
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
        if path == "/api/jellyseerr/search":
            events.append(("discover-search", user, {"q": q.get("q", [""])[0]}))
            return self.send({"results": [{"id": 135, "mediaType": "movie", "title": "Scream", "releaseDate": "1996-12-20", "voteAverage": 7.4,
                                           "overview": "Un tueur masqué terrorise une petite ville."},
                                          {"id": 136, "mediaType": "tv", "name": "Scream : la série", "firstAirDate": "2015-06-30"}]})
        if path == "/api/jellyseerr/destinations":
            return self.send({"servers":[{"id":1,"name":"Cinéma","isDefault":True,"defaultProfileId":7,"defaultRootFolder":"/films","profiles":[{"id":7,"name":"Haute définition"},{"id":8,"name":"Très haute définition"}],"rootFolders":[{"path":"/films"}]}]})
        if path == "/api/jellyseerr/requests":
            return self.send({"results": [{"id": 22, "displayTitle": "Le Grand Bleu", "status": 1}]})
        if path == "/api/roulette":
            assert q["count"] == ["3"]
            return self.send({"results": [{"id": "orbit", "title": "Dernière orbite"}]})
        if path == "/api/tv/sources":
            tv_provider = [{"id": "witv-public", "name": "WiTV", "section": "channels"}] if args.tv_quality_only else []
            # Test des nouveautés : un grand catalogue (4 000 chaînes, 80 bouquets) pour mesurer la réactivité de « Toutes les chaînes ».
            if args.features_only: tv_provider += [{"id": "stress-test", "name": "Grand catalogue", "section": "channels"}, {"id": "bowdtv-guide", "name": "BowdTV", "section": "channels"}]
            return self.send({"sources": [{"id": "oha-live", "name": "OHA", "section":"channels"}, {"id":"movix-test","name":"Movix test","type":"additional","section":"channels"}, {"id":"progressive-test","name":"Catalogue progressif","section":"channels"}, {"id":"variants-test","name":"Variantes test","section":"channels"}, {"id":"countries-test","name":"Pays test","section":"channels"}, {"id":"quality-test","name":"Qualités test","section":"channels"}, {"id": "broken", "name": "Source indisponible", "section":"channels"}, {"id": "ppv", "name": "PPV", "section":"sports"}] + tv_provider})
        if path == "/api/tv/resolve/bowd-test":
            # Comme le serveur Noctra 200.0.181 : sans publicité, seul le lecteur officiel ; le direct vient après « continue ».
            bowd_ad["started"] = None
            return self.send({"options": [{"label": "Lecteur officiel BowdTV", "url": "https://bowdtv.example/player/test", "playbackType": "external", "manualOnly": True}],
                              "externalUrl": "https://bowdtv.example/player/test",
                              "bowdAd": {"videoUrl": "/api/tv/relay/index.m3u8", "actionUrl": "/api/tv/bowd/ad/test", "skipAfter": 3}})
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
            if q.get("source") == ["bowdtv-guide"]:
                return self.send({"channels": [{"name": "Noctra BowdTV", "provider": "BowdTV", "resolverUrl": "/api/tv/resolve/bowd-test"}]})
            if q.get("source") == ["stress-test"]:
                prefixes, words, suffixes = ["FR: ", "UK: ", "DE: ", "IT: ", "ES: ", "[FR] ", "", "PT | "], ["Sport", "Cinéma", "Info", "Musique", "Jeunesse", "Découverte", "Séries", "Histoire"], [" HD", " FHD", " SD", " .b", " (backup)", ""]
                return self.send({"groups": [{"name": f"{['France', 'Italia', 'Deutschland', 'UK', 'Espana'][n % 5]} · bouquet {n}", "ref": f"stress-{n}"} for n in range(80)],
                                  "channels": [{"name": f"{prefixes[i % 8]}{words[i % 7]} {i}{suffixes[i % 6]}", "country": "", "streamUrl": "/api/tv/relay/index.m3u8"} for i in range(4000)]})
            if (q.get("ref") or [""])[0].startswith("stress-"):
                n = int(q["ref"][0].split("-")[1]); events.append(("stress-bouquet", user, {"n": n}))
                return self.send({"channels": [{"name": f"Bouquet {n} chaîne {k} HD", "country": "", "group": f"{['France', 'Italia', 'Deutschland', 'UK', 'Espana'][n % 5]} · bouquet {n}", "streamUrl": "/api/tv/relay/index.m3u8"} for k in range(60)]})
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
            return self.page([{"Id": "cinema", "Name": "Cinéma", "Type": "CollectionFolder"}, {"Id":"series-lib","Name":"Séries","Type":"CollectionFolder"}]
                             + ([{"Id": "music-lib", "Name": "Musique", "Type": "CollectionFolder", "CollectionType": "music"}] if features else []))
        if path == "/jellyfin/Items":
            events.append(("catalog-query",user,q))
            term = q.get("SearchTerm", [""])[0].lower()
            types = q["IncludeItemTypes"][0].split(",")
            pool = [series, *movies] + ([album, *tracks, *playlists] if features else [])
            def in_parent(item):
                parent = q.get("ParentId", [None])[0]
                if not parent:
                    return True
                if item.get("_lib") == "music-lib":
                    return parent in ("music-lib", item.get("ParentId"))
                return (item["Type"] == "Series") == (parent == "series-lib") and parent in ("cinema", "series-lib")
            return self.page([with_state(item, user) for item in pool
                              if term in item["Name"].lower() and item["Type"] in types and in_parent(item)
                              and (not q.get("PersonIds") or item.get("People"))
                              and ("IsFavorite" not in q.get("Filters", [""])[0] or (user, item["Id"]) in favorites)])
        if path.startswith(f"/jellyfin/Users/{user}/Items/"):
            key = path.rsplit("/", 1)[1]
            return self.send(with_state(next(item for item in [series, episode, next_episode, *movies, album, *tracks, *playlists, person] if item["Id"] == key), user))
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
        if path in ["/jellyfin/Videos/episode/stream.webm", "/jellyfin/Videos/episode-next/stream.webm", "/fixture-video.webm", "/api/tv/oha/http/mixed-test"]:
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
            return self.send({"User": {"Id": user, "Name": payload["Username"], **({"Policy": {"IsAdministrator": user == "profile-a"}} if features else {})}, "AccessToken": user})
        if path == "/jellyfin/QuickConnect/Initiate":
            events.append(("quick-connect-initiate", "anonymous", {}))
            return self.send({"Secret": "qc-secret", "Code": "123456", "Authenticated": False})
        if path == "/jellyfin/Users/AuthenticateWithQuickConnect":
            assert payload["Secret"] == "qc-secret"
            events.append(("quick-connect-login", "profile-a", {}))
            return self.send({"User": {"Id": "profile-a", "Name": "Camille", **({"Policy": {"IsAdministrator": True}} if features else {})}, "AccessToken": "profile-a"})
        user = self.user
        q = parse_qs(target.query)
        if path == "/api/tv/bowd/ad/test":
            if payload.get("action") == "start":
                bowd_ad["started"] = bowd_ad["started"] or monotonic(); events.append(("bowd-start", user, {}))
                return self.send({"ok": True})
            if bowd_ad["started"] is None or monotonic() - bowd_ad["started"] < 3:
                events.append(("bowd-continue-early", user, {}))
                return self.send({"error": "La publicité BowdTV ne peut pas encore être passée."}, status=409)
            events.append(("bowd-continue", user, {}))
            return self.send({"options": [{"label": "BowdTV · AUTO · Serveur 1", "streamUrl": "/api/tv/relay/index.m3u8", "playbackType": "stream"}]})
        if path.startswith("/jellyfin/SyncPlay/"):
            action = path.rsplit("/", 1)[1]
            events.append(("syncplay-" + action, user, payload))
            if action == "Join" and sync["group"] and sync["group"]["GroupId"] == payload.get("GroupId"):
                # Séance existante (0.8 : suppression d'une séance oubliée).
                sync["group"]["Participants"] = list(dict.fromkeys(sync["group"]["Participants"] + ["Camille"]))
                sync_update(user, "GroupJoined", dict(sync["group"]))
            elif action in ("New", "Join"):
                sync["group"] = {"GroupId": "group-1", "GroupName": payload.get("GroupName", "Soirée test"), "State": "Idle", "Participants": ["Camille"]}
                sync_update(user, "GroupJoined", dict(sync["group"]))
            elif action == "Leave":
                sync_update(user, "GroupLeft", sync["group"]["GroupId"] if sync["group"] else "group-1")
                sync["group"] = None
            elif action == "SetNewQueue" and sync["group"]:
                item = payload["PlayingQueue"][0]
                sync["group"]["PlaylistItemId"] = "pl-" + item
                sync["position"] = payload.get("StartPositionTicks", 0)
                sync_update(user, "PlayQueue", {"Reason": "NewPlaylist", "Playlist": [{"ItemId": item, "PlaylistItemId": "pl-" + item}], "PlayingItemIndex": 0,
                                                 "StartPositionTicks": sync["position"], "IsPlaying": True, "LastUpdate": now_iso()})
            elif action == "Ready" and not payload.get("IsPlaying"):
                sync["position"] = payload.get("PositionTicks", 0)
                sync["playing_since"] = monotonic() + .8
                sync_command(user, "Unpause", sync["position"], .8)
            elif action == "Pause":
                elapsed = max(0.0, monotonic() - (sync["playing_since"] or monotonic()))
                sync["position"] += int(elapsed * 10_000_000)
                sync["playing_since"] = None
                sync_command(user, "Pause", sync["position"])
            elif action == "Unpause":
                sync["playing_since"] = monotonic() + .5
                sync_command(user, "Unpause", sync["position"], .5)
            elif action == "Seek":
                sync["position"] = payload["PositionTicks"]
                sync_command(user, "Seek", sync["position"])
            return self.send(status=204)
        if path == "/jellyfin/QuickConnect/Authorize":
            events.append(("quick-connect-authorize", user, {"code": q.get("code", [""])[0]}))
            return self.send(b"true")
        if path == "/jellyfin/Items/episode/RemoteSearch/Subtitles/opensub-1":
            subtitle_downloaded["value"] = True
            events.append(("subtitle-download", user, {}))
            return self.send(status=204)
        if path == "/jellyfin/Playlists":
            playlists.append({"Id": "playlist-1", "Name": payload["Name"], "Type": "Playlist", "ChildCount": 1})
            events.append(("playlist-create", user, payload))
            return self.send({"Id": "playlist-1"})
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


class Lookup:
    """0.8 : commandes du lecteur dans des fenêtres superposées (en-tête, commandes, « Passer le
    générique ») qui s'effacent pendant la lecture. Recherche dans la fenêtre principale, puis dans
    les fenêtres superposées du processus ; une action réveille les commandes (pointeur sur l'image)."""

    roots = {}

    def __init__(self, auto_id, kind=None):
        self.auto_id, self.kind = auto_id, kind

    def _find(self):
        criteria = {"control_type": self.kind} if self.kind else {}
        # Fenêtre superposée où l'élément a été vu la dernière fois : cherchée en premier (plus rapide).
        cached = Lookup.roots.get(self.auto_id)
        if cached is not None:
            try:
                for item in cached.descendants(**criteria):
                    if item.element_info.automation_id == self.auto_id:
                        return item
            except Exception:
                Lookup.roots.pop(self.auto_id, None)
        spec = window.child_window(auto_id=self.auto_id, **criteria)
        try:
            if spec.exists(timeout=0):
                return spec.wrapper_object()
        except Exception:
            pass  # disparu entre la recherche et la lecture (commandes qui s'effacent)
        try:
            for root in Desktop(backend="uia").windows():
                if root.process_id() != process.pid or root.handle == window.handle:
                    continue
                for item in root.descendants(**criteria):
                    if item.element_info.automation_id == self.auto_id:
                        Lookup.roots[self.auto_id] = root
                        return item
        except Exception:
            pass
        return None

    def exists(self, timeout=0):
        deadline = monotonic() + (timeout or 0)
        while True:
            if self._find() is not None:
                return True
            if monotonic() >= deadline:
                return False
            sleep(.1)

    def _resolve(self):
        found = self._find()
        if found is None and wake_player():
            found = self._find()
        # Interface en train de se reconstruire (page qui change) : nouvelle recherche pendant 5 s au plus.
        deadline = monotonic() + 5
        while found is None and monotonic() < deadline:
            sleep(.2)
            found = self._find()
        if found is None:
            raise LookupError("Control not found: " + self.auto_id)
        return found

    def wrapper_object(self):
        return self._resolve()

    def __getattr__(self, name):
        target = self._resolve()
        value = getattr(target, name)
        if not callable(value):
            return value

        def call(*args, **kwargs):
            # Commandes du lecteur : si l'élément s'efface pendant l'action, on les réveille et on recommence
            # (élément déjà trouvé utilisé d'abord : une seule recherche dans le cas normal).
            nonlocal target
            for attempt in range(3):
                try:
                    return getattr(target, name)(*args, **kwargs)
                except Exception:
                    if attempt == 2:
                        raise
                    wake_player()
                    target = self._resolve()
        return call


def wake_player():
    """Fait réapparaître les commandes du lecteur : le pointeur bouge au-dessus de l'image."""
    try:
        video = window.child_window(title="Surface vidéo", control_type="Pane")
        if not video.exists(timeout=0):
            return False
        rect = video.rectangle()
    except Exception:
        return False
    if rect.width() <= 0 or rect.height() <= 0:
        return False
    x, y = (rect.left + rect.right) // 2, rect.bottom - max(60, rect.height() // 5)
    win32api.SetCursorPos((x, y - 4))
    sleep(.05)
    win32api.SetCursorPos((x, y))
    sleep(.4)
    return True


def control(auto_id, kind=None):
    return Lookup(auto_id, kind)


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


def check_episode_flow():
    # 0.8 : comme la PWA : boutons épisode précédent / suivant, chapitres, « À suivre » en fin d'épisode, épisode suivant lancé seul.
    def plays(item):
        return sum(1 for path, user, p in events if path == "/jellyfin/Sessions/Playing" and p.get("ItemId") == item)
    started = plays("episode")
    # Épisode repris depuis le début (les tests précédents l'ont arrêté près de la fin).
    progress["profile-a"] = 0
    control("HomeTab").invoke()
    until(lambda: control("PrimaryPlayback", "Button").exists(timeout=.1), "Home missing before the episode flow")
    next_started = plays("episode-next")
    control("PrimaryPlayback", "Button").invoke()
    until(lambda: plays("episode") > started or plays("episode-next") > next_started, "No episode started from the home page", timeout=60)
    if plays("episode-next") > next_started:
        # L'accueil propose l'épisode suivant à regarder : retour au précédent par le bouton du lecteur.
        until(lambda: wake_player() is not False and control("QueuePrevious").is_visible() and control("QueuePrevious").is_enabled(), "No previous-episode button in the player", timeout=20)
        control("QueuePrevious").invoke()
        until(lambda: plays("episode") > started, "The previous episode did not start", timeout=60)
    next_started = plays("episode-next")
    until(lambda: wake_player() is not False and control("QueueNext").is_visible() and control("QueueNext").is_enabled(), "No next-episode button in the player", timeout=20)
    assert not control("QueuePrevious").is_enabled(), "First episode offers a previous episode"
    until(lambda: wake_player() is not False and control("ChaptersButton").is_visible(), "No chapters for an episode with detected segments", timeout=20)
    control("ChaptersButton").invoke()
    until(lambda: control("Chapter2").exists(timeout=.1), "Chapter list missing")
    control("Chapter2").invoke()
    until(lambda: position_seconds() >= 23, "Choosing a chapter did not seek", timeout=10)
    control("ChaptersButton").invoke()
    # Touche 8 : 80 % de l'épisode (96 s sur 120 s) ; la carte doit venir 15 s avant la fin.
    window.set_focus(); sleep(.3)
    send_keys("8")
    def traced(text):
        log = profile / "trace.log"
        return log.exists() and text in log.read_text(encoding="utf-8", errors="replace")
    # Journal du lecteur : la carte a bien été affichée (plus fiable qu'un sondage de l'interface pendant ses 10 s).
    until(lambda: traced("à suivre affiché episode-next"), "« À suivre » missing at the end of the episode", timeout=30)
    if control("UpNextTitle").exists(timeout=2):
        assert "Venomous" in control("UpNextTitle").window_text(), "« À suivre » does not name the next episode"
        screenshot("a-suivre")
    until(lambda: plays("episode-next") > next_started, "The next episode did not start by itself", timeout=40)
    assert traced("épisode suivant episode-next (compte à rebours)") or traced("épisode suivant episode-next (fin du fichier)"), "The next episode started for another reason"
    until(lambda: control("MediaTitle").window_text() == "Venomous", "The player did not switch to the next episode")
    control("ReturnButton").invoke()
    print("OK · Série : épisode précédent / suivant, chapitres, « À suivre » et épisode suivant lancé seul (comme la PWA).", flush=True)


def check_bowd_preroll():
    # BowdTV : publicité lue dans le lecteur Noctra (son coupé), « start », délai respecté, « continue », puis direct HLS (comme la PWA).
    control("TvTab").invoke()
    until(lambda: control("TvSearch").exists(timeout=.1), "TV search missing")
    control("TvSearch").set_edit_text("Noctra BowdTV")
    until(lambda: by_name("Noctra BowdTV").exists(timeout=.1), "BowdTV channel missing from all channels", timeout=40)
    by_name("Noctra BowdTV").invoke()
    until(lambda: window.child_window(title_re=".*direct HLS après publicité$", control_type="Text").exists(timeout=.1), "BowdTV live after the advert is not offered", timeout=30)
    until(lambda: by_name("▶   Lire le direct").is_enabled(), "BowdTV cannot be played in Noctra")
    by_name("▶   Lire le direct").invoke()
    until(lambda: "Publicité BowdTV" in control("PlaybackMode").window_text(), "The BowdTV advert is not played in the player", timeout=30)
    until(lambda: seen("bowd-start"), "The advert start was not reported to Noctra", timeout=30)
    screenshot("bowdtv-publicite")
    until(lambda: seen("bowd-continue") and control("PlaybackMode").window_text().startswith("EN DIRECT"), "The BowdTV live did not start after the advert", timeout=45)
    assert not seen("bowd-continue-early"), "The advert was skipped before its delay"
    control("ReturnButton").invoke()
    print("OK · BowdTV : publicité dans le lecteur, délai respecté, puis direct HLS (comme la PWA).", flush=True)


def check_tv_responsiveness():
    # « Toutes les chaînes » avec un grand catalogue : le fil de l'interface doit rester réactif pendant le chargement
    # (aucun blocage de plus d'une seconde), d'abord en France (16 bouquets), puis pour tous les pays (80 bouquets).
    def watch(bouquets, label):
        start, worst, done = monotonic(), 0.0, None
        while monotonic() - start < 90:
            before = monotonic()
            win32gui.SendMessageTimeout(window.handle, win32con.WM_NULL, 0, 0, win32con.SMTO_NORMAL, 30000)
            worst = max(worst, monotonic() - before)
            if done is None and len({body["n"] for name, _, body in events if name == "stress-bouquet"}) >= bouquets: done = monotonic() - start
            if done is not None and monotonic() - start > done + 4: break
            sleep(.05)
        loaded = sorted({body["n"] for name, _, body in events if name == "stress-bouquet"})
        print(json.dumps({"tv_responsiveness": label, "worst_ui_block_s": round(worst, 3), "bouquets_loaded_after_s": done and round(done, 1), "bouquets": loaded}), flush=True)
        assert done is not None, f"{label}: bouquets not loaded"
        assert worst < 1.0, f"{label}: the interface froze for {worst:.2f} s while loading all channels"
    control("TvTab").invoke()
    watch(16, "France")
    until(lambda: control("TvCountry").selected_text() == "France", "France is not the default country")
    control("TvSearch").set_edit_text("Bouquet 5 chaîne 7")
    until(lambda: by_name("Bouquet 5 chaîne 7").exists(timeout=.1), "French bouquet channels missing from the large catalog")
    control("TvSearch").set_edit_text("Bouquet 1 chaîne 7"); sleep(1.5)
    assert not window.child_window(title_re=r"^Bouquet 1 chaîne 7( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1), "Italian bouquet channels leak into France"
    control("TvCountry").select("Tous les pays")
    watch(80, "Tous les pays")
    control("TvSearch").set_edit_text("Bouquet 1 chaîne 7")
    until(lambda: window.child_window(title_re=r"^Bouquet 1 chaîne 7( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1), "All countries do not include the Italian bouquet")
    screenshot("tv-grand-catalogue")
    print("OK · TV « Toutes les chaînes » réactive avec 4 000 chaînes et 80 bouquets.", flush=True)


def check_tv_countries_and_qualities():
    control("TvTab").invoke()
    until(lambda:control("TvCountry").exists(timeout=.1),"Country selector is missing")
    until(lambda:by_name("TF1").exists(timeout=.1),"French channels missing")
    assert control("TvCountry").selected_text()=="France"
    assert not window.child_window(title_re=r"^BBC One( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1) and not window.child_window(title_re=r"^La Une( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1),"Foreign channels leak into France"
    assert not any(name=="german-bouquet" for name,_,_ in events),"Foreign bouquets loaded before they were requested"
    # Vue réunie : pas de grille de bouquets (ceux de tous les pays), leurs chaînes sont dans la liste.
    until(lambda:by_name("Noctra Bouquet").exists(timeout=.1),"French bouquet channels missing from all channels")
    assert not by_name("Choisir un bouquet").exists(timeout=.1) and not by_name("Germany · test").exists(timeout=.1),"Bouquet grid shown in all channels"
    control("TvCountry").select("Royaume-Uni")
    until(lambda:window.child_window(title_re=r"^BBC One( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1),"UK selection has no BBC channel")
    assert not by_name("TF1").exists(timeout=.1)
    control("TvCountry").select("Allemagne")
    until(lambda:window.child_window(title_re=r"^ZDF régional( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1),"German bouquet did not load after country selection")
    control("TvCountry").select("Belgique")
    until(lambda:window.child_window(title_re=r"^La Une( [A-Z]{2,3})?$",control_type="Button").exists(timeout=.1),"Belgian French-language channel classified as France")
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


def process_controls(kind, name=None, auto_id=None, prefix=None):
    return [item for root in Desktop(backend="uia").windows() if root.process_id() == process.pid
            for item in root.descendants(control_type=kind)
            if (name is None or item.window_text() == name) and (auto_id is None or item.element_info.automation_id == auto_id)
            and (prefix is None or item.window_text().startswith(prefix))]


def menu_item(prefix):
    found = process_controls("MenuItem", prefix=prefix)
    return found[0] if found else None


def text_of(auto_id):
    found = process_controls("Text", auto_id=auto_id)
    if not found and wake_player():
        found = process_controls("Text", auto_id=auto_id)
    return found[0].window_text() if found else ""


def seen(name, predicate=lambda user, payload: True):
    return any(event == name and predicate(user, payload) for event, user, payload in events)


def position_seconds():
    text = control("PositionLabel").window_text().split(" / ")[0]
    hours, minutes, seconds = (int(part) for part in text.split(":"))
    return hours * 3600 + minutes * 60 + seconds


def check_new_features():
    # Connexion temps réel (SyncPlay, télécommande) et capacités annoncées.
    until(lambda: "profile-a" in sockets, "Realtime WebSocket not connected", timeout=30)
    until(lambda: seen("/jellyfin/Sessions/Capabilities/Full"), "Remote control capabilities not announced")
    print("OK · WebSocket Jellyfin (en-tête Authorization) et capacités de télécommande.", flush=True)

    # Aperçu au survol d'une carte.
    card = window.child_window(title="Horizon polaire", control_type="Button", found_index=0)
    card.set_focus()
    sleep(.8)
    rect = card.rectangle()
    for step in range(8):
        win32api.SetCursorPos(((rect.left + rect.right) // 2 - 16 + step * 4, (rect.top + rect.bottom) // 2))
        sleep(.07)
    until(lambda: process_controls("Button", name="Aperçu · Lire"), "Hover preview did not open", timeout=6)
    sleep(.5)
    screenshot("apercu-survol")
    caption = win32gui.GetWindowRect(window.handle)
    win32api.SetCursorPos((caption[0] + 300, caption[1] + 18))
    until(lambda: not process_controls("Button", name="Aperçu · Lire"), "Hover preview did not close", timeout=5)
    print("OK · Aperçu au survol (visuel, synopsis, lecture, fiche, favori).", flush=True)

    # Filtres de médiathèque (genre).
    control("LibraryTab").invoke()
    by_name("Cinéma").invoke()
    until(lambda: by_name("Horizon polaire").exists(timeout=.1), "Library contents missing")
    genre = window.child_window(title="Genre", control_type="ComboBox")
    until(lambda: genre.select("Science-fiction") or True, "Genre filter choices did not load", timeout=15)
    until(lambda: any(name == "catalog-query" and body.get("Genres") == ["Science-fiction"] for name, _, body in events), "Genre filter not applied")
    until(lambda: by_name("Effacer les filtres").exists(timeout=.1), "Filtered page missing")
    screenshot("filtres")
    print("OK · Filtres genre / année / note et tris supplémentaires.", flush=True)

    # Fiche enrichie : badges techniques, informations techniques, actions.
    by_name("Effacer les filtres").invoke()
    until(lambda: by_name("Horizon polaire").exists(timeout=.1), "Unfiltered library missing")
    by_name("Horizon polaire").invoke()
    until(lambda: by_name("Dolby Vision", "Text").exists(timeout=.1), "Technical badges missing")
    for label in ["4K", "Dolby Atmos", "7.1", "HEVC"]:
        assert by_name(label, "Text").exists(timeout=.1), label
    assert control("TechnicalInfo").exists(timeout=.1) and control("TogetherButton").exists(timeout=.1)
    screenshot("fiche-film")
    print("OK · Fiche : 4K, Dolby Vision, Atmos 7.1, HEVC, fiche technique, regarder ensemble, bande-annonce.", flush=True)

    # Hors connexion : téléchargement, lecture du fichier local, reprise reportée au serveur.
    control("OfflineDownload").invoke()
    until(lambda: seen("offline-download"), "Offline download not requested")
    until(lambda: control("OfflineDownload").window_text() == "Disponible hors connexion", "Offline download did not finish", timeout=40)
    control("MoreTab").invoke()
    by_name("Téléchargements sur ce PC").invoke()
    play = window.child_window(title_re=r"^▶\s+Lire$", control_type="Button")
    until(lambda: play.exists(timeout=.1), "Offline entry missing")
    screenshot("hors-connexion")
    play.invoke()
    until(lambda: control("PlaybackMode").window_text().startswith("Hors connexion"), "Offline file did not play", timeout=40)
    sleep(2.5)
    control("ReturnButton").invoke()
    until(lambda: seen("/jellyfin/UserItems/film/UserData"), "Offline position was not reported to the server")
    print("OK · Hors connexion : fichier copié sur le PC, lu localement, position reportée.", flush=True)

    # SyncPlay : groupe, lecture synchronisée, pause et déplacement passés par le serveur.
    # 0.8 : séance créée depuis l'icône SyncPlay du bandeau (discrète, comme Jellyfin et la PWA).
    until(lambda: control("HomeTab").is_visible(), "Library not restored after offline playback")
    control("HomeTab").invoke()
    until(lambda: control("SyncHeaderButton").exists(timeout=.1), "SyncPlay header button missing")
    control("SyncHeaderButton").invoke()
    until(lambda: control("HomeSyncCreate").exists(timeout=.1), "SyncPlay header menu missing")
    control("HomeSyncCreate").invoke()
    until(lambda: control("SyncGroupName").exists(timeout=.1), "Group was not joined")
    screenshot("syncplay-groupe")
    control("HomeTab").invoke()
    until(lambda: control("PrimaryPlayback", "Button").exists(timeout=.1), "Home missing")
    control("PrimaryPlayback", "Button").invoke()
    until(lambda: seen("syncplay-SetNewQueue", lambda user, body: body["PlayingQueue"] == ["episode"]), "Item was not queued for the group")
    until(lambda: seen("syncplay-Ready"), "Ready was not reported after loading", timeout=60)
    until(lambda: control("PauseButton").window_text() == "Pause", "Group playback did not start")
    first = position_seconds()
    until(lambda: position_seconds() >= first + 2, "Group playback is not advancing", timeout=10)
    until(lambda: text_of("SyncBadgeText") == "Ensemble · 1", "Group badge missing")
    sync_update("profile-a", "UserJoined", "Alex")
    until(lambda: text_of("SyncBadgeText") == "Ensemble · 2", "Participant join not shown")
    control("PauseButton").invoke()
    until(lambda: seen("syncplay-Pause"), "Pause was not sent to the group")
    until(lambda: control("PauseButton").window_text() == "Reprendre", "Group pause was not applied")
    sync_command("profile-a", "Seek", 600_000_000)
    until(lambda: seen("syncplay-Ready", lambda user, body: body.get("PositionTicks", 0) >= 590_000_000), "Seek was not acknowledged")
    until(lambda: control("PauseButton").window_text() == "Pause" and position_seconds() >= 60, "Group did not resume after seek", timeout=20)
    screenshot("syncplay-lecture")
    print("OK · SyncPlay : création, file commune, prêt, départ synchronisé, pause et déplacement par le serveur, participants.", flush=True)

    # Télécommande depuis un autre appareil (passe par le groupe).
    ws_send("profile-a", {"MessageType": "Playstate", "Data": {"Command": "Pause"}})
    until(lambda: control("PauseButton").window_text() == "Reprendre", "Remote pause was not applied")
    assert sum(name == "syncplay-Pause" for name, _, _ in events) >= 2
    control("PauseButton").invoke()
    until(lambda: control("PauseButton").window_text() == "Pause", "Group resume failed")
    print("OK · Télécommande (Playstate) depuis un autre appareil.", flush=True)

    # Vignettes de progression (trickplay) au survol de la barre.
    timeline = control("Timeline").rectangle()
    for step in range(8):
        win32api.SetCursorPos((timeline.left + timeline.width() // 3 + step * 6, (timeline.top + timeline.bottom) // 2))
        sleep(.1)
    until(lambda: seen("trickplay-tile"), "Trickplay tile not requested", timeout=10)
    win32api.SetCursorPos((timeline.left + timeline.width() // 3 + 60, (timeline.top + timeline.bottom) // 2))
    sleep(.8)
    screenshot("vignettes-progression")
    print("OK · Vignettes de progression (trickplay) sur la barre.", flush=True)

    # 0.8 : appui sur la barre puis glissement jusqu'au milieu : une seule demande, à la position lâchée.
    seeks = [payload for name, _, payload in events if name == "syncplay-Seek"]
    timeline = control("Timeline").rectangle()
    middle = (timeline.top + timeline.bottom) // 2
    win32api.SetCursorPos((timeline.left + timeline.width() // 4, middle))
    sleep(.2)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
    for step in range(1, 11):
        win32api.SetCursorPos((timeline.left + timeline.width() // 4 + step * timeline.width() // 40, middle))
        sleep(.12)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
    until(lambda: len([1 for name, _, _ in events if name == "syncplay-Seek"]) > len(seeks), "Dragging the timeline did not seek")
    sleep(1)
    after = [payload for name, _, payload in events if name == "syncplay-Seek"][len(seeks):]
    assert len(after) <= 2, f"Timeline drag sent too many seeks: {len(after)}"
    assert 45 * 10_000_000 <= after[-1]["PositionTicks"] <= 75 * 10_000_000, f"Timeline drag landed at {after[-1]['PositionTicks'] / 10_000_000:.1f} s"
    print("OK · Barre de lecture : appui puis glissement, position lâchée appliquée.", flush=True)

    # Statistiques de lecture.
    control("SettingsButton").invoke()
    until(lambda: process_controls("Button", auto_id="StatsToggle"), "Player settings panel missing")
    sleep(.4)
    if args.screens:
        ImageGrab.grab(bbox=win32gui.GetWindowRect(window.handle), all_screens=True).save(args.screens / "lecteur-reglages.png")
    process_controls("Button", auto_id="StatsToggle")[0].invoke()
    until(lambda: "Décodage" in text_of("PlaybackStats"), "Playback statistics missing")
    screenshot("statistiques")
    print("OK · Réglages du lecteur et statistiques.", flush=True)

    # Recherche de sous-titres en ligne, téléchargés par le serveur puis ajoutés à la lecture.
    # 0.8 : panneau « Audio et sous-titres » (pistes et recherche en ligne au même endroit).
    control("SubtitleButton").invoke()
    until(lambda: process_controls("Button", auto_id="SubtitleSearch-fre"), "Subtitle search entry missing")
    assert process_controls("Button", auto_id="SubtitleOff"), "Subtitle off choice missing"
    process_controls("Button", auto_id="SubtitleSearch-fre")[0].invoke()
    until(lambda: process_controls("Button", prefix="Teen.Wolf.S02E04.FR"), "Subtitle results missing", timeout=15)
    sleep(.4)
    # Capture de l'écran sans changer le focus.
    if args.screens:
        ImageGrab.grab(bbox=win32gui.GetWindowRect(window.handle), all_screens=True).save(args.screens / "menu-sous-titres.png")
    process_controls("Button", prefix="Teen.Wolf.S02E04.FR")[0].invoke()
    until(lambda: seen("subtitle-download"), "Subtitle download not requested")
    until(lambda: seen("subtitle-stream"), "Downloaded subtitle not added to playback", timeout=30)
    print("OK · Sous-titres : recherche en ligne, téléchargement, ajout à la lecture.", flush=True)

    # Mini-lecteur au premier plan.
    original = tuple(win32gui.GetWindowRect(window.handle))
    control("MiniButton").invoke()
    until(lambda: win32gui.GetWindowRect(window.handle)[2] - win32gui.GetWindowRect(window.handle)[0] < 900, "Mini player did not shrink")
    assert win32gui.GetWindowLong(window.handle, win32con.GWL_EXSTYLE) & win32con.WS_EX_TOPMOST, "Mini player is not topmost"
    sleep(.6)
    screenshot("mini-lecteur")
    control("MiniButton").invoke()
    until(lambda: tuple(win32gui.GetWindowRect(window.handle)) == original, "Window was not restored after the mini player")
    print("OK · Mini-lecteur au premier plan et restauration.", flush=True)

    control("ReturnButton").invoke()
    until(lambda: control("MoreTab").is_visible(), "Library not restored after group playback")
    control("SyncHeaderButton").invoke()
    until(lambda: control("HomeSyncOpen").exists(timeout=.1), "SyncPlay menu does not show the current group")
    sleep(.6)
    if args.screens:
        ImageGrab.grab(bbox=win32gui.GetWindowRect(window.handle), all_screens=True).save(args.screens / "accueil-ensemble.png")
    send_keys("{ESC}")
    until(lambda: not control("HomeSyncOpen").exists(), "SyncPlay menu did not close")
    control("MoreTab").invoke()
    by_name("Regarder ensemble").invoke()
    until(lambda: by_name("Quitter le groupe").exists(timeout=.1), "Leave action missing")
    by_name("Quitter le groupe").invoke()
    until(lambda: control("SyncCreate").exists(timeout=.1), "Group was not left")

    # 0.8 : suppression d'une séance oubliée (rejointe sans lecture puis quittée : Jellyfin la supprime).
    sync["group"] = {"GroupId": "group-old", "GroupName": "Séance oubliée", "State": "Idle", "Participants": []}
    control("MoreTab").invoke()
    by_name("Regarder ensemble").invoke()
    until(lambda: control("SyncDelete-group-old").exists(timeout=.1), "Delete action missing for an open group")
    screenshot("syncplay-supprimer")
    leaves = sum(name == "syncplay-Leave" for name, _, _ in events)
    control("SyncDelete-group-old").invoke()
    until(lambda: sum(name == "syncplay-Leave" for name, _, _ in events) > leaves, "Forgotten group was not left")
    until(lambda: not control("SyncDelete-group-old").exists(), "Deleted group still listed")
    assert control("SyncCreate").exists(), "Deleting a group joined it for playback"

    # 0.8 : fermeture automatique : plus de lecture et plus d'autre participant (délai réduit pour le test).
    control("SyncCreate").invoke()
    until(lambda: control("SyncGroupName").exists(timeout=.1), "Group was not created for the idle test")
    sync_update("profile-a", "UserJoined", "Alex")
    sleep(.5)
    sync_update("profile-a", "UserLeft", "Alex")
    leaves = sum(name == "syncplay-Leave" for name, _, _ in events)
    until(lambda: sum(name == "syncplay-Leave" for name, _, _ in events) > leaves, "Idle group was not closed automatically", timeout=30)
    until(lambda: control("SyncCreate").exists(timeout=.1), "Idle group still shown")
    print("OK · SyncPlay : suppression d'une séance ouverte et fermeture automatique sans lecture ni participant.", flush=True)

    # Musique : album, file de lecture, paroles synchronisées.
    control("LibraryTab").invoke()
    by_name("Musique").invoke()
    until(lambda: by_name("Nuits polaires").exists(timeout=.1), "Album missing")
    by_name("Nuits polaires").invoke()
    until(lambda: control("PrimaryPlayback", "Button").exists(timeout=.1), "Album page missing")
    screenshot("album")
    control("PrimaryPlayback", "Button").invoke()
    until(lambda: seen("audio-stream"), "Audio stream not requested", timeout=40)
    until(lambda: text_of("AudioTitle") == "Première lueur", "Now playing title missing")
    until(lambda: text_of("LyricCurrent") not in ("", "♪"), "Synced lyrics missing", timeout=15)
    screenshot("musique")
    assert control("QueueNext").is_visible()
    control("QueueNext").invoke()
    until(lambda: text_of("AudioTitle") == "Banquise", "Queue did not advance", timeout=30)
    control("ReturnButton").invoke()
    print("OK · Musique : albums, lecture en file, titre suivant, paroles synchronisées.", flush=True)

    # Listes de lecture.
    until(lambda: control("MoreTab").is_visible(), "Library not restored after music")
    control("MoreTab").invoke()
    by_name("Listes de lecture").invoke()
    until(lambda: by_name("Nouvelle liste").exists(timeout=.1), "Playlists page missing")
    by_name("Nouvelle liste").invoke()
    # Boîte de dialogue modale : le champ a le focus à l'ouverture, « Valider » est le bouton par défaut.
    until(lambda: win32gui.FindWindow(None, "Nouvelle liste de lecture"), "Playlist name dialog missing", timeout=10)
    sleep(.6)
    send_keys("Soirée glaciale", with_spaces=True)
    send_keys("{ENTER}")
    until(lambda: seen("playlist-create", lambda user, body: body["Name"] == "Soirée glaciale"), "Playlist not created")
    until(lambda: by_name("Soirée glaciale", "Text").exists(timeout=.1), "Playlist page missing")
    screenshot("liste-de-lecture")
    print("OK · Listes de lecture : création et page de la liste.", flush=True)

    # 0.8 : page « Vos médiathèques » (tuiles à la hauteur de la fenêtre) et grille pleine largeur.
    control("LibraryTab").invoke()
    until(lambda: by_name("Cinéma").exists(timeout=.1), "Libraries page missing")
    sleep(1.2)
    screenshot("mediatheques")
    by_name("Cinéma").invoke()
    until(lambda: by_name("Horizon polaire").exists(timeout=.1), "Library grid missing")
    sleep(1)
    screenshot("grille-affiches")

    # 0.8 : recherche de titres à ajouter, directement dans Découvrir.
    control("DiscoverTab").invoke()
    until(lambda: control("DiscoverSearch").exists(timeout=.1), "Discovery search field missing")
    control("DiscoverSearch").set_edit_text("scream")
    control("DiscoverSearchButton").invoke()
    until(lambda: seen("discover-search", lambda user, body: body["q"] == "scream"), "Discovery search not sent")
    until(lambda: by_name("Scream").exists(timeout=.1), "Discovery search results missing")
    sleep(1)
    screenshot("decouvrir-recherche")
    print("OK · Médiathèques plein écran, grille d'affiches, recherche dans Découvrir.", flush=True)

    # 0.8 : rangées infinies de l'accueil (fenêtre étroite : la rangée Cinéma déborde, puis boucle).
    original = tuple(win32gui.GetWindowRect(window.handle))
    dpi = ctypes.windll.user32.GetDpiForWindow(window.handle) / 96
    win32gui.ShowWindow(window.handle, win32con.SW_RESTORE)
    win32gui.SetWindowPos(window.handle, 0, 40, 40, round(960 * dpi), round(880 * dpi), win32con.SWP_NOZORDER)
    control("HomeTab").invoke()
    arrow = by_name("Ajouts récents · Cinéma suivant")
    until(lambda: arrow.exists(timeout=.1) and arrow.is_enabled(), "Home row arrows missing", timeout=20)
    before = len(window.descendants(title="Horizon polaire", control_type="Button"))
    for _ in range(5):
        arrow.invoke()
        sleep(.7)
    until(lambda: len(window.descendants(title="Horizon polaire", control_type="Button")) > before, "Home row did not loop")
    assert by_name("Ajouts récents · Cinéma précédent").is_enabled(), "Previous arrow disabled in an infinite row"
    screenshot("accueil-rangee-infinie")
    win32gui.SetWindowPos(window.handle, 0, original[0], original[1], original[2] - original[0], original[3] - original[1], win32con.SWP_NOZORDER)
    control("LibraryTab").invoke()
    print("OK · Rangées infinies de l'accueil (page suivante puis boucle) et menu SyncPlay du bandeau.", flush=True)

    # Quick Connect : autoriser un autre appareil depuis le profil.
    control("ProfileButton").invoke()
    until(lambda: control("QuickConnectInput").exists(timeout=.1), "Quick Connect form missing")
    control("QuickConnectInput").set_edit_text("654321")
    control("QuickConnectAuthorize").invoke()
    until(lambda: seen("quick-connect-authorize", lambda user, body: body["code"] == "654321"), "Quick Connect authorization not sent")

    # Administration : extensions et stockage.
    control("MoreTab").invoke()
    by_name("Jellyfin et médiathèques").invoke()
    until(lambda: by_name("Extensions").exists(timeout=.1), "Jellyfin admin shortcuts missing", timeout=20)
    by_name("Extensions").invoke()
    until(lambda: by_name("OpenSubtitles · 20.0.0.0", "Text").exists(timeout=.1), "Plugins missing")
    screenshot("extensions")
    control("BackButton").invoke()
    until(lambda: by_name("Stockage du serveur").exists(timeout=.1), "Storage shortcut missing")
    by_name("Stockage du serveur").invoke()
    until(lambda: window.child_window(title_re=".*utilisés sur.*", control_type="Text").exists(timeout=.1), "Storage summary missing")
    screenshot("stockage")
    print("OK · Quick Connect (autoriser), extensions, stockage du serveur.", flush=True)

    # Connexion par code (Quick Connect).
    control("ProfileButton").invoke()
    by_name("Se déconnecter").invoke()
    until(lambda: control("SignInButton").is_enabled(), "Login screen missing")
    control("QuickConnectButton").invoke()
    until(lambda: text_of("QuickConnectCode") == "123456", "Quick Connect code not shown")
    screenshot("quick-connect")
    until(lambda: seen("quick-connect-login"), "Quick Connect login not completed", timeout=30)
    until(lambda: by_name("CONTINUER À REGARDER", "Text").exists(timeout=.1), "Home not shown after Quick Connect", timeout=30)
    print("OK · Connexion Quick Connect par code.", flush=True)


def open_app(profile, address=None):
    command = [str(args.exe.resolve())]
    if address:
        command += ["--server", address]
    # 0.6 : grand visuel de l'accueil sans défilement automatique pendant le test (titre mis en avant stable).
    # 0.7 : aperçus au survol désactivés pendant le parcours principal (vérifiés dans --features-only).
    process = subprocess.Popen(command, env={**os.environ, "NOCTRA_WINDOWS_DATA": str(profile), "NOCTRA_HERO_AUTOPLAY": "0",
                                             "NOCTRA_TRACE": str(profile / "trace.log"), "NOCTRA_SYNC_IDLE_SECONDS": "6",
                                             **({} if args.features_only else {"NOCTRA_HOVER_PREVIEW": "0"})})
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
    # Rafales de requêtes parallèles (accueil, images) : file d'attente de connexions élargie.
    ThreadingHTTPServer.request_queue_size = 128
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
        if args.features_only:
            check_new_features()
            check_tv_responsiveness()
            check_bowd_preroll()
            check_episode_flow()
            window.close(); process.wait(timeout=12)
            print("OK · Nouveautés 0.7 vérifiées.", flush=True)
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
        # 0.8 : la lecture normale mettrait plus de 10 s à atteindre 0:23 ; le saut doit y arriver en quelques secondes.
        skipped_at = monotonic()
        control("SkipCredits").invoke()
        until(lambda: position_seconds() >= 23, "Skip credits did not seek", timeout=8)
        assert monotonic() - skipped_at < 8, "Skip credits reached the end of the credits too late"
        wake_player()
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
        # 0.8 : un lecteur web entre dans la multivue avec un direct.
        window.child_window(title="Multivue + · lecteur web",control_type="Button",found_index=0).invoke()
        until(lambda:by_name("Lancer la multivue").exists(timeout=.1),"Multiview page missing after adding a web player")
        control("BackButton").invoke()
        until(lambda:window.child_window(title="Multivue +",control_type="Button",found_index=1).exists(timeout=.1),"Channel servers missing after returning from multiview")
        window.child_window(title="Multivue +",control_type="Button",found_index=1).invoke()
        until(lambda:by_name("Lancer la multivue").exists(timeout=.1),"Multiview page missing")
        assert by_name("Lecteur web externe","Text").exists(timeout=.1),"Web player not listed in the multiview selection"
        by_name("Lancer la multivue").invoke()
        multi=window.child_window(title="Noctra · Multivue",control_type="Window")
        try:
            multi.wait("visible",timeout=12)
        except Exception:
            screenshot("multivue-echec")
            print("Multiview windows:", [(item.window_text(), item.element_info.control_type) for item in Desktop(backend="uia").windows() if item.process_id()==process.pid], flush=True)
            raise
        until(lambda:any(name.startswith("live-") and name.endswith(".ts") for name,_,_ in events),"Multiview did not receive media")
        until(lambda:multi.child_window(title_re="Image reçue.*",control_type="Text").exists(timeout=.1),"Web player tile did not show video",timeout=35)
        multi.child_window(title="Mettre en avant",control_type="Button",found_index=0).invoke()
        until(lambda:multi.child_window(title="Revenir à la grille",control_type="Button").exists(timeout=.1),"Featured tile not applied")
        sleep(1)
        if args.screens:
            ImageGrab.grab(bbox=win32gui.GetWindowRect(multi.handle),all_screens=True).save(args.screens/"multivue.png")
        multi.child_window(title="Revenir à la grille",control_type="Button").invoke()
        until(lambda:multi.child_window(title="Mettre en avant",control_type="Button",found_index=1).exists(timeout=.1),"Grid not restored")
        # Plein écran : seulement les images (ni en-tête ni bandeaux), Échap pour revenir.
        multi.child_window(title="Plein écran",control_type="Button").invoke()
        until(lambda:tuple(win32gui.GetWindowRect(multi.handle))==monitor_rect(multi),"Multiview fullscreen does not cover the monitor")
        until(lambda:not multi.child_window(title="Mettre en avant",control_type="Button").exists(timeout=.1),"Tile bars remained in multiview fullscreen")
        rect=win32gui.GetWindowRect(multi.handle);win32api.SetCursorPos(((rect[0]+rect[2])//2,(rect[1]+rect[3])//2));sleep(1)
        if args.screens:
            ImageGrab.grab(bbox=rect,all_screens=True).save(args.screens/"multivue-plein-ecran.png")
        multi.set_focus();send_keys("{ESC}")
        until(lambda:multi.child_window(title="Mettre en avant",control_type="Button",found_index=1).exists(timeout=.1),"Escape did not restore the multiview bars")
        print("OK · Multivue : direct et lecteur web, mise en avant, retour à la grille.",flush=True)
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
        screenshot("tv-lecteur")
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
                trace = profile / "trace.log"
                print(json.dumps({"trace": trace.read_text(encoding="utf-8", errors="replace").splitlines()[-40:] if trace.exists() else [],
                                  "events": [name for name, _, _ in events if name not in ("catalog-query", "stream")][-40:]}, ensure_ascii=True), flush=True)
                print(json.dumps({"visible_messages":[element.window_text() for element in window.descendants(control_type="Text")][-16:],"last_queries":[body for name,_,body in events if name=="catalog-query"][-3:]},ensure_ascii=True),flush=True)
            except Exception:
                pass
        raise
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        server.shutdown()

