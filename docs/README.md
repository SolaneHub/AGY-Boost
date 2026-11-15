# AGY Boost Documentation

Welcome to the official documentation for **AGY Boost**, the native modification platform for Google Antigravity.

---

## 🏗️ Architecture & Core Engine

- **[Architecture Overview](ARCHITECTURE.md)** — Understand the native Go engine, pure TypeScript runtime, and Wasm compute pipeline.
- **[Mod SDK Reference](MOD-SDK.md)** — The TypeScript interfaces, globals (`window.AGYBoost`), and `mod.json` specification.

---

## 📚 Mod Development Guides & Examples

- **[Mod Creation Overview](examples/README.md)** — The 3-tier mod structure and workflow.
- **[Theming & Styling Guide](THEMING.md)** — Complete catalog of Antigravity CSS variables & pure CSS themes.
- **[Pure TypeScript UI Mod Guide](examples/UI-MOD.md)** — Zero-framework UI with Antigravity's Willow Design System.
- **[WebAssembly (Wasm) Compute Guide](examples/WASM-MOD.md)** — Near-native performance for heavy computation.
- **[Go Background Daemon Guide](examples/GO-DAEMON-MOD.md)** — Lightweight background services (<10MB RAM).

---

## 🛠️ Operations & Setup

- **[Installation Guide](INSTALLATION.md)** — How to patch, unpatch, and manage Antigravity with `./dist/agy-boost`.
