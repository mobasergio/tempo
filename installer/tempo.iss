; Instalador de Tempo para Windows (Inno Setup 6).
; Empaqueta la carpeta dist/ (tempo.exe + launcher.exe + resources/) en un
; único Tempo-Setup-<ver>.exe. Lo compila scripts/release.ps1 (ver RELEASE.md)
; después de `tinyjs publish`, que vacía dist/ antes de compilar.

// La versión llega desde release.ps1 (/DAppVersion=x.y.z, leída de tinyjs.json).
#ifndef AppVersion
  #error Falta la versión: usa release.cmd, o ISCC /DAppVersion=x.y.z installer\tempo.iss
#endif

[Setup]
; No cambiar el AppId: es lo que hace que cada versión se instale encima de la anterior.
AppId={{B46F3777-B99A-450F-9B8F-F0B7014B671F}
AppName=Tempo
AppVersion={#AppVersion}
AppPublisher=mobasergio
; Por usuario, sin UAC, en una carpeta escribible: el auto-update de tinyjs
; sustituye los archivos de la instalación uno a uno.
DefaultDirName={localappdata}\Programs\Tempo
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=Tempo-Setup-{#AppVersion}
UninstallDisplayIcon={app}\tempo.exe
UninstallDisplayName=Tempo
CloseApplications=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\*"; Excludes: "installer\*,publish\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Tempo"; Filename: "{app}\tempo.exe"

[Run]
Filename: "{app}\tempo.exe"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; También lo que añada el updater (archivos nuevos, *.update-old).
Type: filesandordirs; Name: "{app}"
