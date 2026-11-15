# AGY Boost Mod Development Guides & Examples

Welcome to the AGY Boost mod creation documentation.

AGY Boost is architected from the ground up for maximum speed, minimal memory usage, and zero bloat. Mod development supports any language suited for your task:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGY Boost Mod                                  │
├──────────────────────────┬──────────────────────────────────────────────────┤
│ Tier 1: UI & Theming     │ Pure CSS, JavaScript, Pure TypeScript            │
│ Tier 2: Heavy Algorithms │ WebAssembly (AssemblyScript, Rust, Zig, C/C++)   │
│ Tier 3: System & Daemons │ Go (Native Sidecars), Python (Spawned Subprocess)│
└──────────────────────────┴──────────────────────────────────────────────────┘
```

| Language                    | Layer          | Target            | Common Use Case                                      |
| :-------------------------- | :------------- | :---------------- | :--------------------------------------------------- |
| **Pure CSS**                | Theming        | Native DOM        | Color palettes, dark/light themes, syntax tokens     |
| **JavaScript / TypeScript** | UI & Controls  | Native V8         | Sidebar panels, toolbars, buttons, DOM observers     |
| **AssemblyScript**          | Compute (Wasm) | WebAssembly       | Fast algorithms using familiar TypeScript syntax     |
| **Go (Golang)**             | Daemons / Wasm | OS Process / Wasm | File watchers, local servers, OS integration (<10MB) |
| **Python**                  | Automation     | Spawned Sidecar   | AI tools, data processing, automation scripts        |
| **Rust**                    | Heavy Compute  | WebAssembly       | AST parsers, streaming crypto, diffing, vector math  |
| **Zig / C / C++**           | Systems (Wasm) | WebAssembly       | C libraries, low-level math, audio/graphics          |

---

## Mod Structure

Every mod lives in its own folder inside your mods directory (`~/Library/Application Support/AGYBoost/mods/` on macOS, `%APPDATA%\AGYBoost\mods\` on Windows).

A mod consists of a manifest (`mod.json`) and one or more entry points:

```text
my-mod/
├── mod.json          # Mod metadata, version, and entry point paths
├── index.js          # Pure TypeScript / JavaScript UI script
├── compute.wasm      # (Optional) High-performance WebAssembly module
└── daemon            # (Optional) Native Go sidecar executable
```

### The `mod.json` Manifest

```json
{
  "id": "my-cool-mod",
  "name": "My Cool Mod",
  "version": "1.0.0",
  "description": "A high-performance mod for Google Antigravity.",
  "author": "Your Name",
  "main": "index.js",
  "wasm": "compute.wasm",
  "daemon": "daemon"
}
```

---

## Detailed Example Walkthroughs

Explore the specific guides based on your mod's requirements:

1. **[Pure TypeScript UI Mod Guide](UI-MOD.md)**
   Build responsive, zero-framework UI elements styled to match Antigravity's Willow Design System using native DOM APIs.

2. **[WebAssembly (Wasm) Compute Guide](WASM-MOD.md)**
   Load and execute precompiled `.wasm` binaries for CPU-intensive tasks, matrix math, or complex algorithms at near-native speeds.

3. **[Go Background Daemon Guide](GO-DAEMON-MOD.md)**
   Spawn ultra-lightweight Go sidecar daemons (<10MB RAM) for background file watching, system integration, and OS automation.
