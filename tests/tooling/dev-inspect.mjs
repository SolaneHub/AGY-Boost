// Talks to a running Antigravity over the Chrome DevTools Protocol so the
// injected UI can be inspected without fighting the Windows foreground lock.
//
//   node tests/tooling/dev-inspect.mjs launch          restart Antigravity with a debug port
//   node tests/tooling/dev-inspect.mjs shot [file]     screenshot the renderer
//   node tests/tooling/dev-inspect.mjs eval "<expr>"   evaluate an expression in the page
//   node tests/tooling/dev-inspect.mjs run <file.js>   evaluate a file, avoiding shell quoting
//
// Antigravity always enables remote debugging (main.js appends the switch when
// it is absent), so `launch` only pins it to a predictable port.

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// Overridable so the same tool can drive the installer, which serves its UI
// from a file:// URL on a different port.
let defaultPort = 9333;
try {
  const appData =
    process.platform === "darwin"
      ? path.join(process.env["HOME"] ?? "", "Library", "Application Support")
      : (process.env["APPDATA"] ?? "");
  const activePortFile = path.join(appData, "Antigravity", "DevToolsActivePort");
  const content = readFileSync(activePortFile, "utf8");
  const firstLine = content.split("\n")[0];
  const parsed = firstLine ? Number.parseInt(firstLine.trim(), 10) : 0;
  if (parsed > 0) defaultPort = parsed;
} catch {}

const PORT = Number(process.env["AGY_INSPECT_PORT"] ?? defaultPort);
const HOST_URL_PREFIX = process.env["AGY_INSPECT_URL_PREFIX"] ?? "https://127.0.0.1:";
const executable = path.join(
  process.env["LOCALAPPDATA"] ?? "",
  "Programs",
  "Antigravity",
  "Antigravity.exe",
);

/** @param {number} ms */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!response.ok) throw new Error(`DevTools endpoint returned ${response.status}`);
  return response.json();
}

/** Waits for the window showing Antigravity's real UI, not the loading overlay. */
async function waitForPage(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not reachable yet";
  while (Date.now() < deadline) {
    try {
      /** @type {any[]} */
      const targets = await listTargets();
      const page = targets.find(
        (/** @type {any} */ target) =>
          target.type === "page" && String(target.url).startsWith(HOST_URL_PREFIX),
      );
      if (page) return page;
      lastError = `no page on ${HOST_URL_PREFIX}* yet (${targets.length} target(s))`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for the Antigravity page: ${lastError}`);
}

/**
 * @param {string} webSocketUrl
 * @param {string} method
 * @param {Record<string, any>} [params]
 */
async function send(webSocketUrl, method, params = {}) {
  const socket = new WebSocket(webSocketUrl);
  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Could not open the DevTools socket.")),
        { once: true },
      );
    });

    const id = 1;
    const reply = new Promise((resolve, reject) => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id !== id) return;
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      setTimeout(() => reject(new Error(`${method} timed out.`)), 120_000);
    });

    socket.send(JSON.stringify({ id, method, params }));
    return await reply;
  } finally {
    socket.close();
  }
}

const [command = "shot", argument] = process.argv.slice(2);

if (command === "launch") {
  // Spawn Antigravity directly so its DevToolsActivePort is updated. We do not
  // try to kill it first: the user might have unsaved edits in an active tab.
  const child = spawn(executable, [`--remote-debugging-port=${PORT}`], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log(`Launched Antigravity on port ${PORT} (PID ${child.pid}). Waiting for UI...`);
  const page = await waitForPage();
  console.log(`Ready: ${page.title} (${page.url})`);
  process.exit(0);
}

const page = await waitForPage();

if (command === "shot") {
  const file = argument ?? `shot-${Date.now()}.png`;
  const result = await send(page.webSocketDebuggerUrl, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(file, Buffer.from(result.data, "base64"));
  console.log(`Wrote ${file} (${Math.round((result.data.length * 0.75) / 1024)} KB)`);
} else if (command === "eval") {
  if (!argument) {
    console.error("Usage: node tests/tooling/dev-inspect.mjs eval '<expression>'");
    process.exit(1);
  }
  const result = await send(page.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: argument,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    console.error("Evaluation threw:", result.exceptionDetails);
    process.exit(2);
  }
  console.log(JSON.stringify(result.result?.value, null, 2));
} else if (command === "run") {
  if (!argument) {
    console.error("Usage: node tests/tooling/dev-inspect.mjs run <file.js>");
    process.exit(1);
  }
  const source = await readFile(argument, "utf8");
  const result = await send(page.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `(() => {\n${source}\n})()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    console.error("Script threw:", result.exceptionDetails);
    process.exit(2);
  }
  console.log(JSON.stringify(result.result?.value, null, 2));
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
