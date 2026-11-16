# Installing AGY Boost

AGY Boost supports Windows, macOS, and Linux for standalone Google Antigravity 2.x desktop applications.

---

## 1. Quick Installation via CLI

The native `agy-boost` binary handles detection, patching, and restoration automatically with zero external dependencies.

Precompiled binaries for each architecture are located in `dist/`:

- **macOS Apple Silicon**: `dist/agy-boost-darwin-arm64`
- **macOS Intel**: `dist/agy-boost-darwin-amd64`
- **Linux x86_64**: `dist/agy-boost-linux-amd64`
- **Windows x86_64**: `dist/agy-boost-windows-amd64.exe`
- **Host Binary**: `dist/agy-boost` (or `dist/agy-boost.exe` on Windows)

### Check Status

```bash
./dist/agy-boost status
```

### Apply Patch

```bash
./dist/agy-boost patch --safe
```

This safely creates a backup (`_app.asar`), deploys the lightweight runtime (~44 KB uncompressed, ~11.6 KB gzipped), and registers the AGY Boost bootstrap.

### Restore to Stock (Unpatch)

```bash
./dist/agy-boost unpatch
```

Restores Antigravity to its untouched stock state byte-for-byte.

---

## 2. Platform Installation Paths

| Platform    | Antigravity Location                               | User Mods Directory                            |
| ----------- | -------------------------------------------------- | ---------------------------------------------- |
| **macOS**   | `/Applications/Antigravity.app`                    | `~/Library/Application Support/AGYBoost/mods/` |
| **Windows** | `%LOCALAPPDATA%\Programs\Antigravity`              | `%APPDATA%\AGYBoost\mods\`                     |
| **Linux**   | `/opt/Antigravity` or `~/.local/share/Antigravity` | `~/.config/AGYBoost/mods/`                     |

---

## 3. Launching the Background Daemon

To enable system-level mod features and background tasks:

```bash
./dist/agy-boost daemon
```

The daemon starts an ultra-lightweight loopback server on `127.0.0.1:42042` with a memory footprint of **<10MB RAM**.

---

## 4. Accessing Mods in Antigravity

1. Open Google Antigravity.
2. In the navigation sidebar, click **AGY Boost Mods**.
3. The mods management overlay opens, displaying all installed mods, active status, and daemon health.
