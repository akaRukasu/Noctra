window.NOCTRA_PLATFORM = 'tizen';

// Touches de la télécommande Samsung reçues par l'appli (lecture, chaînes,
// couleurs…) : à déclarer avant d'ouvrir l'interface Noctra TV du serveur.
(function () {
  try {
    var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
      'ChannelUp', 'ChannelDown', 'ChannelList', 'Info', 'Guide', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
    var supported = tizen.tvinputdevice.getSupportedKeys().map(function (key) { return key.name; });
    keys.forEach(function (name) {
      if (supported.indexOf(name) >= 0) {
        try { tizen.tvinputdevice.registerKey(name); } catch (error) { /* touche absente */ }
      }
    });
  } catch (error) { /* hors Tizen */ }
})();
