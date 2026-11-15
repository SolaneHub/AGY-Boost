# Guide: Go Background Daemon Sidecar Mod

This guide demonstrates how to build a background automation and system-level mod for Google Antigravity using **Go (Golang)** as a standalone sidecar.

Go is ideal for:
- Low-latency local file system watching (`fsnotify`)
- Git worktree indexing and repository scanning
- System automation, process management, and local daemon services
- Retaining a tiny memory footprint (<10MB RAM) and zero cold-start delay

---

## 1. Mod Manifest (`mod.json`)

```json
{
  "id": "my-go-daemon",
  "name": "Go Background Daemon Sidecar",
  "version": "1.0.0",
  "description": "Ultra-lightweight Go native background service for OS automation.",
  "author": "Your Name",
  "main": "index.js",
  "daemon": "daemon"
}
```

---

## 2. Writing the Go Sidecar (`daemon.go`)

A simple Go binary that performs background work and respects system signals:

```go
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	fmt.Println("[AGY Boost Mod] Go daemon sidecar initialized (~4MB RAM).")

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case t := <-ticker.C:
			// Perform background maintenance, file watching, or indexing
			fmt.Printf("[AGY Boost Mod] Tick at %v\n", t.Format("15:04:05"))
		case sig := <-sigs:
			fmt.Printf("[AGY Boost Mod] Signal %v received. Exiting cleanly.\n", sig)
			return
		}
	}
}
```

Compile the Go sidecar:
```bash
go build -o daemon daemon.go
```

---

## 3. Controlling the Daemon from TypeScript (`index.js`)

In `index.js`, control and communicate with the daemon using `AGYBoost.daemon`:

```typescript
async function setupDaemonMod() {
  // Spawn the compiled Go binary through the AGY Boost engine
  const res = await AGYBoost.daemon.spawn("my-go-daemon", "./daemon");
  if (res.ok) {
    console.log(`Go sidecar daemon running with PID: ${res.pid}`);
  }

  // Ensure clean teardown when the mod is disabled
  if (typeof mod !== "undefined" && mod.onDispose) {
    mod.onDispose(async () => {
      await AGYBoost.daemon.kill("my-go-daemon");
    });
  }
}

setupDaemonMod();
```

---

## 4. Advantages of Go Sidecars

- **Ultra-low RAM usage**: Consistently runs between 4MB and 10MB of memory.
- **Single static binary**: No external Python or Node runtime needed on the user's machine.
- **Automatic Lifecycle Management**: AGY Boost automatically manages and terminates child processes on mod disable or host app exit.
