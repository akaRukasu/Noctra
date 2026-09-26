/* Réglages de l'écran de connexion des applications Noctra.
   defaultServerUrl : serveur ouvert directement au premier lancement (l'appli
   arrive sur la page de connexion Jellyfin, sans rien saisir). L'écran de
   saisie n'apparaît que si ce serveur est injoignable.
   autoConnectDelaySeconds : 0 = connexion immédiate aux lancements suivants. */
window.NOCTRA_LAUNCHER_CONFIG = {
  appVersion: '1.0.1',
  defaultServerUrl: 'https://akarukasu.merlion.usbx.me/noctra',
  autoConnectDelaySeconds: 0
};
