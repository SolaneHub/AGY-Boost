// Native Go Daemon Bridge for AGY Boost

export interface ModInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  main?: string;
  style?: string | string[];
  wasm?: string;
  daemon?: string;
  enabled: boolean;
  path: string;
}

export class DaemonBridge {
  private baseUrl: string;

  constructor(port = 42042) {
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  private getAuthHeaders(): Record<string, string> {
    let token: string | null | undefined = (globalThis as { __AGY_TOKEN__?: string }).__AGY_TOKEN__;
    if (!token && typeof document !== "undefined" && document.documentElement?.dataset?.agyToken) {
      token = document.documentElement.dataset.agyToken;
    }
    if (!token && typeof localStorage !== "undefined") {
      try {
        token = localStorage.getItem("__AGY_TOKEN__");
      } catch {}
    } else if (token && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem("__AGY_TOKEN__", token);
      } catch {}
    }
    const headers: Record<string, string> = {};
    if (token) {
      headers["X-AGY-Token"] = token;
    }
    return headers;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getMods(): Promise<ModInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/mods`, {
        headers: this.getAuthHeaders(),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async toggleMod(id: string, enabled: boolean): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/mods/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ id, enabled }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getModFile(id: string, file: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/mods/file?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`,
        {
          headers: this.getAuthHeaders(),
        }
      );
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  async openModsFolder(): Promise<{ ok: boolean; path?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/mods/open-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeaders(),
        },
      });
      if (!res.ok) return { ok: false };
      return await res.json();
    } catch {
      return { ok: false };
    }
  }

  async spawn(binaryPath: string, args: string[] = []): Promise<{ ok: boolean; pid?: number }> {
    return this.spawnDaemon("global", binaryPath, args);
  }

  async kill(modId = "global"): Promise<boolean> {
    return this.killDaemon(modId);
  }

  async spawnDaemon(
    modId: string,
    binaryPath: string,
    args: string[] = []
  ): Promise<{ ok: boolean; pid?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/daemon/spawn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ modId, binaryPath, args }),
      });
      return await res.json();
    } catch {
      return { ok: false };
    }
  }

  async killDaemon(modId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/daemon/kill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({ modId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
