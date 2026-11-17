package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/agy-boost/agy-boost/src/daemon"
)

func TestModgenAndDaemonIntegration(t *testing.T) {
	tempUserData := t.TempDir()
	modsDir := filepath.Join(tempUserData, "mods")

	// Step 1: Generate 20 synthetic mods into tempUserData/mods
	opts := GenOptions{
		Count:    20,
		Dest:     modsDir,
		WithWasm: true,
		WithCSS:  true,
		Clean:    true,
	}

	start := time.Now()
	if err := GenerateMods(opts); err != nil {
		t.Fatalf("GenerateMods failed: %v", err)
	}
	elapsed := time.Since(start)
	t.Logf("Generated 20 mods in %v", elapsed)

	// Verify on-disk files for a sample mod
	sampleModDir := filepath.Join(modsDir, "synth-mod-0001")
	for _, expectedFile := range []string{"mod.json", "index.js", "style.css", "module.wasm"} {
		path := filepath.Join(sampleModDir, expectedFile)
		if _, err := os.Stat(path); err != nil {
			t.Errorf("expected file %s does not exist: %v", expectedFile, err)
		}
	}

	// Verify Wasm magic header
	wasmData, err := os.ReadFile(filepath.Join(sampleModDir, "module.wasm"))
	if err != nil {
		t.Fatalf("failed to read wasm binary: %v", err)
	}
	if len(wasmData) < 8 || string(wasmData[:4]) != "\x00asm" {
		t.Fatalf("invalid wasm header: %v", wasmData)
	}

	// Step 2: Initialize DaemonServerWithDir with tempUserData
	server, err := daemon.NewDaemonServerWithDir(0, tempUserData)
	if err != nil {
		t.Fatalf("failed to create daemon server: %v", err)
	}

	// Step 3: Issue GET /mods and ensure all 20 mods are parsed correctly
	req := httptest.NewRequest("GET", "/mods", nil)
	req.Header.Set("X-AGY-Token", server.Token)
	w := httptest.NewRecorder()
	server.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /mods, got %d", w.Code)
	}

	var mods []daemon.ModManifest
	if err := json.Unmarshal(w.Body.Bytes(), &mods); err != nil {
		t.Fatalf("failed to parse /mods json response: %v", err)
	}

	if len(mods) != 20 {
		t.Fatalf("expected 20 mods parsed by daemon, got %d", len(mods))
	}

	// Verify manifest content of the parsed mods
	foundFirst := false
	for _, m := range mods {
		if m.ID == "synth-mod-0001" {
			foundFirst = true
			if m.Name != "Synthetic Mod 0001" {
				t.Errorf("expected name 'Synthetic Mod 0001', got %s", m.Name)
			}
			if m.Main != "index.js" {
				t.Errorf("expected main 'index.js', got %s", m.Main)
			}
			if m.Wasm != "module.wasm" {
				t.Errorf("expected wasm 'module.wasm', got %s", m.Wasm)
			}
			if m.Style != "style.css" {
				t.Errorf("expected style 'style.css', got %v", m.Style)
			}
		}
	}
	if !foundFirst {
		t.Errorf("mod synth-mod-0001 was not found in daemon /mods response")
	}

	// Step 4: Test -clean flag functionality
	optsClean := GenOptions{
		Count: 0,
		Dest:  modsDir,
		Clean: true,
	}
	if err := GenerateMods(optsClean); err != nil {
		t.Fatalf("clean failed: %v", err)
	}
	entries, err := os.ReadDir(modsDir)
	if err != nil {
		t.Fatalf("failed to read modsDir after clean: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after clean, got %d", len(entries))
	}
}

func TestBenchmark500ModsGenerationTime(t *testing.T) {
	tempUserData := t.TempDir()
	modsDir := filepath.Join(tempUserData, "mods")

	opts := GenOptions{
		Count:    500,
		Dest:     modsDir,
		WithWasm: true,
		WithCSS:  true,
		Clean:    true,
	}

	start := time.Now()
	if err := GenerateMods(opts); err != nil {
		t.Fatalf("GenerateMods 500 failed: %v", err)
	}
	elapsed := time.Since(start)
	t.Logf("Generated 500 mods in %v", elapsed)

	if elapsed > 2*time.Second {
		t.Errorf("expected 500 mods to generate in < 2s, took %v", elapsed)
	}

	// Quick count check
	entries, err := os.ReadDir(modsDir)
	if err != nil {
		t.Fatalf("failed to read modsDir: %v", err)
	}
	if len(entries) != 500 {
		t.Fatalf("expected 500 dirs, got %d", len(entries))
	}
}
