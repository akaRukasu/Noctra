# Étape 2 — Installer Noctra comme PWA

La PWA utilise exactement le Noctra hébergé. Il n’y a pas une deuxième copie du serveur et aucune clé API n’est stockée dans l’application installée.

## Test immédiat sur le PC

1. Exécute une seule fois `INSTALL-NOCTRA-AUTOSTART.bat` ; les lancements suivants seront automatiques et invisibles.
2. Ouvre `http://127.0.0.1:3000/client/index.html` dans Edge ou Chrome.
3. Connecte-toi à Jellyfin.
4. Passe la souris sur le logo Noctra puis clique sur **Installer Noctra**, ou utilise l’icône d’installation dans la barre d’adresse.

## Après l’hébergement Ultra.cc

Ouvre cette adresse dans Edge ou Chrome :

```text
https://akarukasu.astra.usbx.me/noctra/client/index.html
```

Puis choisis **Installer Noctra**. L’application aura sa propre fenêtre, sa propre icône et restera connectée comme le navigateur.

## Android

Dans Chrome : menu `⋮` → **Installer l’application** ou **Ajouter à l’écran d’accueil**.

## iPhone et iPad

Dans Safari : bouton **Partager** → **Sur l’écran d’accueil**.

La PWA reste dépendante du serveur Ultra.cc et d’une connexion Internet. Elle ne télécharge pas automatiquement les films pour une utilisation hors ligne.

## Ancien nom ou ancienne icône dans Chrome

La v26 utilise un nouveau manifeste `noctra.webmanifest`, un identifiant PWA propre et des icônes versionnées. Si une ancienne application locale est déjà installée sous le nom « Akary », désinstalle cette ancienne PWA une fois puis recharge Noctra avec `Ctrl+F5` avant de cliquer sur **Installer Noctra**.
