<#
.SYNOPSIS
  Genera (y opcionalmente publica) una release de Tempo para Windows.

.DESCRIPTION
  1. Comprueba herramientas y la version nueva.
  2. Sube "version" en tinyjs.json.
  3. Pasa los tests.
  4. tinyjs publish  -> dist\publish\tempo-<ver>-win.zip + manifest.json (auto-update)
  5. Inno Setup      -> dist\installer\Tempo-Setup-<ver>.exe (lo que descargan los usuarios)
  Con -Publish ademas:
  6. Commit "Release v<ver>" + tag v<ver> + push.
  7. GitHub Release con el zip y el Setup, y el manifest.json el ultimo.
  8. Comprueba que las URLs que usa el updater responden.

  Ver RELEASE.md para el paso a paso.

.EXAMPLE
  .\release.cmd -Version 1.2.0 -Notes "Arreglos en el widget"
  .\release.cmd -Version 1.2.0 -NotesFile notas.md -Publish
#>
[CmdletBinding()]
param(
  # Version nueva (x.y.z). Sin ella se usa la de tinyjs.json (solo para recompilar en local).
  [string]$Version,
  # Notas que vera el usuario en el aviso de actualizacion y en la release.
  [string]$Notes,
  [string]$NotesFile,
  # Ademas de compilar: commit + tag + push + GitHub Release.
  [switch]$Publish,
  # Saltar los tests (no recomendado).
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Repo = 'mobasergio/tempo'
$ConfigPath = Join-Path $Root 'tinyjs.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }
# Comandos nativos: en PowerShell 5.1, con 'Stop', lo que escriben en stderr
# (git push, gh...) se trataria como error aunque terminen bien.
function Run($exe, [string[]]$argv) {
  $ErrorActionPreference = 'Continue'
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { Fail "'$exe $($argv -join ' ')' termino con codigo $LASTEXITCODE" }
}
# Solo el codigo de salida, sin mostrar nada.
function ExitCode($exe, [string[]]$argv) {
  $ErrorActionPreference = 'Continue'
  & $exe @argv 2>&1 | Out-Null
  return $LASTEXITCODE
}

# ───────────────────────── Comprobaciones ─────────────────────────
Step 'Comprobando'

if (-not (Get-Command tinyjs -ErrorAction SilentlyContinue)) { Fail 'No encuentro tinyjs en el PATH.' }
if (-not $SkipTests -and -not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'No encuentro node (hace falta para los tests; o usa -SkipTests).' }

$Iscc = $null
$isccCmd = Get-Command iscc -ErrorAction SilentlyContinue
if ($isccCmd) { $Iscc = $isccCmd.Source }
foreach ($p in @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe")) {
  if (-not $Iscc -and (Test-Path $p)) { $Iscc = $p }
}
if (-not $Iscc) { Fail 'No encuentro Inno Setup. Instalalo con: winget install JRSoftware.InnoSetup' }

$configText = [IO.File]::ReadAllText($ConfigPath)
$config = $configText | ConvertFrom-Json
$current = $config.version
if (-not $Version) { $Version = $current }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "Version '$Version' no valida: usa x.y.z (p. ej. 1.2.0)." }
if ([version]$Version -lt [version]$current) { Fail "La version $Version es menor que la actual ($current)." }

if ($Notes -and $NotesFile) { Fail 'Usa -Notes o -NotesFile, no los dos.' }
if ($NotesFile -and -not (Test-Path $NotesFile)) { Fail "No existe el archivo de notas '$NotesFile'." }
if ($NotesFile) { $NotesFile = (Resolve-Path $NotesFile).Path }

$Tag = "v$Version"
if ($Publish) {
  if (-not $Notes -and -not $NotesFile) { Fail '-Publish necesita -Notes o -NotesFile (salen en el aviso de actualizacion).' }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'No encuentro gh (GitHub CLI): winget install GitHub.cli' }
  if ((ExitCode 'gh' @('auth', 'status')) -ne 0) { Fail 'gh no tiene sesion. Ejecuta: gh auth login' }
  # tinyjs.json puede estar modificado (la subida de version de una prueba en local): se commitea luego.
  $dirty = @(git status --porcelain | Where-Object { $_ -notmatch '^.. tinyjs\.json$' })
  if ($dirty.Count) { Fail "Hay cambios sin commitear. Haz commit (o stash) antes de publicar:`n$($dirty -join "`n")" }
  if ((ExitCode 'git' @('rev-parse', '-q', '--verify', "refs/tags/$Tag")) -eq 0) { Fail "El tag $Tag ya existe en local." }
  if ((ExitCode 'git' @('ls-remote', '--exit-code', '--tags', 'origin', $Tag)) -eq 0) { Fail "El tag $Tag ya existe en GitHub." }
  $vis = gh repo view $Repo --json visibility --jq .visibility
  if ($vis -ne 'PUBLIC') { Fail "El repo $Repo es '$vis': el auto-update necesita que sea publico para descargar el manifest." }
}

Write-Host "  version: $current -> $Version"
Write-Host "  Inno Setup: $Iscc"

# ───────────────────────── Version ─────────────────────────
if ($Version -ne $current) {
  Step "Subiendo la version a $Version en tinyjs.json"
  $newText = [regex]::Replace($configText, '("version"\s*:\s*")[^"]*(")', "`${1}$Version`${2}", 1)
  [IO.File]::WriteAllText($ConfigPath, $newText, $Utf8NoBom)
}

# ───────────────────────── Tests ─────────────────────────
if (-not $SkipTests) {
  Step 'Tests'
  $testFiles = @(Get-ChildItem (Join-Path $Root 'tests') -Filter '*.test.js' | ForEach-Object { $_.FullName })
  Run 'node' (@('--test') + $testFiles)
}

# ───────────────────────── Build + paquete de update ─────────────────────────
Step 'tinyjs publish (build + zip + manifest del auto-update)'
$pubArgs = @('publish')
if ($Notes) { $pubArgs += @('--notes', $Notes) }
if ($NotesFile) { $pubArgs += @('--notes-file', $NotesFile) }
Run 'tinyjs' $pubArgs

$Zip = Join-Path $Root "dist\publish\tempo-$Version-win.zip"
$Manifest = Join-Path $Root 'dist\publish\manifest.json'
if (-not (Test-Path $Zip)) { Fail "tinyjs publish no genero $Zip" }
if (-not (Test-Path $Manifest)) { Fail "tinyjs publish no genero $Manifest" }

# ───────────────────────── Instalador ─────────────────────────
Step 'Inno Setup (instalador)'
Run $Iscc @('/Q', "/DAppVersion=$Version", (Join-Path $Root 'installer\tempo.iss'))
$Setup = Join-Path $Root "dist\installer\Tempo-Setup-$Version.exe"
if (-not (Test-Path $Setup)) { Fail "No se genero $Setup" }

# ───────────────────────── Solo local ─────────────────────────
if (-not $Publish) {
  Step 'Listo (solo en local)'
  Write-Host "  Instalador:  $Setup"
  Write-Host "  Update zip:  $Zip"
  Write-Host "  Manifest:    $Manifest"
  if ($Version -ne $current) {
    Write-Host "`n  OJO: tinyjs.json ahora dice $Version. Si no vas a publicar, deshazlo con: git checkout tinyjs.json" -ForegroundColor Yellow
  }
  Write-Host "`n  Para publicar: .\release.cmd -Version $Version -Notes `"...`" -Publish"
  Write-Host '  (o sube los tres archivos a mano: ver RELEASE.md)'
  exit 0
}

# ───────────────────────── Publicar ─────────────────────────
Step "Commit + tag $Tag + push"
if (git status --porcelain tinyjs.json) {
  Run 'git' @('add', 'tinyjs.json')
  Run 'git' @('commit', '-m', "Release $Tag")
}
Run 'git' @('tag', '-a', $Tag, '-m', "Tempo $Version")
Run 'git' @('push', 'origin', 'HEAD')
Run 'git' @('push', 'origin', $Tag)

Step "GitHub Release $Tag"
$relArgs = @('release', 'create', $Tag, $Zip, $Setup, '--repo', $Repo, '--verify-tag', '--title', "Tempo $Version")
if ($Notes) { $relArgs += @('--notes', $Notes) }
if ($NotesFile) { $relArgs += @('--notes-file', $NotesFile) }
Run 'gh' $relArgs
# El manifest el ultimo: si apuntara a un zip que aun no esta, el updater daria 404.
Run 'gh' @('release', 'upload', $Tag, $Manifest, '--repo', $Repo)

Step 'Comprobando las URLs del updater'
$base = "https://github.com/$Repo/releases/latest/download"
$ok = $true
foreach ($f in @('manifest.json', "tempo-$Version-win.zip", "Tempo-Setup-$Version.exe")) {
  try {
    Invoke-WebRequest -Uri "$base/$f" -Method Head -UseBasicParsing -MaximumRedirection 10 | Out-Null
    Write-Host "  OK  $base/$f" -ForegroundColor Green
  } catch {
    Write-Host "  FALLA  $base/$f  ($($_.Exception.Message))" -ForegroundColor Red
    $ok = $false
  }
}
try {
  $remote = Invoke-RestMethod -Uri "$base/manifest.json" -UseBasicParsing
  if ($remote.version -ne $Version) { Write-Host "  El manifest publicado dice $($remote.version), no $Version" -ForegroundColor Red; $ok = $false }
} catch { $ok = $false }

Step 'Hecho'
Write-Host "  https://github.com/$Repo/releases/tag/$Tag"
Write-Host "  Enlace de descarga para usuarios: $base/Tempo-Setup-$Version.exe"
if (-not $ok) { Fail 'Alguna URL no responde: revisa la release antes de avisar a nadie.' }
