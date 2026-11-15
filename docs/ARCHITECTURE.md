# Architecture

AGY Boost is a 100% native, ultra-lightweight modding platform for Google Antigravity. It is designed around three pillars: **Go** (for the native CLI, ASAR patcher, and background daemon), **Pure TypeScript** (for zero-framework UI injection), and **WebAssembly** (for compute-intensive mod algorithms).

---

## 1. The Shape of the Host

Antigravity's `app.asar` is a lightweight Electron launcher:
- It spawns a local `language_server` on a loopback port.
- It opens a `BrowserWindow` loading `https://127.0.0.1:<port>/`.
- There are no static HTML/UI files on disk to modify directly; all interface customizations must be injected cleanly into the renderer.

---

## 2. Native Go Engine (`src/cli/`, `src/patcher/`, `src/daemon/`, `src/host/`)

AGY Boost avoids heavy runtime dependencies (no external Node.js, Python, or .NET required on the user's machine).

```text
src/cli/             # Single native Go binary entry point (CLI + Patcher + Daemon)
src/patcher/         # Native ASAR packer & reversible bootstrap engine
src/daemon/          # Lightweight HTTP/WebSocket background daemon (<10MB RAM)
src/host/            # Cross-platform Antigravity discovery (macOS, Windows, Linux)
```

### The Native Patcher
1. **Reversible Backup**: Automatically renames `resources/app.asar` to `resources/_app.asar`.
2. **Native ASAR Generation**: In `src/patcher/asar.go`, AGY Boost constructs valid Electron ASAR archives directly in Go, writing a minimal bootstrap `index.js` and `package.json`.
3. **Session Interception**: When Electron boots, the bootstrap hooks `app.on("session-created")` to register the AGY Boost runtime preload script and relaxes Content Security Policy (CSP) for local daemon communication.
4. **Transparent Delegation**: The bootstrap immediately delegates to Antigravity's original entry point (`_app.asar/dist/main.js`). Antigravity's native updates, models, and authentication function completely untouched.

### The Background Daemon
- Starts an HTTP/WebSocket server on `127.0.0.1:42042`.
- Tracks active mods, watches the mods directory, and provides an IPC channel for mods.
- Operates under a strict memory footprint limit of **<10MB RAM**.

---

## 3. Pure TypeScript In-Client Runtime (`src/client/`)

The client runtime is injected directly into Antigravity's renderer:
- **Zero Frameworks**: No React, Vue, or heavy dependencies in the injection bundle. The compiled `runtime.js` is bundled via esbuild (`--minify`, IIFE) into an optimized footprint of **~44 KB** uncompressed (~11.6 KB gzipped) containing the complete Willow UI engine, theme manager, daemon bridge, and full-featured marketplace.
- **Willow Design System Integration**: Mod UI elements and the **AGY Boost Mods** navigation button reuse Antigravity's native Tailwind classes (`bg-card`, `text-card-foreground`, `hover:bg-muted/50`).
- **Layout Safety Invariant**: The runtime strictly respects the host flexbox layout. Elements hiding siblings save their display state and restore to `""` (empty string) to prevent any collapse of `[data-testid="conversation-view"]`.
- **Modular Marketplace (`src/client/ui/marketplace/`)**:
  - `catalog.ts`: Typed, normalized catalog definition (`MarketplaceMod`) structuring featured extensions across categories (`compute`, `theme`, `sidecar`) with badge tags (`WASM`, `GO`, `OFFICIAL`, `FAST`, `UI`, `SIDECAR`).
  - `spotlight.ts`: Interactive hero carousel featuring animated mod cards with sway motion (`agy-spotlight-sway`), SVG circular progress indicators (`agy-spotlight-progress`), auto-rotation timer lifecycle management, and full accessibility pause handling (`prefers-reduced-motion: reduce`, hover/focus-within pause, tab visibility change detection).
  - Clean separation: View rendering (`mods-view.ts`) imports modular spotlight and catalog components, isolating visual presentations and animation timers from core overlay DOM mounting and unmounting.

---

## 4. Local Daemon IPC & Security Architecture

The background daemon operates as a secure local sidecar for the client runtime:
- **Loopback Binding**: Listens strictly on `127.0.0.1:42042`. It does not bind to external network interfaces (`0.0.0.0`).
- **CORS Origin Restriction**: Requests with an `Origin` header are validated against an allowlist permitting only local origins (`http://127.0.0.1:*`, `http://localhost:*`, and `https://` variants used by Antigravity's internal language server). Arbitrary web origins are rejected with `403 Forbidden`.
- **Token-Based Authentication**:
  - Upon startup, the daemon generates a high-entropy 256-bit cryptographic token (64-character hex string) via `crypto/rand`.
  - The token is stored with restricted permissions (`0600`) in the user data directory:
    - **macOS**: `~/Library/Application Support/AGYBoost/.token`
    - **Windows**: `%APPDATA%\AGYBoost\.token`
    - **Linux**: `~/.config/AGYBoost/.token` (or `~/.config/agy-boost/.token` fallback)
  - All privileged endpoints (`/mods`, `/mods/toggle`, `/mods/file`, `/daemon/spawn`, `/daemon/kill`) require the `X-AGY-Token` header.
  - Token verification uses constant-time comparison (`subtle.ConstantTimeCompare`) to prevent timing side-channel attacks.
  - The public `/health` endpoint is unauthenticated, enabling lightweight presence polling without leaking token state.

---

## 5. Idempotent Patching Cycle & Host Update Protection

AGY Boost uses a robust, non-destructive patching model that guarantees safety across repetitive patch runs and official Antigravity application updates.

### Patch & Update Lifecycle

```text
                  [ Official Antigravity Installation ]
                                    │
                                    ▼
                          Is current app.asar
                           a bootstrap archive?
                                 /     \
                               /         \
                       NO (Stock)       YES (Already Patched)
                             │                     │
                Backup current app.asar            │
               to _app.asar (atomic temp)          │
                             │                     │
                             └──────────┬──────────┘
                                        │
                                        ▼
                             Deploy Runtime JS to
                          resources/.agy-boost/runtime.js
                                        │
                                        ▼
                             Generate Minimal Bootstrap
                               app.asar (PackAsar)
                                        │
                                        ▼
                              Write Marker Metadata
                          resources/.agy-boost.json
                                        │
                                        ▼
                                [ Launch Antigravity ]
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 │                                             │
      Electron boots bootstrap.js                   Delegates transparently to
    Registers session preload & CSP                _app.asar/dist/main.js
                 │                                             │
                 └──────────────────────┬──────────────────────┘
                                        │
                                        ▼
                       [ Official Host Update Arrives ]
                                        │
           Antigravity updater replaces app.asar with new official version
           (_app.asar becomes stale, but untouched official version is in place)
                                        │
                                        ▼
                            Next `agy-boost status`
                                        │
           Detects app.asar is stock (IsBootstrapAsar == false)
           -> Flags IsPatched = false (even if marker/.agy-boost exists)
                                        │
                                        ▼
                             `agy-boost patch --safe`
                                        │
           Detects stock app.asar: atomically refreshes _app.asar backup
           with the new official release, then safely re-applies bootstrap!
```

### Key Safety Invariants:
1. **Idempotent**: Re-running `agy-boost patch` when already patched simply refreshes the runtime bundle and bootstrap without corrupting or doubly-wrapping `_app.asar`.
2. **Stale Backup Trap Prevention**: When Antigravity updates itself, Electron's updater overwrites `app.asar` with fresh stock binaries. AGY Boost checks `IsBootstrapAsar(app.asar)`. If the current `app.asar` is official, any existing `_app.asar` is recognized as a previous version backup and replaced with the new official release before re-patching.
3. **Atomic File Operations**: All ASAR archive replacements write to a temporary file (`.tmp`) first and atomically rename into place, preventing corrupt state on unexpected crashes or power interruptions.
4. **Byte-for-Byte Restoration**: `agy-boost unpatch` restores `_app.asar` back to `app.asar` and removes the runtime directory and marker file, leaving no trace on the host.

---

## 6. WebAssembly (Wasm) Compute Tier

Compute-heavy tasks (AST parsing, vector calculations, matrix operations) run in native WebAssembly:
- `AGYBoost.wasm.load()` supports direct byte instantiation and streaming compilation (`WebAssembly.instantiateStreaming`).
- Wasm modules execute at raw near-native speed directly inside V8 with zero JS bridge overhead.

---

## 7. Storage & Isolation

User data and mods are strictly decoupled from the Antigravity application directory:
- **macOS**: `~/Library/Application Support/AGYBoost/mods/`
- **Windows**: `%APPDATA%\AGYBoost\mods\`
- **Linux**: `~/.config/AGYBoost/mods/` (with fallback to `~/.config/agy-boost/mods/` if legacy directory exists)

Because mods live in user data, Antigravity auto-updates will never overwrite or erase your installed mods.
