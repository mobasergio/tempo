# Cómo sacar una versión de Tempo (Windows)

Cada versión da tres archivos. Todos van a una GitHub Release:

| Archivo | Para quién |
|---|---|
| `Tempo-Setup-<ver>.exe` | **Los usuarios.** Es lo único que tienen que descargar. Se instala sin permisos de administrador en `%LOCALAPPDATA%\Programs\Tempo` y añade Tempo al menú Inicio. |
| `tempo-<ver>-win.zip` | El auto-update. Las apps ya instaladas lo descargan y se actualizan solas. |
| `manifest.json` | El auto-update. Le dice a las apps cuál es la última versión y dónde está el zip. |

Enlace para compartir (siempre lleva a la última versión): https://github.com/mobasergio/tempo/releases/latest

---

## Preparación (solo la primera vez)

1. **Inno Setup** (genera el instalador):
   ```
   winget install JRSoftware.InnoSetup
   ```
2. **GitHub CLI** (crea la release):
   ```
   winget install GitHub.cli
   gh auth login
   ```
3. **El repositorio tiene que ser público.** Las apps descargan `manifest.json` sin iniciar sesión; si el repo es privado, el auto-update falla sin avisar. El script lo comprueba antes de publicar.

---

## Sacar una versión (paso a paso)

### 1. Deja todo commiteado
```
git status
```
Solo puede quedar modificado `tinyjs.json`, que es donde va la versión. Si hay cualquier otro cambio, el script no publica.

### 2. Elige el número de versión
Tiene que ser **mayor** que la publicada; si no, las apps instaladas no verán la actualización.
- `1.1.0 → 1.1.1`: solo arreglos
- `1.1.0 → 1.2.0`: algo nuevo
- `1.1.0 → 2.0.0`: cambios grandes

### 3. (Opcional) Prueba en local
```
.\release.cmd -Version 1.2.0 -Notes "Arreglos en el widget"
```
Compila sin publicar nada. Instala `dist\installer\Tempo-Setup-1.2.0.exe` y prueba la app.
Si al final no publicas, deshaz el cambio de versión: `git checkout tinyjs.json`

### 4. Publica
```
.\release.cmd -Version 1.2.0 -Notes "Arreglos en el widget" -Publish
```
Para notas de varias líneas, escríbelas en un archivo:
```
.\release.cmd -Version 1.2.0 -NotesFile notas.md -Publish
```
Las notas aparecen en la página de la release.

El script termina con `OK` en verde en cada URL. Si alguna sale como `FALLA`, mira [Problemas](#problemas).

### 5. Comprueba
- Abre https://github.com/mobasergio/tempo/releases/latest: tiene que aparecer la versión nueva con los tres archivos.
- En un PC con la versión anterior instalada, abre Tempo. Unos 5 segundos después sale la barra *"Nueva versión 1.2.0 disponible · Actualizar"*. Si Tempo ya estaba abierto, puede tardar hasta 24 h (o ciérralo y ábrelo desde la bandeja).

---

## Qué hace `release.cmd`

`release.cmd` llama a `scripts\release.ps1`, sin que haga falta tocar la ExecutionPolicy.

1. **Comprueba** que tienes tinyjs, node e Inno Setup, y que la versión es válida (`x.y.z`, no menor que la actual).
   Con `-Publish` comprueba además que hay notas, que `gh` tiene sesión, que no quedan cambios sin commitear, que el tag `v<ver>` no existe y que el repo es público.
2. **Sube la versión** en `tinyjs.json`.
3. **Pasa los tests** (`node --test`). Si falla alguno, se para.
4. **`tinyjs publish`** compila la app y genera `dist\publish\tempo-<ver>-win.zip` y `manifest.json`.
5. **Inno Setup** genera `dist\installer\Tempo-Setup-<ver>.exe`. La versión se pasa sola: no hay que tocar `installer\tempo.iss`.

Solo con `-Publish`:

6. Hace el commit `Release v<ver>`, crea el tag `v<ver>` y hace push.
7. Crea la GitHub Release con el zip y el Setup, y sube `manifest.json` **el último**. Si el manifest se publicara antes que el zip, las apps intentarían descargar un archivo que todavía no existe.
8. Comprueba que las URLs que usan las apps responden y que el manifest publicado tiene la versión nueva.

Opciones: `-SkipTests` salta los tests (no se recomienda). Sin `-Version`, recompila la versión actual.

---

## A mano (si no tienes `gh` o el script falla a mitad)

1. Sube `version` en `tinyjs.json`, haz commit y push.
2. `.\release.cmd -Notes "..."` (sin `-Version`: compila la versión que ya pusiste).
3. En GitHub, ve a **Releases** → **Draft a new release**. Tag: `v1.2.0` (créalo ahí), título `Tempo 1.2.0`, notas.
4. Adjunta primero `dist\publish\tempo-1.2.0-win.zip` y `dist\installer\Tempo-Setup-1.2.0.exe`, y después `dist\publish\manifest.json`.
5. **Publish release.** Deja marcada la opción "Set as the latest release": el auto-update lee siempre la última.

---

## Problemas

**El script se paró después del push pero antes de crear la release.**
El tag ya existe, así que volver a ejecutar el script da error. Termina la release a mano:
```
gh release create v1.2.0 dist\publish\tempo-1.2.0-win.zip dist\installer\Tempo-Setup-1.2.0.exe --verify-tag --title "Tempo 1.2.0" --notes "..."
gh release upload v1.2.0 dist\publish\manifest.json
```

**No sale la barra de actualización.**
- ¿La versión publicada es mayor que la instalada?
- Abre https://github.com/mobasergio/tempo/releases/latest/download/manifest.json. Tiene que descargarse y mostrar la versión nueva.
- La app solo comprueba al arrancar y luego cada 24 h. Ciérrala desde la bandeja y vuelve a abrirla.
- Los fallos de conexión no avisan: sin internet, simplemente no sale la barra.

**"No se pudo actualizar: update swap failed".**
Algún archivo de la instalación estaba bloqueado, por ejemplo por un antivirus. La versión anterior sigue funcionando: pulsa *Reintentar*. Si vuelve a fallar, instala con el Setup nuevo, que se pone encima de la versión anterior y conserva los datos.

**Me equivoqué en una release.**
No borres los archivos de la última release mientras las apps puedan estar descargándolos. Saca una versión nueva (`1.2.1`) con el arreglo.

---

## Archivos relacionados

- `release.cmd` y `scripts\release.ps1`: la automatización.
- `installer\tempo.iss`: el instalador. **No cambies el `AppId`**: es lo que hace que cada versión se instale encima de la anterior.
- `tinyjs.json` → `update.url`: dónde busca el manifest la app. `"auto": "daily"` comprueba al arrancar y cada 24 h.
- `src\frontend\features\update.js`: la barra de "Nueva versión disponible".
