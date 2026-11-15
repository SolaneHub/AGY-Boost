# Guide: WebAssembly (Wasm) Compute Mod

This guide demonstrates how to build a high-performance computation mod for Google Antigravity using **WebAssembly (Wasm)**.

Wasm is ideal for CPU-bound tasks such as:
- AST parsing and large codebase indexing
- Cryptography and hashing
- Vector search and embeddings math
- Audio, image, and canvas transformations

---

## 1. Mod Manifest (`mod.json`)

```json
{
  "id": "my-wasm-compute",
  "name": "Wasm Fast Compute",
  "version": "1.0.0",
  "description": "High-performance WebAssembly algorithm integration for compute-intensive tasks.",
  "author": "Your Name",
  "main": "index.js",
  "wasm": "compute.wasm"
}
```

---

## 2. Generating the Wasm Binary

You can compile any language targeting WebAssembly (`wasm32-unknown-unknown`), including **Rust**, **Zig**, **C/C++**, or **AssemblyScript**.

### Rust Example (`src/lib.rs`):
```rust
#[no_mangle]
pub extern "C" fn calculate_score(a: i32, b: i32) -> i32 {
    (a * 3) + (b * 7)
}
```
Compile with:
```bash
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/my_mod.wasm compute.wasm
```

### Or AssemblyScript (`assembly/index.ts`):
```typescript
export function calculate_score(a: i32, b: i32): i32 {
  return (a * 3) + (b * 7);
}
```

---

## 3. Loading Wasm via `AGYBoost.wasm.load()`

In your `index.js`, use `AGYBoost.wasm.load()`:

```typescript
// Load the precompiled WebAssembly binary
async function initializeComputeMod() {
  try {
    const wasmModule = await AGYBoost.wasm.load<{
      calculate_score: (a: number, b: number) => number;
    }>("compute.wasm");

    // Execute high-speed native calculation
    const score = wasmModule.exports.calculate_score(42, 10);

    const pill = AGYBoost.ui.el("div", {
      class: "fixed top-3 right-3 bg-purple-900/80 text-purple-200 text-xs px-3 py-1.5 rounded-full border border-purple-500/30 font-mono z-50",
    }, [`Wasm Compute Output: score = ${score}`]);

    document.body.appendChild(pill);
  } catch (err) {
    console.error("Failed to load wasm module:", err);
  }
}

initializeComputeMod();
```

---

## 4. Performance Advantages

- **Zero JS Bridge Overhead**: Direct typed array / memory access between V8 and WebAssembly.
- **Native Streaming**: Automatically uses `WebAssembly.instantiateStreaming` when loaded from local HTTP or file endpoints.
- **Microsecond Latency**: Execution runs at raw machine speed without JIT compilation pauses.
