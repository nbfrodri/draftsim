# Install DraftSim

[Español](installation.es.md) · [Back to README](../README.md)

Download from [GitHub Releases](https://github.com/nbfrodri/draftsim/releases/latest). Windows packages target x64; Linux packages target x86_64 (amd64). ARM/aarch64 packages are not provided. On Linux, `cat /etc/os-release` and `uname -m` identify your distribution and architecture.

## Windows

| Installer | File | Install |
|---|---|---|
| NSIS, recommended | `DraftSim_<version>_x64-setup.exe` | Double-click and follow the wizard |
| Windows Installer | `DraftSim_<version>_x64_en-US.msi` | Double-click, or use `msiexec /i "path\to\installer.msi"` |

Both install the same application. Open DraftSim from Start. The installer handles Microsoft Edge WebView2 when needed; its bootstrap may require internet access.

## Linux

Choose by distribution, not computer manufacturer. The examples below use v1.9.0; substitute the filename you downloaded. Open a terminal in the download directory.

### Debian, Ubuntu and Linux Mint

```bash
sudo apt install ./DraftSim_1.9.0_amd64.deb
```

### Fedora and openSUSE

Fedora:

```bash
sudo dnf install ./DraftSim-1.9.0-1.x86_64.rpm
```

openSUSE:

```bash
sudo zypper install ./DraftSim-1.9.0-1.x86_64.rpm
```

The package manager resolves dependencies, including WebKitGTK 4.1. Availability depends on the distribution/version. Open DraftSim from the application menu or run `draftsim`.

### AppImage: Arch, Omarchy and compatible Linux systems

Store the file somewhere permanent, such as `~/Applications`, then run:

```bash
chmod +x ./DraftSim_1.9.0_amd64.AppImage
./DraftSim_1.9.0_amd64.AppImage
```

No `sudo` is needed. An AppImage does not automatically create a menu entry. If FUSE is unavailable, use the runtime fallback:

```bash
./DraftSim_1.9.0_amd64.AppImage --appimage-extract-and-run
```

AppImage compatibility still depends on host libraries. On the tested Omarchy system, the release AppImage reported an EGL graphics error even with extraction; the native build below worked. deb/rpm are not native pacman packages.

### Native build for Omarchy / Arch

Install Node.js 22.12+, Rust stable and the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux). From this repository, build without packaging:

```bash
npm ci
npx tauri build --no-bundle --ci --config '{"build":{"beforeBuildCommand":"npm run build -- --webpack"}}'
./src-tauri/target/release/draftsim
```

For a manual per-user installation, close DraftSim and copy the resulting executable:

```bash
install -Dm755 ./src-tauri/target/release/draftsim "$HOME/.local/bin/draftsim"
"$HOME/.local/bin/draftsim"
```

This installs the executable only, without a package-manager record or menu entry. It uses this machine's libraries and is not a portable release. Repeat the build and copy to update it. For other installer builds, see [development and releases](development-and-release.md).

## Updates and saves

Close DraftSim before updating. Run the new Windows installer, install the newer deb/rpm with the same command, or replace your AppImage and grant execution permission again. In-app automatic updates are not configured.

Use **Backups** for a consistent database snapshot and restore. Export/import individual realities when moving them between computers. Desktop saves live under `%APPDATA%\app.draftsim.desktop\` on Windows and `~/.local/share/app.draftsim.desktop/` on Linux; browser previews use separate storage. See [persistence and recovery](persistence-and-recovery.md).

The champion catalogue is bundled. Remote artwork, audio and optional data refreshes need internet access.
