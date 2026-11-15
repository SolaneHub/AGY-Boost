package patcher

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/agy-boost/agy-boost/src/host"
)

func TestPatcherApplyAndRestore(t *testing.T) {
	tempDir := t.TempDir()
	resourcesDir := filepath.Join(tempDir, "Contents", "Resources")
	if err := os.MkdirAll(resourcesDir, 0755); err != nil {
		t.Fatalf("failed to create mock resources dir: %v", err)
	}

	appAsar := filepath.Join(resourcesDir, "app.asar")
	initialContent := []byte("original-antigravity-asar-content")
	if err := os.WriteFile(appAsar, initialContent, 0644); err != nil {
		t.Fatalf("failed to create initial app.asar: %v", err)
	}

	info := &host.HostInfo{
		Platform:      "darwin",
		RootPath:      tempDir,
		ResourcesPath: resourcesDir,
		Version:       "2.32.1",
	}

	runtimeJS := []byte("console.log('runtime active');")

	// 1. Test Apply
	if err := Apply(info, runtimeJS); err != nil {
		t.Fatalf("Apply failed: %v", err)
	}

	backupAsar := filepath.Join(resourcesDir, "_app.asar")
	if !fileExists(backupAsar) {
		t.Errorf("expected _app.asar backup to exist")
	}

	markerPath := filepath.Join(resourcesDir, ".agy-boost.json")
	if !fileExists(markerPath) {
		t.Errorf("expected .agy-boost.json marker to exist")
	}

	runtimeFile := filepath.Join(resourcesDir, ".agy-boost", "runtime.js")
	if !fileExists(runtimeFile) {
		t.Errorf("expected runtime.js to exist")
	}

	// 2. Test Restore
	if err := Restore(info); err != nil {
		t.Fatalf("Restore failed: %v", err)
	}

	if fileExists(backupAsar) {
		t.Errorf("expected _app.asar to be removed on restore")
	}

	if fileExists(markerPath) {
		t.Errorf("expected marker to be removed on restore")
	}

	restoredContent, err := os.ReadFile(appAsar)
	if err != nil {
		t.Fatalf("failed to read restored app.asar: %v", err)
	}

	if string(restoredContent) != string(initialContent) {
		t.Errorf("restored content mismatch: got %s, want %s", string(restoredContent), string(initialContent))
	}
}

func TestStaleBackupTrapOnHostUpdate(t *testing.T) {
	tempDir := t.TempDir()
	resourcesDir := filepath.Join(tempDir, "Contents", "Resources")
	if err := os.MkdirAll(resourcesDir, 0755); err != nil {
		t.Fatalf("failed to create mock resources dir: %v", err)
	}

	appAsar := filepath.Join(resourcesDir, "app.asar")
	v1Content := []byte("official-google-antigravity-v1.0.0-content")
	if err := os.WriteFile(appAsar, v1Content, 0644); err != nil {
		t.Fatalf("failed to create v1 app.asar: %v", err)
	}

	info := &host.HostInfo{
		Platform:      "darwin",
		RootPath:      tempDir,
		ResourcesPath: resourcesDir,
		Version:       "1.0.0",
	}

	runtimeJS := []byte("console.log('runtime active');")

	// 1. Initial patch applied to host v1
	if err := Apply(info, runtimeJS); err != nil {
		t.Fatalf("Apply on v1 failed: %v", err)
	}

	backupAsar := filepath.Join(resourcesDir, "_app.asar")
	backupContentV1, err := os.ReadFile(backupAsar)
	if err != nil {
		t.Fatalf("failed to read backup: %v", err)
	}
	if string(backupContentV1) != string(v1Content) {
		t.Fatalf("initial backup mismatch: got %s, want %s", string(backupContentV1), string(v1Content))
	}

	// 2. Simulate official host update: Google installer overwrites app.asar with v2 official unpatched binary
	// Note that _app.asar and .agy-boost.json still exist from v1.
	v2Content := []byte("official-google-antigravity-v2.0.0-content-new-update")
	if err := os.WriteFile(appAsar, v2Content, 0644); err != nil {
		t.Fatalf("failed to simulate host update to v2: %v", err)
	}

	info.Version = "2.0.0"

	// Verify that host inspector correctly identifies that it is NOT patched (because app.asar is not a bootstrap asar)
	inspected, err := host.FindAntigravity(tempDir)
	if err != nil {
		t.Fatalf("FindAntigravity failed: %v", err)
	}
	if inspected.IsPatched {
		t.Errorf("expected IsPatched to be false after official update, but was true")
	}

	// 3. Re-execute Apply(info, runtimeJS)
	// Must archive v2 in _app.asar and not maintain v1
	if err := Apply(info, runtimeJS); err != nil {
		t.Fatalf("Apply on v2 failed: %v", err)
	}

	backupContentV2, err := os.ReadFile(backupAsar)
	if err != nil {
		t.Fatalf("failed to read updated backup: %v", err)
	}
	if string(backupContentV2) != string(v2Content) {
		t.Errorf("stale backup trap detected! backup content was %s, expected %s", string(backupContentV2), string(v2Content))
	}

	// Verify marker is updated with v2
	markerData, err := os.ReadFile(filepath.Join(resourcesDir, ".agy-boost.json"))
	if err != nil {
		t.Fatalf("failed to read marker: %v", err)
	}
	if !filepath.IsAbs(resourcesDir) {
		t.Errorf("resourcesDir should be absolute")
	}
	if !stringContains(string(markerData), "2.0.0") {
		t.Errorf("marker does not contain updated host version 2.0.0: %s", string(markerData))
	}

	// 4. Execute Restore(info) -> must restore v2 byte-for-byte
	if err := Restore(info); err != nil {
		t.Fatalf("Restore failed: %v", err)
	}

	restoredContent, err := os.ReadFile(appAsar)
	if err != nil {
		t.Fatalf("failed to read restored app.asar: %v", err)
	}
	if string(restoredContent) != string(v2Content) {
		t.Errorf("restored content mismatch: got %s, want %s", string(restoredContent), string(v2Content))
	}
}

func stringContains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || filepath.Base(s) != "" && contains(s, substr))
}

func contains(s, substr string) bool {
	return len(substr) == 0 || (len(s) >= len(substr) && s[0:len(substr)] == substr) || (len(s) > 1 && contains(s[1:], substr))
}

