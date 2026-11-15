package daemon

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestDaemonHandlers(t *testing.T) {
	tempDir := t.TempDir()
	modsDir := filepath.Join(tempDir, "mods")
	if err := os.MkdirAll(modsDir, 0755); err != nil {
		t.Fatalf("failed to create temp mods dir: %v", err)
	}

	// Create a dummy mod
	dummyModDir := filepath.Join(modsDir, "sample-mod")
	_ = os.MkdirAll(dummyModDir, 0755)
	manifest := ModManifest{
		ID:          "sample-mod",
		Name:        "Sample Mod",
		Version:     "1.0.0",
		Description: "A sample mod",
	}
	manifestData, _ := json.Marshal(manifest)
	_ = os.WriteFile(filepath.Join(dummyModDir, "mod.json"), manifestData, 0644)

	testToken := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	server := &DaemonServer{
		Port:     42042,
		Token:    testToken,
		modsDir:  modsDir,
		procs:    make(map[string]*exec.Cmd),
		disabled: make(map[string]bool),
	}

	// 1. Test /health
	reqHealth := httptest.NewRequest("GET", "/health", nil)
	wHealth := httptest.NewRecorder()
	server.handleHealth(wHealth, reqHealth)

	if wHealth.Code != http.StatusOK {
		t.Errorf("expected 200 OK for /health, got %d", wHealth.Code)
	}

	// 2. Test /mods
	reqMods := httptest.NewRequest("GET", "/mods", nil)
	wMods := httptest.NewRecorder()
	server.handleMods(wMods, reqMods)

	if wMods.Code != http.StatusOK {
		t.Errorf("expected 200 OK for /mods, got %d", wMods.Code)
	}

	var mods []ModManifest
	if err := json.Unmarshal(wMods.Body.Bytes(), &mods); err != nil {
		t.Fatalf("failed to parse mods response: %v", err)
	}

	if len(mods) != 1 || mods[0].ID != "sample-mod" {
		t.Errorf("expected 1 mod with id 'sample-mod', got %v", mods)
	}

	// 3. Test /mods/file
	sampleCss := ":root { --primary: red; }"
	_ = os.WriteFile(filepath.Join(dummyModDir, "theme.css"), []byte(sampleCss), 0644)

	reqFile := httptest.NewRequest("GET", "/mods/file?id=sample-mod&file=theme.css", nil)
	wFile := httptest.NewRecorder()
	server.handleModFile(wFile, reqFile)

	if wFile.Code != http.StatusOK {
		t.Errorf("expected 200 OK for /mods/file, got %d", wFile.Code)
	}
	if wFile.Header().Get("Content-Type") != "text/css; charset=utf-8" {
		t.Errorf("expected text/css content type, got %s", wFile.Header().Get("Content-Type"))
	}
	if wFile.Body.String() != sampleCss {
		t.Errorf("expected %q, got %q", sampleCss, wFile.Body.String())
	}

	// Test path traversal rejection on file
	reqBadFile := httptest.NewRequest("GET", "/mods/file?id=sample-mod&file=../../etc/passwd", nil)
	wBadFile := httptest.NewRecorder()
	server.handleModFile(wBadFile, reqBadFile)
	if wBadFile.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for path traversal, got %d", wBadFile.Code)
	}

	// Test path traversal rejection on id
	reqBadID := httptest.NewRequest("GET", "/mods/file?id=../../etc&file=passwd", nil)
	wBadID := httptest.NewRecorder()
	server.handleModFile(wBadID, reqBadID)
	if wBadID.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for mod id traversal, got %d", wBadID.Code)
	}

	// 4. Test /mods/toggle
	toggleBody, _ := json.Marshal(map[string]any{"id": "sample-mod", "enabled": false})
	reqToggle := httptest.NewRequest("POST", "/mods/toggle", bytes.NewReader(toggleBody))
	wToggle := httptest.NewRecorder()
	server.handleModToggle(wToggle, reqToggle)

	if wToggle.Code != http.StatusOK {
		t.Errorf("expected 200 OK for /mods/toggle, got %d", wToggle.Code)
	}

	// Verify mod is now disabled in /mods
	wModsAfter := httptest.NewRecorder()
	server.handleMods(wModsAfter, reqMods)
	var modsAfter []ModManifest
	_ = json.Unmarshal(wModsAfter.Body.Bytes(), &modsAfter)
	if len(modsAfter) != 1 || modsAfter[0].Enabled {
		t.Errorf("expected mod to be disabled, got %v", modsAfter[0].Enabled)
	}

	// 5. Test /daemon/spawn binary location enforcement
	// Attempt spawn of external binary (e.g. system binary or outside mod dir)
	spawnOutsideBody, _ := json.Marshal(map[string]any{
		"modId":      "sample-mod",
		"binaryPath": "/bin/sh",
		"args":       []string{"-c", "echo pwned"},
	})
	reqSpawnOutside := httptest.NewRequest("POST", "/daemon/spawn", bytes.NewReader(spawnOutsideBody))
	wSpawnOutside := httptest.NewRecorder()
	server.handleDaemonSpawn(wSpawnOutside, reqSpawnOutside)
	if wSpawnOutside.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for binary outside mod directory, got %d", wSpawnOutside.Code)
	}

	// Attempt spawn with path traversal in modId
	spawnBadModBody, _ := json.Marshal(map[string]any{
		"modId":      "../../bin",
		"binaryPath": "sh",
		"args":       []string{"-c", "echo pwned"},
	})
	reqSpawnBadMod := httptest.NewRequest("POST", "/daemon/spawn", bytes.NewReader(spawnBadModBody))
	wSpawnBadMod := httptest.NewRecorder()
	server.handleDaemonSpawn(wSpawnBadMod, reqSpawnBadMod)
	if wSpawnBadMod.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for path traversal modId in spawn, got %d", wSpawnBadMod.Code)
	}

	// Attempt spawn with relative path traversal in binaryPath
	spawnBadBinBody, _ := json.Marshal(map[string]any{
		"modId":      "sample-mod",
		"binaryPath": "../../../bin/sh",
		"args":       []string{"-c", "echo pwned"},
	})
	reqSpawnBadBin := httptest.NewRequest("POST", "/daemon/spawn", bytes.NewReader(spawnBadBinBody))
	wSpawnBadBin := httptest.NewRecorder()
	server.handleDaemonSpawn(wSpawnBadBin, reqSpawnBadBin)
	if wSpawnBadBin.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for relative path traversal binaryPath, got %d", wSpawnBadBin.Code)
	}
}

func TestDaemonAuthAndCORS(t *testing.T) {
	tempDir := t.TempDir()
	modsDir := filepath.Join(tempDir, "mods")
	_ = os.MkdirAll(modsDir, 0755)

	testToken := "secret-auth-token-1234567890abcdef"
	server := &DaemonServer{
		Port:     42042,
		Token:    testToken,
		modsDir:  modsDir,
		procs:    make(map[string]*exec.Cmd),
		disabled: make(map[string]bool),
	}

	handler := server.routes()

	// 1. Health check is accessible without token
	reqHealth := httptest.NewRequest("GET", "/health", nil)
	wHealth := httptest.NewRecorder()
	handler.ServeHTTP(wHealth, reqHealth)
	if wHealth.Code != http.StatusOK {
		t.Errorf("expected /health to return 200 without token, got %d", wHealth.Code)
	}

	// 2. /mods without token -> 401 Unauthorized
	reqModsNoToken := httptest.NewRequest("GET", "/mods", nil)
	wModsNoToken := httptest.NewRecorder()
	handler.ServeHTTP(wModsNoToken, reqModsNoToken)
	if wModsNoToken.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for missing token, got %d", wModsNoToken.Code)
	}

	// 3. /mods with invalid token -> 401 Unauthorized
	reqModsBadToken := httptest.NewRequest("GET", "/mods", nil)
	reqModsBadToken.Header.Set("X-AGY-Token", "wrong-token")
	wModsBadToken := httptest.NewRecorder()
	handler.ServeHTTP(wModsBadToken, reqModsBadToken)
	if wModsBadToken.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for invalid token, got %d", wModsBadToken.Code)
	}

	// 4. /mods with correct token -> 200 OK
	reqModsGoodToken := httptest.NewRequest("GET", "/mods", nil)
	reqModsGoodToken.Header.Set("X-AGY-Token", testToken)
	wModsGoodToken := httptest.NewRecorder()
	handler.ServeHTTP(wModsGoodToken, reqModsGoodToken)
	if wModsGoodToken.Code != http.StatusOK {
		t.Errorf("expected 200 OK for valid token, got %d", wModsGoodToken.Code)
	}

	// 5. CORS check: localhost and 127.0.0.1 allowed
	allowedOrigins := []string{
		"http://localhost:3000",
		"https://localhost:8080",
		"http://127.0.0.1:42042",
		"https://127.0.0.1:8443",
	}
	for _, origin := range allowedOrigins {
		req := httptest.NewRequest("OPTIONS", "/mods", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusNoContent {
			t.Errorf("expected 204 No Content for OPTIONS on %s, got %d", origin, w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Errorf("expected Access-Control-Allow-Origin: %s, got %s", origin, got)
		}
	}

	// CORS check: malicious/external origins rejected with 403
	disallowedOrigins := []string{
		"http://evil.com",
		"https://attacker.org:8080",
		"http://localhost.evil.com",
		"http://127.0.0.1.attacker.com",
	}
	for _, origin := range disallowedOrigins {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("expected 403 Forbidden for origin %s, got %d", origin, w.Code)
		}
	}
}

func TestNewDaemonServerToken(t *testing.T) {
	srv, err := NewDaemonServer(42042)
	if err != nil {
		t.Fatalf("failed to create daemon server: %v", err)
	}
	if len(srv.Token) != 64 {
		t.Errorf("expected 64 character hex token (32 bytes), got length %d", len(srv.Token))
	}
}
