package daemon

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
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

	// Test http range request support via http.ServeContent
	reqRange := httptest.NewRequest("GET", "/mods/file?id=sample-mod&file=theme.css", nil)
	reqRange.Header.Set("Range", "bytes=0-5")
	wRange := httptest.NewRecorder()
	server.handleModFile(wRange, reqRange)
	if wRange.Code != http.StatusPartialContent {
		t.Errorf("expected 206 Partial Content for range request, got %d", wRange.Code)
	}
	if wRange.Body.String() != sampleCss[:6] {
		t.Errorf("expected %q for range 0-5, got %q", sampleCss[:6], wRange.Body.String())
	}

	// Test wasm and json content types
	sampleWasm := []byte("\x00asm\x01\x00\x00\x00")
	_ = os.WriteFile(filepath.Join(dummyModDir, "module.wasm"), sampleWasm, 0644)
	reqWasm := httptest.NewRequest("GET", "/mods/file?id=sample-mod&file=module.wasm", nil)
	wWasm := httptest.NewRecorder()
	server.handleModFile(wWasm, reqWasm)
	if wWasm.Code != http.StatusOK {
		t.Errorf("expected 200 OK for wasm file, got %d", wWasm.Code)
	}
	if wWasm.Header().Get("Content-Type") != "application/wasm" {
		t.Errorf("expected application/wasm, got %s", wWasm.Header().Get("Content-Type"))
	}

	// Test non-existent file
	reqMissing := httptest.NewRequest("GET", "/mods/file?id=sample-mod&file=nonexistent.js", nil)
	wMissing := httptest.NewRecorder()
	server.handleModFile(wMissing, reqMissing)
	if wMissing.Code != http.StatusNotFound {
		t.Errorf("expected 404 Not Found for missing file, got %d", wMissing.Code)
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

	// 5. Test /mods/open-folder
	// Method not allowed for GET
	reqOpenGet := httptest.NewRequest("GET", "/mods/open-folder", nil)
	wOpenGet := httptest.NewRecorder()
	server.handleModOpenFolder(wOpenGet, reqOpenGet)
	if wOpenGet.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 Method Not Allowed for GET /mods/open-folder, got %d", wOpenGet.Code)
	}

	// POST /mods/open-folder
	openFolderCalled := false
	server.openFolderFunc = func(dir string) error {
		openFolderCalled = true
		if dir != modsDir {
			t.Errorf("expected openFolderFunc dir %q, got %q", modsDir, dir)
		}
		return nil
	}

	reqOpenPost := httptest.NewRequest("POST", "/mods/open-folder", nil)
	wOpenPost := httptest.NewRecorder()
	server.handleModOpenFolder(wOpenPost, reqOpenPost)
	if wOpenPost.Code != http.StatusOK {
		t.Errorf("expected 200 OK for POST /mods/open-folder, got %d", wOpenPost.Code)
	}
	if !openFolderCalled {
		t.Errorf("expected openFolderFunc to be called")
	}

	var openResp map[string]any
	if err := json.Unmarshal(wOpenPost.Body.Bytes(), &openResp); err != nil {
		t.Fatalf("failed to decode open-folder response: %v", err)
	}
	if openResp["ok"] != true || openResp["path"] != modsDir {
		t.Errorf("unexpected open-folder response: %v", openResp)
	}

	// 6. Test /daemon/spawn binary location enforcement
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

	// 4b. /mods/open-folder without token -> 401 Unauthorized
	reqOpenNoToken := httptest.NewRequest("POST", "/mods/open-folder", nil)
	wOpenNoToken := httptest.NewRecorder()
	handler.ServeHTTP(wOpenNoToken, reqOpenNoToken)
	if wOpenNoToken.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for /mods/open-folder without token, got %d", wOpenNoToken.Code)
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
	tempDir := t.TempDir()
	t.Setenv("AGY_BOOST_USER_DATA", tempDir)

	srv, err := NewDaemonServer(42042)
	if err != nil {
		t.Fatalf("failed to create daemon server: %v", err)
	}
	if len(srv.Token) != 64 {
		t.Errorf("expected 64 character hex token (32 bytes), got length %d", len(srv.Token))
	}

	tokenPath := filepath.Join(tempDir, ".token")
	data, err := os.ReadFile(tokenPath)
	if err != nil {
		t.Fatalf("failed to read token from temp dir: %v", err)
	}
	if string(data) != srv.Token {
		t.Errorf("expected saved token to match server token: got %s, want %s", string(data), srv.Token)
	}

	// Calling NewDaemonServer again should reuse the existing token
	srv2, err := NewDaemonServer(42042)
	if err != nil {
		t.Fatalf("failed to create second daemon server: %v", err)
	}
	if srv2.Token != srv.Token {
		t.Errorf("expected second daemon server to reuse existing token: got %s, want %s", srv2.Token, srv.Token)
	}

	// Verify writeSecureToken directly
	testTokenDirect := "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	directTokenPath := filepath.Join(tempDir, ".token_direct")
	if err := writeSecureToken(directTokenPath, testTokenDirect); err != nil {
		t.Fatalf("writeSecureToken failed: %v", err)
	}
	directData, err := os.ReadFile(directTokenPath)
	if err != nil {
		t.Fatalf("failed to read direct token file: %v", err)
	}
	if string(directData) != testTokenDirect {
		t.Errorf("token direct mismatch: got %s, want %s", string(directData), testTokenDirect)
	}
}

func TestModsCacheAndInvalidation(t *testing.T) {
	tempDir := t.TempDir()
	modsDir := filepath.Join(tempDir, "mods")
	if err := os.MkdirAll(modsDir, 0755); err != nil {
		t.Fatalf("failed to create mods dir: %v", err)
	}

	testToken := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	server := &DaemonServer{
		Port:     42042,
		Token:    testToken,
		modsDir:  modsDir,
		procs:    make(map[string]*exec.Cmd),
		disabled: make(map[string]bool),
	}

	// Step 1: Initial call with empty mods dir
	reqMods := httptest.NewRequest("GET", "/mods", nil)
	wMods1 := httptest.NewRecorder()
	server.handleMods(wMods1, reqMods)
	if wMods1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wMods1.Code)
	}

	var mods1 []ModManifest
	_ = json.Unmarshal(wMods1.Body.Bytes(), &mods1)
	if len(mods1) != 0 {
		t.Fatalf("expected 0 mods initially, got %d", len(mods1))
	}

	// Verify cache is populated and valid
	server.modsCacheMu.RLock()
	if !server.cacheValid {
		t.Errorf("expected cache to be valid after handleMods")
	}
	server.modsCacheMu.RUnlock()

	// Step 2: Add a new mod to the filesystem and change directory mtime
	mod1Dir := filepath.Join(modsDir, "mod-alpha")
	_ = os.MkdirAll(mod1Dir, 0755)
	manifest1 := ModManifest{
		ID:          "mod-alpha",
		Name:        "Mod Alpha",
		Version:     "1.0.0",
		Description: "Alpha mod",
	}
	data1, _ := json.Marshal(manifest1)
	_ = os.WriteFile(filepath.Join(mod1Dir, "mod.json"), data1, 0644)

	// Ensure directory mtime is distinctly newer
	newTime := time.Now().Add(2 * time.Second)
	_ = os.Chtimes(modsDir, newTime, newTime)

	// Step 3: Call handleMods again - watcher / mtime check should detect changes and refresh cache
	wMods2 := httptest.NewRecorder()
	server.handleMods(wMods2, reqMods)
	if wMods2.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", wMods2.Code)
	}

	var mods2 []ModManifest
	_ = json.Unmarshal(wMods2.Body.Bytes(), &mods2)
	if len(mods2) != 1 || mods2[0].ID != "mod-alpha" {
		t.Fatalf("expected 1 mod with ID 'mod-alpha', got %v", mods2)
	}

	// Step 4: Toggle mod enabled state
	toggleBody, _ := json.Marshal(map[string]any{"id": "mod-alpha", "enabled": false})
	reqToggle := httptest.NewRequest("POST", "/mods/toggle", bytes.NewReader(toggleBody))
	wToggle := httptest.NewRecorder()
	server.handleModToggle(wToggle, reqToggle)
	if wToggle.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for toggle, got %d", wToggle.Code)
	}

	// Step 5: Immediately read /mods - cache should reflect disabled state
	wMods3 := httptest.NewRecorder()
	server.handleMods(wMods3, reqMods)
	var mods3 []ModManifest
	_ = json.Unmarshal(wMods3.Body.Bytes(), &mods3)
	if len(mods3) != 1 || mods3[0].Enabled {
		t.Fatalf("expected mod-alpha to be disabled in cached response, got enabled=%v", mods3[0].Enabled)
	}

	// Step 6: Test InvalidateCache explicitly
	server.InvalidateCache()
	server.modsCacheMu.RLock()
	if server.cacheValid {
		t.Errorf("expected cacheValid to be false after InvalidateCache()")
	}
	server.modsCacheMu.RUnlock()
}

func TestDiagnosticsEndpoint(t *testing.T) {
	tempDir := t.TempDir()
	server, err := NewDaemonServerWithDir(0, tempDir)
	if err != nil {
		t.Fatalf("failed to create daemon server: %v", err)
	}

	routes := server.routes()

	// 1. Unauthenticated request without token must return 401
	reqNoAuth := httptest.NewRequest("GET", "/diagnostics", nil)
	wNoAuth := httptest.NewRecorder()
	routes.ServeHTTP(wNoAuth, reqNoAuth)
	if wNoAuth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized without token, got %d", wNoAuth.Code)
	}

	// 2. Request with invalid token must return 401
	reqBadAuth := httptest.NewRequest("GET", "/diagnostics", nil)
	reqBadAuth.Header.Set("X-AGY-Token", "invalid-token-1234567890abcdef")
	wBadAuth := httptest.NewRecorder()
	routes.ServeHTTP(wBadAuth, reqBadAuth)
	if wBadAuth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized with bad token, got %d", wBadAuth.Code)
	}

	// 3. Authenticated request with valid token must return 200 OK
	reqAuth := httptest.NewRequest("GET", "/diagnostics", nil)
	reqAuth.Header.Set("X-AGY-Token", server.Token)
	wAuth := httptest.NewRecorder()
	routes.ServeHTTP(wAuth, reqAuth)
	if wAuth.Code != http.StatusOK {
		t.Fatalf("expected 200 OK with valid token, got %d", wAuth.Code)
	}

	var resp DiagnosticsResponse
	if err := json.Unmarshal(wAuth.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse diagnostics response: %v", err)
	}

	// Validate JSON fields
	if resp.Uptime == "" {
		t.Error("expected non-empty uptime string")
	}
	if resp.UptimeSeconds < 0 {
		t.Errorf("expected non-negative uptimeSeconds, got %f", resp.UptimeSeconds)
	}
	if resp.Goroutines <= 0 {
		t.Errorf("expected at least 1 goroutine, got %d", resp.Goroutines)
	}
	if resp.ActiveGoroutines != resp.Goroutines {
		t.Errorf("expected activeGoroutines (%d) == goroutines (%d)", resp.ActiveGoroutines, resp.Goroutines)
	}
	// Resident memory must be strictly < 10MB RAM (10240 KB)
	if resp.ResidentMemoryKB >= 10240 {
		t.Errorf("resident memory footprint %d KB exceeded 10MB limit (10240 KB)", resp.ResidentMemoryKB)
	}
	if resp.ResidentMemoryKB == 0 {
		t.Error("expected residentMemoryKB > 0")
	}
	if resp.EnabledMods != 0 {
		t.Errorf("expected 0 enabled mods initially, got %d", resp.EnabledMods)
	}
	if len(resp.Logs) == 0 {
		t.Error("expected at least 1 log entry from server initialization")
	}

	// 4. Test enabled mods count in diagnostics
	modsDir := filepath.Join(tempDir, "mods")
	modDir := filepath.Join(modsDir, "active-mod")
	_ = os.MkdirAll(modDir, 0755)
	manifest := ModManifest{
		ID:      "active-mod",
		Name:    "Active Mod",
		Version: "1.0.0",
		Enabled: true,
	}
	data, _ := json.Marshal(manifest)
	_ = os.WriteFile(filepath.Join(modDir, "mod.json"), data, 0644)
	server.InvalidateCache()

	wAuth2 := httptest.NewRecorder()
	routes.ServeHTTP(wAuth2, reqAuth)
	var resp2 DiagnosticsResponse
	_ = json.Unmarshal(wAuth2.Body.Bytes(), &resp2)
	if resp2.EnabledMods != 1 || resp2.EnabledModsCount != 1 {
		t.Errorf("expected 1 enabled mod, got enabledMods=%d, enabledModsCount=%d", resp2.EnabledMods, resp2.EnabledModsCount)
	}

	// 5. Test ring buffer capacity bounding via Log
	for i := 0; i < 60; i++ {
		server.Log("DEBUG", fmt.Sprintf("diag event %d", i))
	}
	wAuth3 := httptest.NewRecorder()
	routes.ServeHTTP(wAuth3, reqAuth)
	var resp3 DiagnosticsResponse
	_ = json.Unmarshal(wAuth3.Body.Bytes(), &resp3)
	if len(resp3.Logs) != 50 {
		t.Fatalf("expected exactly 50 logs in ring buffer, got %d", len(resp3.Logs))
	}
	lastLog := resp3.Logs[len(resp3.Logs)-1]
	if lastLog.Message != "diag event 59" {
		t.Errorf("expected last log to be 'diag event 59', got %q", lastLog.Message)
	}
}
