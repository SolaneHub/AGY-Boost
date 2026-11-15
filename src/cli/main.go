package main

import (
	_ "embed"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/agy-boost/agy-boost/src/daemon"
	"github.com/agy-boost/agy-boost/src/host"
	"github.com/agy-boost/agy-boost/src/patcher"
)

//go:embed embedded/runtime.js
var embeddedRuntimeJS []byte

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "status":
		handleStatus()
	case "patch":
		handlePatch()
	case "unpatch":
		handleUnpatch()
	case "daemon":
		handleDaemon()
	case "mod":
		handleMod()
	case "version":
		fmt.Printf("AGY Boost v%s (native Go + Pure TS + Wasm engine)\n", patcher.AGYBoostVersion)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Printf(`AGY Boost - Native Modding Engine for Google Antigravity
Usage: agy-boost <command> [options]

Commands:
  status        Check Antigravity installation and AGY Boost patch state
  patch         Apply the AGY Boost native patch to Antigravity
  unpatch       Restore Antigravity to stock state byte-for-byte
  daemon        Run the native background daemon (<10MB RAM)
  mod list      List installed mods
  version       Print version information
`)
}

func handleStatus() {
	info, err := host.FindAntigravity("")
	if err != nil {
		fmt.Printf("Antigravity Status: NOT DETECTED (%v)\n", err)
		return
	}

	fmt.Printf("Antigravity Installation: %s\n", info.RootPath)
	fmt.Printf("Platform:                 %s\n", info.Platform)
	if info.IsPatched {
		fmt.Printf("Patch Status:             PATCHED (v%s)\n", patcher.AGYBoostVersion)
	} else {
		fmt.Println("Patch Status:             STOCK (Unpatched)")
	}

	userData, _ := host.UserDataDir()
	fmt.Printf("Mods Directory:           %s\n", filepath.Join(userData, "mods"))
}

func handlePatch() {
	patchCmd := flag.NewFlagSet("patch", flag.ExitOnError)
	safe := patchCmd.Bool("safe", false, "Do not terminate running host")
	customPath := patchCmd.String("path", "", "Custom path to Antigravity installation")
	_ = patchCmd.Parse(os.Args[2:])
	_ = safe

	info, err := host.FindAntigravity(*customPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error locating Antigravity: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Locating Antigravity at: %s...\n", info.RootPath)

	runtimeJS := embeddedRuntimeJS
	if len(runtimeJS) == 0 {
		// Fallback to checking local src/client/dist/agy-boost.js
		if data, err := os.ReadFile("src/client/dist/agy-boost.js"); err == nil {
			runtimeJS = data
		} else {
			fmt.Fprintf(os.Stderr, "Error: runtime.js not found. Run 'pnpm build' in runtime/ first.\n")
			os.Exit(1)
		}
	}

	fmt.Println("Applying AGY Boost native patch...")
	if err := patcher.Apply(info, runtimeJS); err != nil {
		fmt.Fprintf(os.Stderr, "Patch failed: %v\n", err)
		os.Exit(1)
	}

	// Ensure mods directory exists in user data
	userData, _ := host.UserDataDir()
	_ = os.MkdirAll(filepath.Join(userData, "mods"), 0755)

	fmt.Println("✓ AGY Boost installed successfully!")
	fmt.Printf("  Mods directory ready at: %s\n", filepath.Join(userData, "mods"))
}

func handleUnpatch() {
	unpatchCmd := flag.NewFlagSet("unpatch", flag.ExitOnError)
	customPath := unpatchCmd.String("path", "", "Custom path to Antigravity installation")
	_ = unpatchCmd.Parse(os.Args[2:])

	info, err := host.FindAntigravity(*customPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error locating Antigravity: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Restoring original Antigravity bundle at: %s...\n", info.RootPath)
	if err := patcher.Restore(info); err != nil {
		fmt.Fprintf(os.Stderr, "Restore failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✓ Antigravity restored to stock state.")
}

func handleDaemon() {
	daemonCmd := flag.NewFlagSet("daemon", flag.ExitOnError)
	port := daemonCmd.Int("port", 42042, "Port for native loopback server")
	_ = daemonCmd.Parse(os.Args[2:])

	srv, err := daemon.NewDaemonServer(*port)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize daemon: %v\n", err)
		os.Exit(1)
	}

	if err := srv.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Daemon error: %v\n", err)
		os.Exit(1)
	}
}

func handleMod() {
	if len(os.Args) < 3 || os.Args[2] != "list" {
		fmt.Println("Usage: agy-boost mod list")
		return
	}

	userData, _ := host.UserDataDir()
	modsDir := filepath.Join(userData, "mods")
	entries, err := os.ReadDir(modsDir)
	if err != nil || len(entries) == 0 {
		fmt.Printf("No mods installed yet in %s\n", modsDir)
		return
	}

	fmt.Printf("Installed Mods (%s):\n", modsDir)
	for _, entry := range entries {
		if entry.IsDir() {
			fmt.Printf("  • %s\n", entry.Name())
		}
	}
}
