package host

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestUserDataDir(t *testing.T) {
	dir, err := UserDataDir()
	if err != nil {
		t.Fatalf("UserDataDir failed: %v", err)
	}

	if dir == "" {
		t.Fatal("UserDataDir returned empty string")
	}

	base := filepath.Base(dir)
	if base != "AGYBoost" && base != "agy-boost" {
		t.Errorf("Unexpected base directory name: %s", base)
	}
}

func TestInspectCandidateIsPatchedCheck(t *testing.T) {
	tempDir := t.TempDir()
	resourcesDir := filepath.Join(tempDir, "Contents", "Resources")
	if err := os.MkdirAll(resourcesDir, 0755); err != nil {
		t.Fatalf("failed to create resources dir: %v", err)
	}

	currentAsar := filepath.Join(resourcesDir, "app.asar")
	backupAsar := filepath.Join(resourcesDir, "_app.asar")
	markerPath := filepath.Join(resourcesDir, ".agy-boost.json")

	// Stock unpatched file
	if err := os.WriteFile(currentAsar, []byte("stock-asar-binary"), 0644); err != nil {
		t.Fatalf("failed to write app.asar: %v", err)
	}

	info, err := inspectCandidate(tempDir)
	if err != nil {
		t.Fatalf("inspectCandidate failed: %v", err)
	}
	if info.IsPatched {
		t.Errorf("expected IsPatched=false for clean stock install")
	}

	// Create marker and backup as if from a previous patch, but app.asar is stock (simulating host update)
	if err := os.WriteFile(backupAsar, []byte("old-backup"), 0644); err != nil {
		t.Fatalf("failed to write _app.asar: %v", err)
	}
	marker := MarkerData{
		AGYBoostVersion: "0.0.0",
		PatchedAt:       "2026-01-01T00:00:00Z",
		HostVersion:     "1.0.0",
	}
	markerJSON, _ := json.Marshal(marker)
	if err := os.WriteFile(markerPath, markerJSON, 0644); err != nil {
		t.Fatalf("failed to write marker: %v", err)
	}

	info, err = inspectCandidate(tempDir)
	if err != nil {
		t.Fatalf("inspectCandidate failed: %v", err)
	}
	if info.IsPatched {
		t.Errorf("expected IsPatched=false when app.asar is stock even if marker and backup exist")
	}
}

