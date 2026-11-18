import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Absolute path to the AGY Boost project workspace root.
 */
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: Error;
}

/**
 * Resolves binary name accounting for Windows command wrappers (.cmd / .bat / .exe).
 */
export function resolveBinary(cmd: string): string {
  if (process.platform === "win32") {
    if (cmd === "pnpm") {
      return "pnpm.cmd";
    }
    if (cmd === "npm") {
      return "npm.cmd";
    }
    if (cmd === "npx") {
      return "npx.cmd";
    }
  }
  return cmd;
}

/**
 * Spawns a child process and captures stdout, stderr, execution duration, and exit code.
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunOptions = {},
): Promise<RunResult> {
  const resolvedCmd = resolveBinary(command);
  const cwd = options.cwd ?? PROJECT_ROOT;
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdoutData = "";
    let stderrData = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    let proc: ChildProcess;
    try {
      proc = spawn(resolvedCmd, args, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
        timedOut: false,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      return;
    }

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill("SIGKILL");
          proc.stdout?.destroy();
          proc.stderr?.destroy();
          proc.stdin?.destroy();
        } catch {
          // ignore kill errors
        }
        resolve({
          exitCode: null,
          stdout: stdoutData,
          stderr: stderrData,
          durationMs: Date.now() - startTime,
          timedOut: true,
        });
      }, options.timeoutMs);
    }

    if (proc.stdout) {
      proc.stdout.on("data", (chunk: Buffer | string) => {
        stdoutData += chunk.toString();
      });
    }

    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer | string) => {
        stderrData += chunk.toString();
      });
    }

    if (proc.stdin) {
      proc.stdin.on("error", () => {}); // Prevent unhandled EPIPE
      if (options.input) {
        proc.stdin.write(options.input);
        proc.stdin.end();
      }
    }

    proc.on("error", (err: Error) => {
      if (timedOut) return;
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: stdoutData,
        stderr: stderrData || err.message,
        durationMs: Date.now() - startTime,
        timedOut,
        error: err,
      });
    });

    proc.on("close", async (code: number | null) => {
      if (timedOut) return;
      if (timer) clearTimeout(timer);
      if (args.includes("release-gate") || command.includes("test")) {
        await new Promise((r) => setTimeout(r, 200));
      }
      resolve({
        exitCode: code,
        stdout: stdoutData,
        stderr: stderrData,
        durationMs: Date.now() - startTime,
        timedOut,
      });
    });
  });
}

/**
 * Isolated temporary directory workspace fixture.
 */
export interface TempWorkspace {
  dir: string;
  writeFile(relPath: string, content: string | Buffer, mode?: number): Promise<string>;
  readFile(relPath: string): Promise<string>;
  exists(relPath: string): Promise<boolean>;
  getFileMode(relPath: string): Promise<number>;
  cleanup(): Promise<void>;
}

/**
 * Creates an isolated temporary directory for test filesystem isolation.
 */
export async function createTempWorkspace(prefix = "agy-e2e-"): Promise<TempWorkspace> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    dir: tmpDir,
    async writeFile(relPath: string, content: string | Buffer, mode?: number): Promise<string> {
      const targetPath = path.join(tmpDir, relPath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content);
      if (mode !== undefined) {
        await fs.chmod(targetPath, mode);
      }
      return targetPath;
    },
    async readFile(relPath: string): Promise<string> {
      return fs.readFile(path.join(tmpDir, relPath), "utf8");
    },
    async exists(relPath: string): Promise<boolean> {
      try {
        await fs.access(path.join(tmpDir, relPath));
        return true;
      } catch {
        return false;
      }
    },
    async getFileMode(relPath: string): Promise<number> {
      const stat = await fs.lstat(path.join(tmpDir, relPath));
      return stat.mode & 0o777;
    },
    async cleanup(): Promise<void> {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

/**
 * Returns the POSIX octal file mode (e.g. 0o600) for a given file path.
 */
export async function getFileMode(filePath: string): Promise<number> {
  const stat = await fs.lstat(filePath);
  return stat.mode & 0o777;
}

export type MockDockerScenario = "missing" | "daemon-down" | "daemon-up" | "timeout";

export interface MockDockerContext {
  dockerDir: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
}

/**
 * Creates mock docker scripts to simulate Docker environments:
 * - "missing": directory with no docker binary, sanitized PATH.
 * - "daemon-down": mock docker where `--version` exits 0, but `docker info` exits 1.
 * - "daemon-up": mock docker where all commands (`--version`, `info`, `build`, `run`) exit 0.
 * - "timeout": mock docker where `docker info` sleeps indefinitely.
 */
export async function createMockDocker(scenario: MockDockerScenario): Promise<MockDockerContext> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-mock-docker-"));
  const isWindows = process.platform === "win32";

  if (scenario === "missing") {
    // Return empty dir; sanitize PATH to exclude any real docker
    const sanitizedPath = (process.env["PATH"] ?? "")
      .split(path.delimiter)
      .filter((dir) => {
        try {
          return !fsSync.existsSync(path.join(dir, isWindows ? "docker.exe" : "docker"));
        } catch {
          return true;
        }
      })
      .join(path.delimiter);

    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env["Path"];
    delete env["path"];
    env["PATH"] = sanitizedPath;

    return {
      dockerDir: tmpDir,
      env,
      cleanup: async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
      },
    };
  }

  const scriptPath = path.join(tmpDir, isWindows ? "docker.cmd" : "docker");

  let scriptContent = "";
  if (scenario === "daemon-down") {
    if (isWindows) {
      scriptContent = `@echo off\r
if "%1"=="--version" (\r
  echo Docker version 27.0.0, build mock-e2e\r
  exit /b 0\r
)\r
if "%1"=="info" (\r
  echo [ERROR] Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running? >&2\r
  exit /b 1\r
)\r
exit /b 0\r
`;
    } else {
      scriptContent = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Docker version 27.0.0, build mock-e2e"
  exit 0
fi
if [ "$1" = "info" ]; then
  echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?" >&2
  exit 1
fi
exit 0
`;
    }
  } else if (scenario === "timeout") {
    if (isWindows) {
      scriptContent = `@echo off\r
if "%1"=="--version" (\r
  echo Docker version 27.0.0, build mock-e2e\r
  exit /b 0\r
)\r
if "%1"=="info" (\r
  powershell -Command "Start-Sleep -Seconds 10"\r
  exit /b 1\r
)\r
exit /b 0\r
`;
    } else {
      scriptContent = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Docker version 27.0.0, build mock-e2e"
  exit 0
fi
if [ "$1" = "info" ]; then
  exec sleep 10
fi
exit 0
`;
    }
  } else if (scenario === "daemon-up") {
    if (isWindows) {
      scriptContent = `@echo off\r
if "%1"=="--version" (\r
  echo Docker version 27.0.0, build mock-e2e\r
  exit /b 0\r
)\r
if "%1"=="info" (\r
  echo Server Version: 27.0.0\r
  exit /b 0\r
)\r
if "%1"=="build" (\r
  echo [mock-docker] Successfully tagged agy-boost-test-harness:local\r
  exit /b 0\r
)\r
if "%1"=="run" (\r
  echo [mock-docker] Running container command: %*\r
  exit /b 0\r
)\r
exit /b 0\r
`;
    } else {
      scriptContent = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Docker version 27.0.0, build mock-e2e"
  exit 0
fi
if [ "$1" = "info" ]; then
  echo "Server Version: 27.0.0"
  exit 0
fi
if [ "$1" = "build" ]; then
  echo "[mock-docker] Successfully built and tagged agy-boost-test-harness:local"
  exit 0
fi
if [ "$1" = "run" ]; then
  shift
  echo "[mock-docker] Container executed successfully: $@"
  exit 0
fi
exit 0
`;
    }
  }

  await fs.writeFile(scriptPath, scriptContent, { mode: 0o755 });

  const envPath = `${tmpDir}${path.delimiter}${process.env["PATH"] ?? ""}`;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["Path"];
  delete env["path"];
  env["PATH"] = envPath;

  return {
    dockerDir: tmpDir,
    env,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}

export interface ScorecardRow {
  step: number;
  name: string;
  status: "PASSED" | "FAILED" | "SKIPPED" | string;
  durationSec: number;
  durationRaw: string;
}

export interface Scorecard {
  rows: ScorecardRow[];
  totalDurationSec?: number | undefined;
  raw: string;
}

/**
 * Strips ANSI escape sequences (colors, cursor codes) from terminal output.
 */
export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping
  return str.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Parses duration strings supporting minutes (1m12.4s), milliseconds (450ms), and seconds (0.12s).
 */
export function parseDurationString(raw: string): number {
  const clean = raw.trim();
  const minMatch = clean.match(/^(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/);
  if (minMatch && (minMatch[1] !== undefined || minMatch[2] !== undefined)) {
    const minutes = minMatch[1] ? parseFloat(minMatch[1]) : 0;
    const seconds = minMatch[2] ? parseFloat(minMatch[2]) : 0;
    return minutes * 60 + seconds;
  }
  if (clean.endsWith("ms")) {
    return parseFloat(clean.slice(0, -2)) / 1000;
  }
  if (clean.endsWith("s")) {
    return parseFloat(clean.slice(0, -1));
  }
  return parseFloat(clean) || 0;
}

/**
 * Parses ASCII scorecard table printed by release-gate into structured rows.
 */
export function parseScorecardTable(stdout: string): Scorecard {
  const cleanStdout = stripAnsi(stdout);
  const rows: ScorecardRow[] = [];
  const lines = cleanStdout.split(/\r?\n/);

  // Match rows with ASCII borders (| or │) like:
  // │ 1 │ format:check │ PASSED │ 0.12s │
  // or | 1 | lint | PASSED | 450ms |
  const rowRegex =
    /^[│|]\s*(\d+)\s*[│|]\s*([^│|\n]+?)\s*[│|]\s*([^│|\n]+?)\s*[│|]\s*([^│|\n]+?)\s*[│|]/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(rowRegex);
    if (match) {
      const step = parseInt(match[1] ?? "0", 10);
      const name = (match[2] ?? "").trim();
      const status = (match[3] ?? "").trim();
      const durationRaw = (match[4] ?? "").trim();
      const durationSec = parseDurationString(durationRaw);

      rows.push({
        step,
        name,
        status,
        durationSec,
        durationRaw,
      });
    }
  }

  // Parse total duration if present: e.g. "Total Duration: 4.52s" or "Total duration: 1m12.4s"
  let totalDurationSec: number | undefined;
  const totalMatch = cleanStdout.match(
    /(?:Total|total)(?:\s+duration|\s+time)?[:\s]+((?:(?:\d+(?:\.\d+)?)m)?\s*(?:\d+(?:\.\d+)?)(?:s|ms)?)/i,
  );
  if (totalMatch) {
    totalDurationSec = parseDurationString(totalMatch[1] ?? "");
  }

  return {
    rows,
    totalDurationSec,
    raw: stdout,
  };
}

/**
 * Checks whether `release-gate` (Milestone 3) is implemented and ready for verification.
 * Follows progressive testability invariant: skips R1 tests while M3 is IN_PROGRESS.
 */
export async function isReleaseGateSupported(projectRoot: string = PROJECT_ROOT): Promise<boolean> {
  if (process.env["ENABLE_M3_TESTS"] === "true") {
    return true;
  }
  if (process.env["ENABLE_M3_TESTS"] === "false") {
    return false;
  }

  // Check PROJECT.md milestone status if available in teamwork state folder
  const scratchState =
    process.env["TEAMWORK_STATE_DIR"] ||
    "/Users/veronicalostimolo/.gemini/antigravity/scratch/teamwork/907ed9a6-5930-4fb2-b009-6c470ea41dc9/.agents/teamwork";
  const projectMdPath = path.join(scratchState, "PROJECT.md");
  try {
    const projectContent = await fs.readFile(projectMdPath, "utf8");
    const m3Match = projectContent.match(
      /\|\s*3\s*\|\s*M3:[^|]+\|[^|]+\|[^|]+\|\s*([^|\n]+?)\s*\|/,
    );
    if (m3Match) {
      const status = m3Match[1]?.trim().toUpperCase() ?? "";
      if (status !== "DONE") {
        return false;
      }
    }
  } catch {
    // If PROJECT.md is inaccessible, fall back to checking scripts/build.go
  }

  const buildGoPath = path.join(projectRoot, "scripts", "build.go");
  try {
    const content = await fs.readFile(buildGoPath, "utf8");
    return content.includes('"release-gate"');
  } catch {
    return false;
  }
}

/**
 * Ensures the agy-boost binary in dist/ is built and up to date relative to all .go sources in src/.
 */
export async function ensureAgyBoostBinary(): Promise<string> {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "agy-boost.exe" : "agy-boost";
  const distDir = path.join(PROJECT_ROOT, "dist");
  const binaryPath = path.join(distDir, binaryName);

  let needsRebuild = !fsSync.existsSync(binaryPath);

  if (!needsRebuild) {
    try {
      const binMtime = (await fs.stat(binaryPath)).mtimeMs;
      const checkDirNewer = async (dir: string): Promise<boolean> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (await checkDirNewer(fullPath)) return true;
          } else if (entry.isFile() && entry.name.endsWith(".go")) {
            const stat = await fs.stat(fullPath);
            if (stat.mtimeMs > binMtime) {
              return true;
            }
          }
        }
        return false;
      };

      const srcDir = path.join(PROJECT_ROOT, "src");
      if (await checkDirNewer(srcDir)) {
        needsRebuild = true;
      }
    } catch {
      needsRebuild = true;
    }
  }

  if (needsRebuild) {
    await fs.mkdir(distDir, { recursive: true });
    const buildRes = await runCommand("go", ["build", "-trimpath", "-o", binaryPath, "./src/cli"], {
      cwd: PROJECT_ROOT,
    });
    if (buildRes.exitCode !== 0) {
      throw new Error(`Failed to build agy-boost binary: ${buildRes.stderr}`);
    }
  }

  return binaryPath;
}

export interface SpawnedDaemon {
  proc: ChildProcess;
  port: number;
  userDataDir?: string | undefined;
  token?: string | undefined;
  kill: () => Promise<void>;
}

/**
 * Spawns the native daemon subprocess and awaits the "Listening natively" banner.
 */
export async function spawnDaemon(options: {
  userDataDir?: string | undefined;
  port?: number;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<SpawnedDaemon> {
  const binaryPath = await ensureAgyBoostBinary();

  const port = options.port ?? Math.floor(40000 + Math.random() * 10000);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
  };
  if (options.userDataDir !== undefined) {
    env["AGY_BOOST_USER_DATA"] = options.userDataDir;
  }

  const proc = spawn(binaryPath, ["daemon", "--port", String(port)], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const timeoutMs = options.timeoutMs ?? 5000;

  return new Promise<SpawnedDaemon>((resolve, reject) => {
    let stderrOut = "";
    let stdoutOut = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        reject(
          new Error(
            `Daemon failed to start within ${timeoutMs}ms. stdout: ${stdoutOut}, stderr: ${stderrOut}`,
          ),
        );
      }
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutOut += text;
      if (text.includes("Listening natively on") || stdoutOut.includes("Listening natively on")) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          setTimeout(async () => {
            let token: string | undefined;
            let effectiveUserDataDir = options.userDataDir;
            if (!effectiveUserDataDir) {
              if (process.platform === "linux" && env["XDG_CONFIG_HOME"]) {
                effectiveUserDataDir = path.join(env["XDG_CONFIG_HOME"], "AGYBoost");
              } else if (process.platform === "darwin" && env["HOME"]) {
                effectiveUserDataDir = path.join(
                  env["HOME"],
                  "Library",
                  "Application Support",
                  "AGYBoost",
                );
              } else if (process.platform === "win32" && env["APPDATA"]) {
                effectiveUserDataDir = path.join(env["APPDATA"], "AGYBoost");
              }
            }

            if (effectiveUserDataDir) {
              const tokenFile = path.join(effectiveUserDataDir, ".token");
              try {
                token = (await fs.readFile(tokenFile, "utf8")).trim();
              } catch {
                // ignore
              }
            }

            resolve({
              proc,
              port,
              userDataDir: options.userDataDir ?? effectiveUserDataDir ?? "",
              token,
              kill: async () => {
                return new Promise<void>((resKill) => {
                  proc.on("close", () => resKill());
                  proc.kill("SIGTERM");
                  setTimeout(() => {
                    try {
                      proc.kill("SIGKILL");
                    } catch {
                      // ignore
                    }
                    resKill();
                  }, 1000);
                });
              },
            });
          }, 50);
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrOut += chunk.toString();
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error(`Daemon exited early with code ${code}. Stderr: ${stderrOut}`));
      }
    });
  });
}
