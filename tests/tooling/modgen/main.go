package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/agy-boost/agy-boost/src/daemon"
)

// Minimal valid WebAssembly binary (10 bytes: magic \0asm + version 1)
// \0asm (0x00, 0x61, 0x73, 0x6d) + version 0x01, 0x00, 0x00, 0x00
var minimalWasmBinary = []byte{0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00}

// Willow Design System CSS template for synthetic mods
const willowCSSTemplate = `/* Willow Design System Synthetic Mod Style */
:root {
  --primary: #3b82f6;
  --secondary: #64748b;
  --background: #ffffff;
  --foreground: #0f172a;
  --card: #f8fafc;
  --card-foreground: #0f172a;
  --border: #e2e8f0;
}

.dark {
  --background: #0b0f19;
  --foreground: #f8fafc;
  --card: #111827;
  --card-foreground: #f8fafc;
  --border: #1f2937;
}

.mod-synthetic-%04d {
  background-color: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
}
`

// Synthetic JavaScript mod entry point
const syntheticJSTemplate = `// Synthetic Mod Entry Script
(function() {
  if (typeof AGYBoost !== "undefined" && AGYBoost.ui) {
    var el = AGYBoost.ui.el("div", {
      id: "synthetic-mod-%04d",
      class: "mod-synthetic-%04d text-xs font-medium"
    }, ["Synthetic Mod #%d Loaded"]);
    if (typeof mod !== "undefined" && mod.onDispose) {
      mod.onDispose(function() {
        if (el && el.remove) el.remove();
      });
    }
  }
})();
`

type GenOptions struct {
	Count    int
	Dest     string
	WithWasm bool
	WithCSS  bool
	Clean    bool
}

// GenerateMods generates synthetic mods concurrently based on GenOptions.
func GenerateMods(opts GenOptions) error {
	destDir := opts.Dest
	if destDir == "" {
		destDir = filepath.Join(os.TempDir(), "agy-synthetic-mods")
	}

	// Handle -clean flag
	if opts.Clean {
		if err := os.RemoveAll(destDir); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to clean destination %s: %w", destDir, err)
		}
	}

	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("failed to create destination %s: %w", destDir, err)
	}

	if opts.Count <= 0 {
		return nil
	}

	// Determine worker concurrency
	workers := runtime.NumCPU() * 2
	if workers < 4 {
		workers = 4
	}
	if workers > opts.Count {
		workers = opts.Count
	}

	jobs := make(chan int, opts.Count)
	errChan := make(chan error, workers)
	var wg sync.WaitGroup

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				if err := generateSingleMod(destDir, idx, opts); err != nil {
					select {
					case errChan <- err:
					default:
					}
					return
				}
			}
		}()
	}

	for i := 1; i <= opts.Count; i++ {
		jobs <- i
	}
	close(jobs)

	wg.Wait()
	close(errChan)

	if err, ok := <-errChan; ok && err != nil {
		return err
	}

	return nil
}

func generateSingleMod(baseDir string, index int, opts GenOptions) error {
	modID := fmt.Sprintf("synth-mod-%04d", index)
	modDir := filepath.Join(baseDir, modID)

	if err := os.MkdirAll(modDir, 0755); err != nil {
		return fmt.Errorf("failed to create mod dir %s: %w", modDir, err)
	}

	manifest := daemon.ModManifest{
		ID:          modID,
		Name:        fmt.Sprintf("Synthetic Mod %04d", index),
		Version:     "1.0.0",
		Description: fmt.Sprintf("High-throughput benchmark synthetic mod #%04d for stress testing daemon and UI", index),
		Author:      "AGY Boost Benchmarking Suite",
		Main:        "index.js",
		Enabled:     true,
	}

	// Write index.js
	jsContent := fmt.Sprintf(syntheticJSTemplate, index, index, index)
	if err := os.WriteFile(filepath.Join(modDir, "index.js"), []byte(jsContent), 0644); err != nil {
		return fmt.Errorf("failed to write index.js in %s: %w", modDir, err)
	}

	// Optional CSS
	if opts.WithCSS {
		manifest.Style = "style.css"
		cssContent := fmt.Sprintf(willowCSSTemplate, index)
		if err := os.WriteFile(filepath.Join(modDir, "style.css"), []byte(cssContent), 0644); err != nil {
			return fmt.Errorf("failed to write style.css in %s: %w", modDir, err)
		}
	}

	// Optional Wasm
	if opts.WithWasm {
		manifest.Wasm = "module.wasm"
		if err := os.WriteFile(filepath.Join(modDir, "module.wasm"), minimalWasmBinary, 0644); err != nil {
			return fmt.Errorf("failed to write module.wasm in %s: %w", modDir, err)
		}
	}

	// Write mod.json
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal mod.json in %s: %w", modDir, err)
	}
	if err := os.WriteFile(filepath.Join(modDir, "mod.json"), data, 0644); err != nil {
		return fmt.Errorf("failed to write mod.json in %s: %w", modDir, err)
	}

	return nil
}

func main() {
	count := flag.Int("count", 50, "Number of synthetic mods to generate")
	dest := flag.String("dest", "", "Destination directory (default: system temp / agy-synthetic-mods)")
	withWasm := flag.Bool("with-wasm", true, "Include a valid minimal WebAssembly binary")
	withCSS := flag.Bool("with-css", true, "Include valid Willow Design System CSS tokens")
	clean := flag.Bool("clean", false, "Remove previously generated mods in destination")

	flag.Parse()

	targetDest := *dest
	if targetDest == "" {
		targetDest = filepath.Join(os.TempDir(), "agy-synthetic-mods")
	}

	opts := GenOptions{
		Count:    *count,
		Dest:     targetDest,
		WithWasm: *withWasm,
		WithCSS:  *withCSS,
		Clean:    *clean,
	}

	startTime := time.Now()
	if err := GenerateMods(opts); err != nil {
		fmt.Fprintf(os.Stderr, "Error generating mods: %v\n", err)
		os.Exit(1)
	}
	elapsed := time.Since(startTime)

	fmt.Printf("Generated %d synthetic mods in %s (took %v)\n", opts.Count, targetDest, elapsed)
}
