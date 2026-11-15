import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

fs.mkdirSync("dist", { recursive: true });

const target = process.argv[2] || "host";

function buildBinary(outPath, envVars = {}) {
  const binaryPath = path.normalize(outPath);
  const result = spawnSync("go", ["build", "-trimpath", "-o", binaryPath, "./src/cli"], {
    env: { ...process.env, ...envVars },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (target === "all") {
  const hostOut = process.platform === "win32" ? "dist/agy-boost.exe" : "dist/agy-boost";
  buildBinary(hostOut);
  buildBinary("dist/agy-boost.exe", { GOOS: "windows", GOARCH: "amd64" });
  buildBinary("dist/agy-boost-linux", { GOOS: "linux", GOARCH: "amd64" });
} else if (target === "win") {
  buildBinary("dist/agy-boost.exe", { GOOS: "windows", GOARCH: "amd64" });
} else if (target === "linux") {
  buildBinary("dist/agy-boost-linux", { GOOS: "linux", GOARCH: "amd64" });
} else {
  const hostOut = process.platform === "win32" ? "dist/agy-boost.exe" : "dist/agy-boost";
  buildBinary(hostOut);
}
