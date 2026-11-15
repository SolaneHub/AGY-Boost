import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadWasm } from "../wasm/loader.js";

describe("Wasm Loader (loadWasm)", () => {
  // Minimal valid WebAssembly binary module (8 bytes: magic number \0asm and version 1)
  const MINIMAL_WASM_BYTES = new Uint8Array([
    0x00,
    0x61,
    0x73,
    0x6d, // \0asm
    0x01,
    0x00,
    0x00,
    0x00, // version 1
  ]);

  test("instantiates WebAssembly instance from valid Uint8Array buffer", async () => {
    const instance = await loadWasm(MINIMAL_WASM_BYTES);
    assert.ok(instance);
    assert.ok(instance instanceof WebAssembly.Instance);
    assert.ok(typeof instance.exports === "object");
  });

  test("instantiates WebAssembly instance from ArrayBuffer", async () => {
    const buffer = MINIMAL_WASM_BYTES.buffer.slice(0);
    const instance = await loadWasm(buffer);
    assert.ok(instance instanceof WebAssembly.Instance);
  });

  test("rejects when provided invalid WebAssembly bytecode", async () => {
    const invalidBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await assert.rejects(async () => {
      await loadWasm(invalidBytes);
    });
  });

  test("fetches and instantiates wasm from URL", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "http://127.0.0.1:42042/mods/file?id=test&file=main.wasm") {
          return new Response(MINIMAL_WASM_BYTES, {
            status: 200,
            headers: { "Content-Type": "application/wasm" },
          });
        }
        return new Response("Not found", { status: 404, statusText: "Not Found" });
      }) as typeof fetch;

      const instance = await loadWasm("http://127.0.0.1:42042/mods/file?id=test&file=main.wasm");
      assert.ok(instance instanceof WebAssembly.Instance);

      await assert.rejects(async () => {
        await loadWasm("http://127.0.0.1:42042/not-found.wasm");
      }, /Failed to fetch wasm binary/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
