# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

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
