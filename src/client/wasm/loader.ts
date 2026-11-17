// Native WebAssembly Loader for AGY Boost Mods

export async function loadWasm<T extends WebAssembly.Exports = WebAssembly.Exports>(
  source: string | ArrayBuffer | Uint8Array,
  importObject?: WebAssembly.Imports,
): Promise<WebAssembly.Instance & { exports: T }> {
  let bytes: BufferSource;

  if (typeof source === "string") {
    // If running in browser/renderer, fetch directly
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch wasm binary from ${source}: ${response.statusText}`);
    }
    // Use WebAssembly.instantiateStreaming if supported for blazing speed
    if ("instantiateStreaming" in WebAssembly) {
      try {
        const streamResult = await WebAssembly.instantiateStreaming(response, importObject);
        return streamResult.instance as WebAssembly.Instance & { exports: T };
      } catch {
        // Fallback to arrayBuffer if streaming failed
      }
    }
    bytes = await response.arrayBuffer();
  } else {
    bytes = source as BufferSource;
  }

  const result = await WebAssembly.instantiate(bytes, importObject);
  const instance = "instance" in result ? result.instance : result;
  return instance as WebAssembly.Instance & { exports: T };
}
