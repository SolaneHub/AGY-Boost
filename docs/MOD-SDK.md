# AGY Boost Mod SDK Reference

The AGY Boost Mod SDK provides strong TypeScript type contracts and runtime primitives for building mods.

The declaration file is located at [`src/sdk/index.d.ts`](../src/sdk/index.d.ts).

---

## Global Objects

When a mod runs inside Antigravity, two global namespaces are accessible:

### 1. `AGYBoost`

The global engine namespace available to all scripts:

- **`AGYBoost.version`**: String version of AGY Boost (e.g. `"0.0.0"`).
- **`AGYBoost.wasm.load<T>(source, imports?)`**: Loads and instantiates a WebAssembly module.
- **`AGYBoost.daemon`**: Interacts with the native Go daemon (`isHealthy`, `spawn`, `kill`).
- **`AGYBoost.ui.el(tag, attrs?, children?)`**: Builds DOM elements matching Willow Design System classes.
- **`AGYBoost.ui.injectCSS(css)`**: Injects CSS directly into `<head>` and returns a cleanup function.
- **`AGYBoost.ui.setTheme(variables)`**: Strongly typed CSS variables setter with autocompletion and rollback.
- **`AGYBoost.ui.observe(selector, callback)`**: MutationObserver helper for watching dynamic UI components.
- **`AGYBoost.ui.syncModStyles()`**: Synchronizes and injects stylesheet files for all active mods.
- **`AGYBoost.ui.openModsView()`**: Opens the mods management overlay.
- **`AGYBoost.ui.closeModsView()`**: Closes the mods management overlay.

### 2. `mod` (Optional context)

When loaded in managed mode:

- **`mod.manifest`**: Read-only `mod.json` object.
- **`mod.wasm`**: Mod-scoped WebAssembly loader.
- **`mod.daemon`**: Mod-scoped background daemon manager (`isHealthy`, `spawn`, `kill`).
- **`mod.ui`**: Mod-scoped Willow UI and theming helper primitives.
- **`mod.onDispose(fn)`**: Registers a cleanup callback executed when the mod is disabled, unloaded, or reloaded.

---

## Security Contracts & Daemon IPC

Mods communicating with the local Go daemon (`127.0.0.1:42042`) inherit the following security contracts:

1. **Loopback Only**: All network communication stays strictly on the local machine (`127.0.0.1`).
2. **CORS Restrictions**: Daemon endpoints enforce strict origin checking. Only Antigravity renderer origins (`http://127.0.0.1:*`, `https://127.0.0.1:*`, `http://localhost:*`, `https://localhost:*`) are accepted.
3. **Loopback Token Authentication**:
   - The daemon automatically provisions a high-entropy 256-bit token stored at `~/.config/AGYBoost/.token` (Linux), `~/Library/Application Support/AGYBoost/.token` (macOS), or `%APPDATA%\AGYBoost\.token` (Windows).
   - In client mod execution, `AGYBoost.daemon` automatically transmits this credential via the `X-AGY-Token` header for all privileged operations (`/mods`, `/mods/toggle`, `/mods/file`, `/daemon/spawn`, `/daemon/kill`).
   - Constant-time validation protects against timing attacks. Unauthorized requests receive `401 Unauthorized`.
4. **Isolated User Data Storage**:
   - Mods are stored in the user data directory:
     - **macOS**: `~/Library/Application Support/AGYBoost/mods/<mod-id>/`
     - **Windows**: `%APPDATA%\AGYBoost\mods\<mod-id>\`
     - **Linux**: `~/.config/AGYBoost/mods/<mod-id>/` (with fallback to `~/.config/agy-boost/mods/<mod-id>/`)
   - Official Antigravity updates never modify or overwrite this directory.

---

## `mod.json` Specification

| Field         | Type                   | Required | Description                                                                        |
| ------------- | ---------------------- | -------- | ---------------------------------------------------------------------------------- |
| `id`          | `string`               | **Yes**  | Unique identifier (e.g. `my-awesome-mod`).                                         |
| `name`        | `string`               | **Yes**  | Human-readable name displayed in the UI.                                           |
| `version`     | `string`               | **Yes**  | Semantic version (e.g. `1.0.0`).                                                   |
| `description` | `string`               | No       | Short summary of what the mod does.                                                |
| `author`      | `string`               | No       | Author name or GitHub handle.                                                      |
| `main`        | `string`               | No       | Path to the pure TypeScript / JavaScript entry point (`index.js`).                 |
| `style`       | `string` \| `string[]` | No       | Path to CSS stylesheet(s) injected automatically when mod is active (`theme.css`). |
| `wasm`        | `string`               | No       | Path to a precompiled `.wasm` binary (`compute.wasm`).                             |
| `daemon`      | `string`               | No       | Path to a native Go sidecar executable (`daemon`).                                 |
