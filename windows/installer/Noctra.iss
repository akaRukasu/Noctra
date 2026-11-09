#define AppVersion "0.5.9"
#ifndef PublishDir
  #define PublishDir "..\..\noctra-windows-native-publish-059"
#endif

[Setup]
#ifdef TestBuild
AppId={{1E8C09A3-D06F-43BE-85A8-8F3985869805}
#else
AppId={{B60DF151-65F0-4B81-9292-C1031EFB4DE8}
#endif
AppName=Noctra
AppVersion={#AppVersion}
AppPublisher=Noctra
AppCopyright=Noctra
DefaultDirName={localappdata}\Programs\Noctra
DefaultGroupName=Noctra
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.22000
WizardStyle=modern dynamic
WizardSizePercent=115
SetupIconFile=..\Noctra.ico
UninstallDisplayIcon={app}\Noctra.exe
Compression=lzma2/normal
SolidCompression=yes
ArchiveExtraction=auto
OutputDir=..\..\..\outputs
#ifdef TestBuild
OutputBaseFilename=Noctra-QA-0.5.9-x64
CloseApplications=no
AppMutex=NoctraWindowsDesktopQA
#else
OutputBaseFilename=Noctra-Setup-0.5.9-x64
CloseApplications=yes
AppMutex=NoctraWindowsDesktop
#endif
RestartApplications=no
VersionInfoDescription=Installation de Noctra pour Windows
VersionInfoProductName=Noctra
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le bureau"; GroupDescription: "Raccourcis"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Excludes: "*.pdb"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\LISEZ-MOI.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\BILAN-0.5.9.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "prerequisites\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedWebView
Source: "..\licences\*"; DestDir: "{app}\licences"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/20261104/mpv-dev-x86_64-20261104-git-46787be250.7z"; DestDir: "{app}\player\20261104"; DestName: "mpv.7z"; Excludes: "include\*,libmpv.dll.a"; ExternalSize: 31711881; Hash: "5ae0aaa85b2e690e9c574a44e10a86f3d5fe4b406ef6dfa684f5ab25e6bf6306"; Flags: external download extractarchive recursesubdirs ignoreversion; Check: NeedPlayer

[Icons]
Name: "{group}\Noctra"; Filename: "{app}\Noctra.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\Noctra"; Filename: "{app}\Noctra.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installation du composant des lecteurs externes…"; Flags: waituntilterminated; Check: NeedWebView
Filename: "{app}\Noctra.exe"; Description: "Ouvrir Noctra"; Flags: nowait postinstall skipifsilent

[Code]
function NeedWebView: Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := True;
  if RegQueryStringValue(HKLM32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0') then Result := False;
  if RegQueryStringValue(HKCU32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0') then Result := False;
  if RegQueryStringValue(HKCU64, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0') then Result := False;
end;

function NeedPlayer: Boolean;
begin
  Result := not FileExists(ExpandConstant('{app}\player\20261104\libmpv-2.dll'));
end;
