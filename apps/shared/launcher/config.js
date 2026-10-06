/* Réglages de l'écran de connexion des applications Noctra.
   defaultServerUrl : serveur ouvert directement au premier lancement (l'appli
   arrive sur la page de connexion Jellyfin, sans rien saisir). L'écran de
   saisie n'apparaît que si ce serveur est injoignable.
   autoConnectDelaySeconds : 0 = connexion immédiate aux lancements suivants.
   tvInterface : LG webOS et Samsung Tizen ouvrent l'interface Noctra TV
   (/tv-app/, comme l'appli Android TV) ; false = interface web complète. */
window.NOCTRA_LAUNCHER_CONFIG = {
  appVersion: '1.1.37',
  defaultServerUrl: 'https://akarukasu.merlion.usbx.me/noctra',
  autoConnectDelaySeconds: 0,
  tvInterface: true
};
