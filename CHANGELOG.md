# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-16

### Added

- **In-Memory Diagnostic Ring Buffer (`AGYBoost.diagnostics` / `window.__AGY_DIAGNOSTICS__`)**:
  - Implemented a zero-dependency, bounded circular FIFO ring buffer (capacity: 100 entries) in `src/client/diagnostics/ring-buffer.ts`.
  - Captures runtime lifecycle events, warning states, metrics, and errors with timestamps, severity levels (`INFO`, `WARN`, `ERROR`, `METRIC`), source module, and optional structured metadata payloads.
  - Exposes `record()`, `getEntries()`, and `clear()` methods on both `AGYBoost.diagnostics` and `window.__AGY_DIAGNOSTICS__` without invoking forbidden `console.*` logging methods.
  - Integrated into mod execution (`src/client/ui/mods-runner.ts`) to capture execution and disposal errors safely in memory.
- **Universal macOS & Cross-Platform Distribution Matrix**:
  - Added dedicated Apple Silicon (`dist/agy-boost-darwin-arm64`) and Intel Mac (`dist/agy-boost-darwin-amd64`) native compilation targets.
  - Expanded compilation matrix in `scripts/build-go.mjs` and `package.json` (`pnpm run build:all`) producing native binaries for `darwin-arm64`, `darwin-amd64`, `linux-amd64`, `windows-amd64.exe`, and client runtime bundle `agy-boost.js`.
  - Upgraded GitHub Actions CI workflow to Go 1.24 with multi-architecture cross-compilation validation.
- **Disposable Concurrent Stress Test Harness & Strict Memory Gating**:
  - Introduced `tests/stress/daemon_stress_test.go` firing 100 concurrent requests across `/health`, authenticated `/mods`, and heavy 2 MB synthetic Wasm file streaming.
  - Strict memory gating asserting `memStats.Alloc < 8MB` and active system/heap memory `< 10MB`, guaranteeing adherence to the lightweight daemon architectural invariant under burst load.
- **Automated DOM Contract Drift Radar**:
  - Added `tests/ci/test_dom_contract_drift.test.ts` powered by Chrome Headless CDP (Chrome DevTools Protocol).
  - Continuously monitors Antigravity DOM contract invariants (`[data-testid="conversation-view"]`, `[data-main-content-header="true"]`, toolbar controls, and model/permission triggers) and flexbox layout metrics (`flex-grow: 1`, `flex-shrink: 0`), preventing silent upstream UI breakages.

### Changed

- **HTTP Streaming Optimization & Asset Caching for `/mods/file`**:
  - Rewrote the `/mods/file` endpoint in `src/daemon/daemon.go` to stream files directly via `http.ServeContent` instead of loading entire files into memory with `os.ReadFile`.
  - Added native HTTP Range request support (`206 Partial Content`), enabling efficient chunked streaming of large mod assets and WebAssembly binaries.
  - Enabled automatic HTTP caching (`304 Not Modified`) via `Last-Modified` and conditional headers, reducing redundant disk I/O and loopback traffic.
- **Version Alignment**:
  - Bumped release version to `0.1.0` across `package.json`, `src/client/package.json`, `src/client/index.ts`, `src/patcher/patcher.go` (`AGYBoostVersion = "0.1.0"`), `src/sdk/index.d.ts`, and daemon `/health` response.

### Security

- **Windows NTFS Token Permission Hardening via `icacls`**:
  - Implemented platform-specific token file security in `src/daemon/token_windows.go` and `src/daemon/token_unix.go`.
  - On Windows NTFS filesystems, automatically applies `icacls` ACL commands (`/inheritance:r /grant:r "%USERNAME%":(R,W)`) to revoke inherited ACLs and grant exclusive read/write access solely to the current user, matching Unix `0600` permissions.

## [0.0.0] - 2026-11-14

### Changed

- **Documentation & Path Alignment**:
  - Aligned Linux `UserDataDir()` in `src/host/host.go` with standard `~/.config/AGYBoost` and backward-compatible fallback to `~/.config/agy-boost`.
  - Updated client runtime bundle metric in `docs/ARCHITECTURE.md` and `docs/INSTALLATION.md` to reflect real post-optimization size (~44 KB uncompressed, ~11.6 KB gzipped with full Willow UI & Marketplace).
  - Documented modular marketplace architecture (`src/client/ui/marketplace/catalog.ts` and `spotlight.ts`).
  - Documented local daemon IPC security contracts (loopback-only binding, CORS check, token authentication at `~/.config/AGYBoost/.token`).
  - Added text diagram for idempotent patching cycle and host auto-update guardian in `docs/ARCHITECTURE.md`.
  - Updated development command reference in `README.md` with `pnpm run test:fast`, `pnpm run test:integration`, and CI details.

### Added

- **100% Native Architecture**:
  - Replaced legacy multi-package architecture with a clean feature-driven `src/` layout (Go CLI, Patcher, Daemon, Host).
  - Zero-framework Pure TypeScript in-client runtime (`src/client/`) compiled into an embedded single-bundle payload (~44KB uncompressed, ~11.6KB gzipped).
  - WebAssembly high-performance compute integration (`AGYBoost.wasm.load()`).
  - Pure Go Electron ASAR archive generator and reversible patcher (`src/patcher/asar.go`).
  - Native background daemon (<10MB RAM) listening on `127.0.0.1:42042` with secure mod asset serving and lifecycle management (`src/daemon/`).
- **Theming & Styling Engine**:
  - Full catalog of extracted native Antigravity CSS variables in `docs/THEMING.md`.
  - Zero-code pure CSS mod support (`mod.json` with `style: "theme.css"`).
  - Dynamic programmatic theming via `AGYBoost.ui.setTheme()`, `AGYBoost.ui.injectCSS()`, and `AGYBoost.ui.observe()`.
  - Automatic stylesheet injection and cleanup (`syncModStyles`).
- **Developer Experience**:
  - Native Mod SDK type declarations in `src/sdk/index.d.ts`.
  - Full cross-compilation support (`pnpm run build:all` building native binaries for macOS, Linux, and Windows `.exe`).
