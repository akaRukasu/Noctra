# Héberger Noctra sur Ultra.cc

Cette version accepte un sous-chemin comme `/noctra`, ce qui correspond au fonctionnement du proxy Nginx Ultra.cc.

## 1. Préparer le `.env`

Dans `.env`, conserve tes véritables adresses et clés, puis ajoute ou modifie ces trois lignes :

```env
HOST=127.0.0.1
PORT=TON_PORT_ULTRA_A_5_CHIFFRES
BASE_URL=/noctra
```

Le port doit obligatoirement appartenir à la plage attribuée à ton slot Ultra.cc.

## 2. Envoyer le dossier

Envoie le dossier complet `noctra-media-client-v24` dans ton répertoire personnel Ultra.cc, par SFTP ou avec le gestionnaire de fichiers.

Exemple de destination :

```text
/home/TON_UTILISATEUR/noctra-media-client-v24
```

## 3. Vérifier Node.js

Connecte-toi en SSH puis exécute :

```bash
node --version
```

La version doit commencer par `v20` ou un nombre supérieur.

## 4. Installer le service et le proxy

Depuis le dossier Noctra :

```bash
cd ~/noctra-media-client-v24
bash ultra/install-ultra.sh
```

Le script crée uniquement :

- un service utilisateur `noctra.service` ;
- un proxy Nginx `~/.apps/nginx/proxy.d/noctra.conf` ;
- deux journaux dans `logs/`.

Il n’utilise ni `sudo`, ni Docker.

## 5. Vérifier

```bash
systemctl --user status noctra.service
curl http://127.0.0.1:TON_PORT/noctra/health
```

Puis ouvre :

```text
https://akarukasu.merlion.usbx.me/noctra/client/index.html
```

## Commandes utiles

```bash
systemctl --user restart noctra.service
systemctl --user stop noctra.service
systemctl --user start noctra.service
tail -f logs/noctra.log
tail -f logs/noctra-error.log
```

Après une réinstallation du serveur web depuis le panneau Ultra.cc, le fichier Nginx personnalisé peut être écrasé. Il suffit alors de relancer :

```bash
bash ultra/install-ultra.sh
```
