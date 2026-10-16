# Instalar DraftSim

[English](installation.md) · [Volver al README](../README.es.md)

Descarga desde [GitHub Releases](https://github.com/nbfrodri/draftsim/releases/latest). Los paquetes de Windows son x64 y los de Linux x86_64 (amd64). No hay paquetes ARM/aarch64. En Linux, `cat /etc/os-release` y `uname -m` identifican tu distribución y arquitectura.

## Windows

| Instalador | Archivo | Instalación |
|---|---|---|
| NSIS, recomendado | `DraftSim_<version>_x64-setup.exe` | Haz doble clic y sigue el asistente |
| Windows Installer | `DraftSim_<version>_x64_en-US.msi` | Haz doble clic o usa `msiexec /i "ruta\al\instalador.msi"` |

Ambos instalan la misma aplicación. Abre DraftSim desde Inicio. El instalador gestiona Microsoft Edge WebView2 si hace falta; su descarga puede necesitar conexión.

## Linux

Elige según la distribución, no según el fabricante del ordenador. Los ejemplos usan v1.9.0; sustituye el nombre por el archivo descargado. Abre una terminal en la carpeta de descarga.

### Debian, Ubuntu y Linux Mint

```bash
sudo apt install ./DraftSim_1.9.0_amd64.deb
```

### Fedora y openSUSE

Fedora:

```bash
sudo dnf install ./DraftSim-1.9.0-1.x86_64.rpm
```

openSUSE:

```bash
sudo zypper install ./DraftSim-1.9.0-1.x86_64.rpm
```

El gestor resuelve las dependencias, incluido WebKitGTK 4.1. Su disponibilidad depende de la distribución y versión. Abre DraftSim desde el menú de aplicaciones o ejecuta `draftsim`.

### AppImage: Arch, Omarchy y sistemas Linux compatibles

Guarda el archivo en una ubicación permanente, como `~/Applications`, y ejecuta:

```bash
chmod +x ./DraftSim_1.9.0_amd64.AppImage
./DraftSim_1.9.0_amd64.AppImage
```

No necesita `sudo`. Un AppImage no crea automáticamente una entrada en el menú. Si FUSE no está disponible, usa la alternativa del runtime:

```bash
./DraftSim_1.9.0_amd64.AppImage --appimage-extract-and-run
```

La compatibilidad sigue dependiendo de las bibliotecas del sistema. En el equipo Omarchy probado, el AppImage de la release mostró un error gráfico de EGL incluso con extracción; la compilación nativa de abajo funcionó. deb/rpm no son paquetes nativos de pacman.

### Compilación nativa para Omarchy / Arch

Instala Node.js 22.12+, Rust estable y los [requisitos de Linux de Tauri](https://v2.tauri.app/start/prerequisites/#linux). Desde este repositorio, compila sin empaquetar:

```bash
npm ci
npx tauri build --no-bundle --ci --config '{"build":{"beforeBuildCommand":"npm run build -- --webpack"}}'
./src-tauri/target/release/draftsim
```

Para una instalación manual por usuario, cierra DraftSim y copia el ejecutable generado:

```bash
install -Dm755 ./src-tauri/target/release/draftsim "$HOME/.local/bin/draftsim"
"$HOME/.local/bin/draftsim"
```

Esto instala solo el ejecutable, sin registro en el gestor ni entrada en el menú. Utiliza las bibliotecas de este equipo y no es una release portable. Para actualizar, repite el build y la copia. Consulta [desarrollo y releases](development-and-release.md) para compilar otros instaladores.

## Actualizaciones y partidas

Cierra DraftSim antes de actualizar. Ejecuta el nuevo instalador de Windows, instala el deb/rpm nuevo con el mismo comando o sustituye el AppImage y vuelve a darle permiso de ejecución. No hay actualizaciones automáticas dentro de la aplicación.

Usa **Backups** para crear y restaurar una copia coherente de la base de datos. Exporta/importa realidades individuales para moverlas entre equipos. Los datos de escritorio están en `%APPDATA%\app.draftsim.desktop\` en Windows y `~/.local/share/app.draftsim.desktop/` en Linux; la vista de navegador utiliza otro almacenamiento. Consulta [persistencia y recuperación](persistence-and-recovery.md).

El catálogo de campeones viene incluido. Las imágenes remotas, el audio y las actualizaciones opcionales de datos necesitan conexión.
