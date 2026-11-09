# Construire Noctra Windows 0.6.0

## Application

Prérequis : Windows 11 x64 et SDK .NET 10.

Dans le dossier des sources :

```powershell
dotnet publish Noctra.Windows.csproj -c Release -r win-x64 --self-contained true -o publish
```

`publish/Noctra.exe` contient l'application et le runtime .NET. Le lecteur natif est téléchargé et vérifié par l'installateur. Pour un lancement sans installation, le bouton proposé à la première lecture installe ce moteur dans le dossier local de Noctra.

## Setup

Installer Inno Setup 7.1.1 (ou Inno Setup 6.4 et plus : le script adapte alors son option d’extraction), puis appeler son compilateur depuis le dossier des sources :

```powershell
$noctraPublish = (Resolve-Path publish).Path
& 'C:/Program Files (x86)/Inno Setup 7/ISCC.exe' "/DPublishDir=$noctraPublish" "/O$PWD/dist" installer/Noctra.iss
```

Adapter uniquement le chemin du compilateur à son emplacement réel. Le moteur mpv provient d'une archive amont épinglée par URL et SHA-256 dans le script. Une connexion Internet est nécessaire lors de sa première installation. Le setup et l'exécutable produits ne sont pas signés.

## Vérifications

Le test de protocole utilise un récepteur Cast TLS local simulé :

```powershell
dotnet run --project tests/protocol/Noctra.Tests.csproj -c Release
```

Le test Windows ouvre une vraie fenêtre et utilise une API locale simulée. Il ne touche pas à l'historique d'un serveur réel. Installer Python, pywinauto, Pillow et FFmpeg, puis fournir une vidéo WebM de 120 secondes :

```powershell
python tests/smoke_windows.py publish/Noctra.exe chemin/vers/video-120s.webm chemin/vers/ffmpeg.exe --screens captures
```

Le moteur est téléchargé à la première lecture. Pour réutiliser un moteur déjà vérifié, ajouter `--mpv chemin/vers/libmpv-2.dll`.

Pour contrôler uniquement le bandeau supérieur, ajouter `--header-only`. Ce scénario vérifie les largeurs de fenêtre de 920 à 2 560 unités, l’alignement des commandes, l’absence de chevauchement et les boutons de fenêtre visibles en mode agrandi. `--fullscreen-only` ajoute les parcours TV native et externe, avec masquage des commandes et restauration de la fenêtre.

`--tv-quality-only` vérifie le choix de pays et les qualités TV. Le scénario fabrique des vidéos HLS locales de 360p, 720p et 1080p ; il vérifie le choix initial de 1080p, la liste des trois qualités, le passage à 720p puis le retour à la meilleure qualité. Ces contrôles font aussi partie du parcours complet.

Le test couvre l'authentification, le stockage protégé de session, deux profils distincts, les reprises, le statut vu, les favoris, les fiches et saisons, la recherche, la découverte, les demandes, la TV et son secours HLS, la multivue et les principales pages d'administration.

Les captures, fichiers de lecture et données d'utilisateurs ayant servi aux vérifications locales ne font pas partie de cette archive.

## Lecteurs externes

Le projet utilise le package Microsoft.Web.WebView2 indiqué dans le fichier projet. Le setup contient le bootstrapper Microsoft signé dans `installer/prerequisites`, et les notices correspondantes sont dans `licences`. Il détecte le runtime avant de lancer son installation.

Pour tester le setup sans modifier une installation utilisateur, compiler une seconde fois avec `/DTestBuild=1` et un dossier de sortie de test. Cette variante a un identifiant et un verrou d’application distincts ; les fichiers du client sont les mêmes.

## Construction automatique (GitHub)

L'action **Noctra Windows** (`.github/workflows/noctra-windows.yml`) tourne sur une machine Windows de GitHub à chaque modification du dossier `windows/`. Elle enchaîne :
1. la construction et les tests de protocole ;
2. la publication x64 autonome ;
3. les setups normal et de test ;
4. le test de l'interface sur API simulée, avec captures ;
5. l'archive des sources.

Les fichiers produits se trouvent dans Actions › Noctra Windows › Artifacts :
- `noctra-windows-setup` : setups et sources ;
- `noctra-windows-captures` : captures d'écran.

Sous Linux, la compilation seule est possible pour une vérification rapide : `dotnet build Noctra.Windows.csproj -p:EnableWindowsTargeting=true`.
