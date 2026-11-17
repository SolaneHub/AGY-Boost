<div align="center">

# 🚀 AGY Boost

**The high-performance modding and extension platform for [Google Antigravity](https://antigravity.google).**

Lightweight, ultra-fast, and zero-framework. Extend Antigravity with pure TypeScript UI, compile heavy compute to WebAssembly, and run lightweight Go sidecar daemons.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Antigravity 2.x](https://img.shields.io/badge/Antigravity-2.x-FFC799)](https://antigravity.google)
[![Platform: Windows | macOS | Linux](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4)](docs/INSTALLATION.md)

[Install](docs/INSTALLATION.md) · [Make a mod](docs/examples/README.md) · [Architecture](docs/ARCHITECTURE.md)

</div>

---

> [!IMPORTANT]
> **Compatibility**: AGY Boost is engineered specifically for the standalone **Google Antigravity 2.0 desktop application** (`Antigravity.exe` / `Antigravity.app`). It does not patch the VS Code-based Antigravity IDE workbench.

---

## Architecture & Modding Ecosystem

AGY Boost is architected from the ground up for maximum speed and minimal memory footprint:

| Layer                    | Technology             | Purpose                                                                                                                                      |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI Components**        | **Pure TypeScript**    | Zero-framework native DOM. No React, Vue, or heavy bundle overhead. Native styling matching Antigravity's Willow Design System.              |
| **Intensive Algorithms** | **WebAssembly (Wasm)** | High-performance compute compiled from Rust, AssemblyScript, Zig, or C/C++. Instant instantiation with `AGYBoost.wasm.load()`.               |
| **Background Daemons**   | **Go (Golang)**        | Ultra-lightweight sidecars (<10MB RAM, fast boot). Managed lifecycle with `AGYBoost.daemon.spawn()` that cleanly auto-terminates on disable. |

---

## 🛠️ Supported Modding Languages

AGY Boost is language-agnostic. While the host engine is built in native Go and Pure TypeScript, you can write mods, themes, background services, and algorithms in the language you know best:

| Language                       | Mod Tier                  | Execution Target           | Best For                                                   | Typical Overhead                           |
| :----------------------------- | :------------------------ | :------------------------- | :--------------------------------------------------------- | :----------------------------------------- |
| **🎨 Pure CSS**                | Visual Theming            | Native Browser CSS Engine  | Color schemes, custom themes, syntax styling               | **Zero overhead** (pure declarations)      |
| **⚡ JavaScript / TypeScript** | UI & DOM Controls         | Native V8 Runtime          | Buttons, modals, sidebar widgets, keyboard shortcuts       | **< 1 ms** startup                         |
| **🚀 AssemblyScript**          | High-Performance Compute  | WebAssembly (V8 Wasm)      | Fast algorithms with TypeScript syntax (no Rust needed)    | **Near-native speed**, zero learning curve |
| **🐹 Go (Golang)**             | Sidecars & Daemons / Wasm | Native OS Process / Wasm   | File watchers, local servers, OS tools, background workers | **< 10MB RAM**, sub-millisecond IPC        |
| **🐍 Python**                  | Scripting & AI Automation | Spawned Sidecar via Daemon | AI models, local scripts, data processing, pipelines       | Flexible scripting via IPC                 |
| **🦀 Rust**                    | Intensive Algorithms      | WebAssembly (`wasm32`)     | Heavy math, AST parsers, streaming cryptography, diffing   | **Maximum machine speed**, zero GC pauses  |
| **⚡ Zig / C / C++**           | Low-Level Systems / Wasm  | WebAssembly (`wasm32`)     | Existing C libraries, low-level algorithms, audio/canvas   | Direct linear memory access                |

### 1. 🎨 Pure CSS (Zero Code)

Customize Antigravity's look and feel without writing a single line of JavaScript. Simply define your styles in a `.css` file referencing Antigravity's native CSS design tokens:

```css
/* theme.css */
:root {
  --background: #0d1117;
  --sidebar: #161b22;
  --primary: #58a6ff;
  --syntax-keyword: #ff7b72;
}
```

Register it in `mod.json`:

```json
{
  "id": "dark-nord-theme",
  "name": "Dark Nord Theme",
  "version": "1.0.0",
  "style": "theme.css"
}
```

### 2. ⚡ JavaScript & TypeScript

Build interactive UI elements using Antigravity's Willow Design System and zero-framework DOM primitives:

```ts
// index.js
AGYBoost.ui.observe('[data-testid="conversation-row-sidebar"]', (row) => {
  row.setAttribute("data-boosted", "true");
});
```

### 3. 🚀 AssemblyScript (TypeScript for WebAssembly)

Want WebAssembly performance without learning Rust or C++? Write TypeScript syntax and compile directly to Wasm:

```ts
// assembly/index.ts
export function compute_score(input: i32, multiplier: i32): i32 {
  return input * multiplier + 42;
}
```

Compile with `asc assembly/index.ts -o compute.wasm` and instantiate directly via `AGYBoost.wasm.load("compute.wasm")`.

### 4. 🐹 Go (Golang)

Create ultra-lightweight background sidecar daemons that manage long-running tasks, file watchers, or local HTTP APIs:

```go
// daemon/main.go
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"status":"ok"}`)
	})
	http.ListenAndServe(":9876", nil)
}
```

Declare `"daemon": "my-daemon"` in `mod.json`. AGY Boost handles starting and cleanly terminating the process when the mod is toggled. Alternatively, compile Go directly to Wasm with `GOOS=js GOARCH=wasm`.

### 5. 🐍 Python

Run AI automation, data processing, and scripting by spawning Python processes through the native daemon IPC bridge:

```ts
// index.js
const proc = await AGYBoost.daemon.spawn(["python3", "analyze.py"]);
proc.onStdout((data) => {
  const badge = document.querySelector("#my-status-badge");
  if (badge) badge.textContent = data.trim();
});
```

### 6. 🦀 Rust

For CPU-bound computation, AST parsing, cryptography, and large-file diffing with guaranteed memory safety:

```rust
// src/lib.rs
#[no_mangle]
pub extern "C" fn fast_hash(input: i32) -> i32 {
    input.rotate_left(5) ^ 0x5F3759DF
}
```

Compile with `cargo build --target wasm32-unknown-unknown --release` and load instantly into Antigravity:

```ts
const wasm = await AGYBoost.wasm.load<{ fast_hash: (x: number) => number }>("compute.wasm");
const hash = wasm.exports.fast_hash(1337);
```

### 7. ⚡ Zig / C / C++

Compile existing C/C++ libraries or ultra-fast Zig code to freestanding WebAssembly:

```zig
// main.zig
export fn add(a: i32, b: i32) i32 {
    return a + b;
}
```

Compile with `zig build-exe main.zig -target wasm32-freestanding -O ReleaseFast` and load the `.wasm` file into your mod.

---

## Features

- **Dedicated Native Mods View**: Access the full-viewport **Mods** panel directly from Antigravity's sidebar beneath _Customizations_. Antigravity's native settings modal remains 100% pristine and untouched.
- **Runtime Injection**: Intercepts Antigravity safely at launch using a lightweight bootstrap without modifying any source files on disk permanently.
- **Safe & Fully Reversible**: The original host archive is preserved as `_app.asar`. Uninstalling restores the original bundle byte-for-byte.
- **Automatic Host Update Guardian**: Re-patches Antigravity seamlessly in the background when the application receives an official update.
- **Non-Destructive User Data**: Mods and configurations live safely in `%APPDATA%\AGYBoost` (Windows), `~/Library/Application Support/AGYBoost` (macOS), or `~/.config/AGYBoost` (Linux), completely separate from host application binaries.
- **In-Memory Diagnostic Ring Buffer**: Safe, zero-dependency circular FIFO diagnostics (`AGYBoost.diagnostics` / `window.__AGY_DIAGNOSTICS__`) tracking runtime lifecycle, metrics, and errors in memory without forbidden `console.*` logging.
- **Optimized HTTP Streaming & Range Support**: Native `/mods/file` asset serving with HTTP Range requests (`206 Partial Content`) and conditional caching (`304 Not Modified`), keeping the daemon footprint strictly bounded under 10MB RAM.
- **Windows NTFS Token Permission Hardening**: Cryptographic daemon authentication tokens are hardened on Windows NTFS via `icacls` ACLs (`/inheritance:r /grant:r "%USERNAME%":(R,W)`) alongside `0600` permissions on Unix/macOS.
- **DOM Contract Drift Radar**: Automated Chrome Headless CDP verification continuously ensuring Antigravity flexbox invariants and DOM selectors remain intact across host updates.

---

## Quick Start: A Mod in 30 Seconds

```ts
// index.js
AGYBoost.ui.observe('[data-testid="conversation-row-sidebar"]', (row) => {
  row.setAttribute("data-boosted", "true");
});

if (typeof mod !== "undefined" && mod.onDispose) {
  mod.onDispose(() => {
    // Teardown callback when mod is disabled
  });
}
```

With a `mod.json` beside it:

```json
{
  "id": "quick-greet",
  "name": "Quick Greet",
  "version": "1.0.0",
  "description": "Customizes conversation titles with pure TypeScript.",
  "author": "You",
  "main": "index.js"
}
```

Drop the folder into your `mods/` directory, open Antigravity, click **AGY Boost Mods** in the sidebar, and your mod is active!

---

## Repository Structure

```text
src/
├── cli/             Native Go CLI application and main entry point
├── patcher/         Pure Go ASAR packer and reversible bootstrap patcher
├── daemon/          Native background daemon (<10MB RAM, HTTP/WebSocket IPC)
├── host/            Antigravity cross-platform installation detection
├── client/          In-client Pure TypeScript runtime (Willow UI, Themes, Wasm, Diagnostics)
└── sdk/             TypeScript type definitions for mod authors (index.d.ts)
dist/
├── agy-boost                    Host native binary
├── agy-boost-darwin-arm64       macOS Apple Silicon binary
├── agy-boost-darwin-amd64       macOS Intel binary
├── agy-boost-linux-amd64        Linux x86_64 binary
├── agy-boost-windows-amd64.exe  Windows x86_64 executable
└── agy-boost.js                 Client runtime bundle (<100KB IIFE)
docs/                Official documentation & mod development guides
docs/examples/       Detailed walkthroughs for UI, Wasm, and Go sidecar mods
```

---

## Development

Requires Go 1.22+, Node.js 22+, and pnpm 10+:

```bash
pnpm install
```

### Commands

| Command                     | Description                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm run format`           | Auto-format all code across all languages (Prettier + gofmt)                               |
| `pnpm run format:check`     | Check code formatting across all languages without modifying files                         |
| `pnpm run lint`             | Run linters for all languages (ESLint for TS/JS + go vet / golangci-lint for Go)           |
| `pnpm run lint:fix`         | Automatically fix lint and formatting issues across all languages                          |
| `pnpm run typecheck`        | Run typechecking across all languages (TypeScript client/SDK + Go packages)                |
| `pnpm run test:fast`        | Fast pre-push feedback: typecheck, short unit tests, client test suite                     |
| `pnpm run test:stress`      | Run concurrent stress test harness with strict memory gating (<10MB RAM)                   |
| `pnpm test`                 | Run full native Go test suite (unit + integration)                                         |
| `pnpm run test:integration` | Run end-to-end integration tests (`tests/integration/...`)                                 |
| `pnpm build`                | Bundle client runtime (esbuild) and compile host Go binary                                 |
| `pnpm run build:all`        | Cross-compile native distribution matrix (darwin/arm64, darwin/amd64, linux, windows .exe) |
| `pnpm check`                | Full verification pipeline (format:check + lint + test:all + build)                        |

### Testing & Verification Suites

1. **Lifecycle Integration Suite (`tests/integration/lifecycle_test.go`)**: Verifies full lifecycle behavior using real simulated Antigravity directories:
   - Stock unpatched detection
   - Safe patching and bootstrap archive construction
   - Runtime injection verification
   - Host update scenario simulation (overwritten `app.asar` with existing `_app.asar`)
   - Byte-for-byte unpatch restoration

2. **Concurrent Stress & Memory Gating (`tests/stress/daemon_stress_test.go`)**: Fires 100 concurrent requests across `/health`, `/mods`, and heavy synthetic WebAssembly streaming, asserting daemon heap memory stays `<8MB` and active system RAM remains `<10MB`.

3. **DOM Contract Drift Radar (`tests/ci/test_dom_contract_drift.test.ts`)**: Uses Chrome Headless via CDP to continuously audit live DOM selectors and enforce Antigravity conversation flexbox invariants (`display: flex`, `flex-direction: column`, `flex-grow: 1`).

Run integration tests directly via:

```bash
pnpm run test:integration
```

### CLI Usage

```bash
./dist/agy-boost status   # Check Antigravity & patch status
./dist/agy-boost patch    # Apply native patch
./dist/agy-boost unpatch  # Restore stock Antigravity
./dist/agy-boost daemon   # Start native background daemon
```

Inspect and live-reload modifications in your running Antigravity:

```bash
node tests/tooling/dev-inspect.mjs eval "window.AGYBoost.version"
```

---

## License

[MIT](LICENSE).

AGY Boost is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Google.
