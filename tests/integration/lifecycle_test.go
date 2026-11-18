package integration

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/agy-boost/agy-boost/src/daemon"
	"github.com/agy-boost/agy-boost/src/host"
	"github.com/agy-boost/agy-boost/src/patcher"
	"github.com/agy-boost/agy-boost/tests/harness"
)

// getFreePort returns an available TCP port on localhost.
func getFreePort(t *testing.T) int {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to obtain free port: %v", err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

// isolateUserDataEnv overrides user data and home environment variables to point to tempDir.
func isolateUserDataEnv(t *testing.T, tempDir string) {
	t.Setenv("AGY_BOOST_USER_DATA", tempDir)
	if runtime.GOOS == "windows" {
		t.Setenv("APPDATA", filepath.Join(tempDir, "AppData", "Roaming"))
		t.Setenv("LOCALAPPDATA", filepath.Join(tempDir, "AppData", "Local"))
		t.Setenv("USERPROFILE", tempDir)
	} else {
		t.Setenv("HOME", tempDir)
	}
}

func TestAGYBoostLifecycleE2E(t *testing.T) {
	// 0. Initialize mock host in temp directory
	mock := harness.NewMockHost(t)

	// Test 1: Rilevamento host tramite host.FindAntigravity(customPath)
	info, err := host.FindAntigravity(mock.RootDir)
	if err != nil {
		t.Fatalf("[Test 1] host.FindAntigravity failed to detect mock host: %v", err)
	}

	if info.RootPath != mock.RootDir {
		t.Errorf("[Test 1] expected RootPath %s, got %s", mock.RootDir, info.RootPath)
	}
	if info.ResourcesPath != mock.ResourcesDir {
		t.Errorf("[Test 1] expected ResourcesPath %s, got %s", mock.ResourcesDir, info.ResourcesPath)
	}
	if info.IsPatched {
		t.Errorf("[Test 1] expected IsPatched=false on pristine installation, got true")
	}

	// Verify original app.asar is not a bootstrap asar
	isBootstrap, err := host.IsBootstrapAsar(info.CurrentAsar)
	if err != nil {
		t.Fatalf("[Test 1] failed to inspect app.asar: %v", err)
	}
	if isBootstrap {
		t.Errorf("[Test 1] initial app.asar should not be a bootstrap asar")
	}

	// Test 2: Applicazione patch con patcher.Apply()
	mockRuntimeJS := []byte("window.__AGY_BOOST_LOADED__ = true;")
	info.Version = "2.32.1"

	if err := patcher.Apply(info, mockRuntimeJS); err != nil {
		t.Fatalf("[Test 2] patcher.Apply failed: %v", err)
	}

	// Verify app.asar is now a bootstrap packer
	isBootstrapPatched, err := host.IsBootstrapAsar(info.CurrentAsar)
	if err != nil {
		t.Fatalf("[Test 2] failed to inspect patched app.asar: %v", err)
	}
	if !isBootstrapPatched {
		t.Errorf("[Test 2] app.asar was expected to be a bootstrap asar after patcher.Apply()")
	}

	// Verify _app.asar contains the original file
	backupSHA, err := harness.FileSHA256(info.OriginalAsar)
	if err != nil {
		t.Fatalf("[Test 2] failed to calculate sha256 of _app.asar backup: %v", err)
	}
	if backupSHA != mock.OriginalSHA256 {
		t.Errorf("[Test 2] _app.asar checksum mismatch: got %s, want %s", backupSHA, mock.OriginalSHA256)
	}

	// Verify .agy-boost.json marker was created and contains the host version
	markerData, err := os.ReadFile(info.MarkerPath)
	if err != nil {
		t.Fatalf("[Test 2] failed to read marker file at %s: %v", info.MarkerPath, err)
	}
	var marker host.MarkerData
	if err := json.Unmarshal(markerData, &marker); err != nil {
		t.Fatalf("[Test 2] failed to parse marker json: %v", err)
	}
	if marker.HostVersion != info.Version {
		t.Errorf("[Test 2] marker HostVersion mismatch: got %s, want %s", marker.HostVersion, info.Version)
	}
	if marker.AGYBoostVersion != patcher.AGYBoostVersion {
		t.Errorf("[Test 2] marker AGYBoostVersion mismatch: got %s, want %s", marker.AGYBoostVersion, patcher.AGYBoostVersion)
	}
	if marker.EntryPoint != "dist/main.js" {
		t.Errorf("[Test 2] marker EntryPoint mismatch: got %s, want dist/main.js", marker.EntryPoint)
	}

	// Verify host status reflects patched state
	updatedInfo, err := host.FindAntigravity(mock.RootDir)
	if err != nil {
		t.Fatalf("[Test 2] FindAntigravity re-inspection failed: %v", err)
	}
	if !updatedInfo.IsPatched {
		t.Errorf("[Test 2] expected FindAntigravity to report IsPatched=true after patching")
	}

	// Test 3: Avvio del daemon di test su porta loopback libera e query via HTTP a /health e /mods
	tempUserData := t.TempDir()
	isolateUserDataEnv(t, tempUserData)

	freePort := getFreePort(t)

	// Setup a sample mod inside isolated user data directory to test /mods response
	userDataDir, err := host.UserDataDir()
	if err != nil {
		t.Fatalf("[Test 3] failed to get user data dir: %v", err)
	}
	modsDir := filepath.Join(userDataDir, "mods")
	testModDir := filepath.Join(modsDir, "test-mod")
	if err := os.MkdirAll(testModDir, 0755); err != nil {
		t.Fatalf("[Test 3] failed to create test mod dir: %v", err)
	}
	sampleModManifest := daemon.ModManifest{
		ID:          "test-mod",
		Name:        "Test Mod",
		Version:     "1.0.0",
		Description: "A test mod for E2E lifecycle",
	}
	manifestBytes, _ := json.Marshal(sampleModManifest)
	if err := os.WriteFile(filepath.Join(testModDir, "mod.json"), manifestBytes, 0644); err != nil {
		t.Fatalf("[Test 3] failed to write test mod.json: %v", err)
	}

	server, err := daemon.NewDaemonServer(freePort)
	if err != nil {
		t.Fatalf("[Test 3] failed to instantiate DaemonServer: %v", err)
	}

	// Run daemon server in background goroutine
	httpServer := &http.Server{
		Addr:    fmt.Sprintf("127.0.0.1:%d", freePort),
		Handler: server.Routes(),
	}

	serverErrCh := make(chan error, 1)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErrCh <- err
		}
	}()
	defer func() {
		_ = httpServer.Close()
	}()

	// Wait for server to accept connections
	baseURL := fmt.Sprintf("http://127.0.0.1:%d", freePort)
	ready := false
	for i := 0; i < 20; i++ {
		resp, err := http.Get(baseURL + "/health")
		if err == nil {
			_ = resp.Body.Close()
			ready = true
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if !ready {
		t.Fatalf("[Test 3] daemon server failed to start on %s", baseURL)
	}

	// 3a. Query /health
	healthResp, err := http.Get(baseURL + "/health")
	if err != nil {
		t.Fatalf("[Test 3] GET /health failed: %v", err)
	}
	defer healthResp.Body.Close()

	if healthResp.StatusCode != http.StatusOK {
		t.Errorf("[Test 3] GET /health status mismatch: got %d, want 200", healthResp.StatusCode)
	}
	var healthBody map[string]any
	if err := json.NewDecoder(healthResp.Body).Decode(&healthBody); err != nil {
		t.Fatalf("[Test 3] failed to decode /health json: %v", err)
	}
	if healthBody["status"] != "ok" {
		t.Errorf("[Test 3] /health status field mismatch: got %v, want 'ok'", healthBody["status"])
	}

	// 3b. Query /mods (Requires X-AGY-Token header)
	reqMods, err := http.NewRequest("GET", baseURL+"/mods", nil)
	if err != nil {
		t.Fatalf("[Test 3] failed to construct /mods request: %v", err)
	}
	reqMods.Header.Set("X-AGY-Token", server.Token)

	modsResp, err := http.DefaultClient.Do(reqMods)
	if err != nil {
		t.Fatalf("[Test 3] GET /mods failed: %v", err)
	}
	defer modsResp.Body.Close()

	if modsResp.StatusCode != http.StatusOK {
		t.Errorf("[Test 3] GET /mods status mismatch: got %d, want 200", modsResp.StatusCode)
	}

	var mods []daemon.ModManifest
	if err := json.NewDecoder(modsResp.Body).Decode(&mods); err != nil {
		t.Fatalf("[Test 3] failed to decode /mods json: %v", err)
	}
	if len(mods) != 1 || mods[0].ID != "test-mod" {
		t.Errorf("[Test 3] expected 1 mod with ID 'test-mod', got %v", mods)
	}

	// Test 4: Ripristino stock con patcher.Restore()
	if err := patcher.Restore(info); err != nil {
		t.Fatalf("[Test 4] patcher.Restore failed: %v", err)
	}

	// Verify app.asar is restored identical to original (checksum SHA-256 identico)
	restoredSHA, err := harness.FileSHA256(info.CurrentAsar)
	if err != nil {
		t.Fatalf("[Test 4] failed to calculate sha256 of restored app.asar: %v", err)
	}
	if restoredSHA != mock.OriginalSHA256 {
		t.Errorf("[Test 4] restored app.asar checksum mismatch: got %s, want original %s", restoredSHA, mock.OriginalSHA256)
	}

	// Verify _app.asar and .agy-boost.json have been removed
	if _, err := os.Stat(info.OriginalAsar); !os.IsNotExist(err) {
		t.Errorf("[Test 4] expected _app.asar to be deleted on restore, but it still exists")
	}
	if _, err := os.Stat(info.MarkerPath); !os.IsNotExist(err) {
		t.Errorf("[Test 4] expected .agy-boost.json to be deleted on restore, but it still exists")
	}
	if _, err := os.Stat(info.RuntimeDir); !os.IsNotExist(err) {
		t.Errorf("[Test 4] expected .agy-boost runtime dir to be deleted on restore, but it still exists")
	}

	// Verify host status reflects stock unpatched state again
	finalInfo, err := host.FindAntigravity(mock.RootDir)
	if err != nil {
		t.Fatalf("[Test 4] FindAntigravity re-inspection failed after restore: %v", err)
	}
	if finalInfo.IsPatched {
		t.Errorf("[Test 4] expected IsPatched=false after restore, got true")
	}
}

// TestMultiVersionHostScenarios tests end-to-end patch, execution/inspection, and restore
// across heterogeneous Google Antigravity release scenarios:
// - Scenario A: Standard Antigravity (dist/main.js)
// - Scenario B: Next-Gen Antigravity (bundle/entry.cjs with custom package.json)
// - Scenario C: Broken/unsupported host structure without resources directory
func TestMultiVersionHostScenarios(t *testing.T) {
	mockRuntimeJS := []byte("window.__AGY_BOOST_LOADED__ = true;")

	// --- SCENARIO A: Standard Antigravity (dist/main.js) ---
	t.Run("ScenarioA_StandardAntigravity", func(t *testing.T) {
		mockA := harness.NewMockHostWithConfig(t, harness.MockHostConfig{
			Version:   "2.32.1",
			MainEntry: "dist/main.js",
		})

		infoA, err := host.FindAntigravity(mockA.RootDir)
		if err != nil {
			t.Fatalf("FindAntigravity failed for Scenario A: %v", err)
		}
		infoA.Version = "2.32.1"

		if err := patcher.Apply(infoA, mockRuntimeJS); err != nil {
			t.Fatalf("patcher.Apply failed on Scenario A: %v", err)
		}

		// Verify marker records the actual delegated entry point
		markerDataA, err := os.ReadFile(infoA.MarkerPath)
		if err != nil {
			t.Fatalf("failed to read marker in Scenario A: %v", err)
		}
		var markerA host.MarkerData
		if err := json.Unmarshal(markerDataA, &markerA); err != nil {
			t.Fatalf("failed to parse marker JSON in Scenario A: %v", err)
		}
		if markerA.EntryPoint != "dist/main.js" {
			t.Errorf("Scenario A entry point mismatch: got %q, want %q", markerA.EntryPoint, "dist/main.js")
		}

		// Verify bootstrap code embeds mainEntry
		bootstrapCode, err := patcher.ReadAsarFile(infoA.CurrentAsar, "bootstrap.js")
		if err != nil {
			t.Fatalf("failed to read bootstrap.js from patched asar: %v", err)
		}
		if !containsSubslice(bootstrapCode, []byte(`"dist/main.js"`)) {
			t.Errorf("bootstrap.js does not contain expected mainEntry dist/main.js")
		}

		// Verify unpatch restores byte-for-byte
		if err := patcher.Restore(infoA); err != nil {
			t.Fatalf("patcher.Restore failed on Scenario A: %v", err)
		}
		restoredSHA, err := harness.FileSHA256(infoA.CurrentAsar)
		if err != nil {
			t.Fatalf("failed to hash restored app.asar in Scenario A: %v", err)
		}
		if restoredSHA != mockA.OriginalSHA256 {
			t.Errorf("Scenario A byte-for-byte restore mismatch: got %s, want %s", restoredSHA, mockA.OriginalSHA256)
		}
	})

	// --- SCENARIO B: Next-Gen Antigravity (bundle/entry.cjs with custom package.json) ---
	t.Run("ScenarioB_NextGenAntigravity", func(t *testing.T) {
		mockB := harness.NewMockHostWithConfig(t, harness.MockHostConfig{
			Version:     "3.0.0-nextgen",
			MainEntry:   "bundle/entry.cjs",
			PackageJSON: `{"name":"antigravity-next","version":"3.0.0-nextgen","main":"bundle/entry.cjs","productName":"Antigravity Next"}`,
		})

		infoB, err := host.FindAntigravity(mockB.RootDir)
		if err != nil {
			t.Fatalf("FindAntigravity failed for Scenario B: %v", err)
		}
		infoB.Version = "3.0.0-nextgen"

		if err := patcher.Apply(infoB, mockRuntimeJS); err != nil {
			t.Fatalf("patcher.Apply failed on Scenario B: %v", err)
		}

		// Verify marker dynamically detected and recorded bundle/entry.cjs
		markerDataB, err := os.ReadFile(infoB.MarkerPath)
		if err != nil {
			t.Fatalf("failed to read marker in Scenario B: %v", err)
		}
		var markerB host.MarkerData
		if err := json.Unmarshal(markerDataB, &markerB); err != nil {
			t.Fatalf("failed to parse marker JSON in Scenario B: %v", err)
		}
		if markerB.EntryPoint != "bundle/entry.cjs" {
			t.Errorf("Scenario B entry point mismatch: got %q, want %q", markerB.EntryPoint, "bundle/entry.cjs")
		}

		// Verify bootstrap code embeds bundle/entry.cjs as fallback default
		bootstrapCode, err := patcher.ReadAsarFile(infoB.CurrentAsar, "bootstrap.js")
		if err != nil {
			t.Fatalf("failed to read bootstrap.js from patched asar in Scenario B: %v", err)
		}
		if !containsSubslice(bootstrapCode, []byte(`"bundle/entry.cjs"`)) {
			t.Errorf("bootstrap.js does not contain detected mainEntry bundle/entry.cjs")
		}

		// Verify unpatch restores byte-for-byte
		if err := patcher.Restore(infoB); err != nil {
			t.Fatalf("patcher.Restore failed on Scenario B: %v", err)
		}
		restoredSHA, err := harness.FileSHA256(infoB.CurrentAsar)
		if err != nil {
			t.Fatalf("failed to hash restored app.asar in Scenario B: %v", err)
		}
		if restoredSHA != mockB.OriginalSHA256 {
			t.Errorf("Scenario B byte-for-byte restore mismatch: got %s, want %s", restoredSHA, mockB.OriginalSHA256)
		}
	})

	// --- SCENARIO C: Structure lacking standard resources directory ---
	t.Run("ScenarioC_MissingResourcesFolder", func(t *testing.T) {
		mockC := harness.NewMockHostWithConfig(t, harness.MockHostConfig{
			OmitResourcesFolder: true,
		})

		_, err := host.FindAntigravity(mockC.RootDir)
		if err == nil {
			t.Errorf("expected FindAntigravity to fail on host without resources folder, got nil")
		}

		// Also verify patcher.Apply directly fails safely when given invalid host info
		invalidInfo := &host.HostInfo{
			Platform:      runtime.GOOS,
			RootPath:      mockC.RootDir,
			ResourcesPath: mockC.ResourcesDir, // directory doesn't exist
			CurrentAsar:   mockC.AppAsarPath,
			OriginalAsar:  filepath.Join(mockC.ResourcesDir, "_app.asar"),
			MarkerPath:    filepath.Join(mockC.ResourcesDir, ".agy-boost.json"),
		}
		if err := patcher.Apply(invalidInfo, mockRuntimeJS); err == nil {
			t.Errorf("expected patcher.Apply to fail gracefully when resources/app.asar does not exist, got nil")
		}
	})
}

func containsSubslice(data, sub []byte) bool {
	if len(sub) == 0 {
		return true
	}
	if len(data) < len(sub) {
		return false
	}
	for i := 0; i <= len(data)-len(sub); i++ {
		match := true
		for j := 0; j < len(sub); j++ {
			if data[i+j] != sub[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
