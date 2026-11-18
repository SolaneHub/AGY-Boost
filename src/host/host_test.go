package host

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestUserDataDir(t *testing.T) {
	t.Setenv("AGY_BOOST_USER_DATA", "")
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
	var resourcesDir string
	if runtime.GOOS == "darwin" {
		resourcesDir = filepath.Join(tempDir, "Contents", "Resources")
	} else {
		resourcesDir = filepath.Join(tempDir, "resources")
	}
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

func TestUserDataDir_Precedence(t *testing.T) {
	tempDir := t.TempDir()
	customPath := filepath.Join(tempDir, "custom_user_data")
	t.Setenv("AGY_BOOST_USER_DATA", customPath)

	dir, err := UserDataDir()
	if err != nil {
		t.Fatalf("UserDataDir failed: %v", err)
	}
	if dir != customPath {
		t.Errorf("expected UserDataDir to match AGY_BOOST_USER_DATA: got %q, want %q", dir, customPath)
	}
}

func TestUserDataDir_LinuxXDGAndFallback(t *testing.T) {
	// 1. With XDG_CONFIG_HOME set
	t.Setenv("XDG_CONFIG_HOME", "/custom/xdg_config")
	got := userDataDirForOS("linux", "/home/testuser")
	expected := filepath.Join("/custom/xdg_config", "AGYBoost")
	if got != expected {
		t.Errorf("expected %q when XDG_CONFIG_HOME is set, got %q", expected, got)
	}

	// 2. With XDG_CONFIG_HOME unset / empty
	t.Setenv("XDG_CONFIG_HOME", "")
	got = userDataDirForOS("linux", "/home/testuser")
	expected = filepath.Join("/home/testuser", ".config", "AGYBoost")
	if got != expected {
		t.Errorf("expected %q when XDG_CONFIG_HOME is unset, got %q", expected, got)
	}

	// 3. Legacy path fallback when standard does not exist
	tempHome := t.TempDir()
	legacyConfigDir := filepath.Join(tempHome, ".config", "agy-boost")
	if err := os.MkdirAll(legacyConfigDir, 0755); err != nil {
		t.Fatalf("failed to create legacy config dir: %v", err)
	}
	got = userDataDirForOS("linux", tempHome)
	if got != legacyConfigDir {
		t.Errorf("expected legacy path %q when standard does not exist, got %q", legacyConfigDir, got)
	}

	// 4. When standard directory also exists, standard takes precedence over legacy
	standardConfigDir := filepath.Join(tempHome, ".config", "AGYBoost")
	if err := os.MkdirAll(standardConfigDir, 0755); err != nil {
		t.Fatalf("failed to create standard config dir: %v", err)
	}
	got = userDataDirForOS("linux", tempHome)
	if got != standardConfigDir {
		t.Errorf("expected standard path %q to take precedence over legacy, got %q", standardConfigDir, got)
	}

	// 5. With relative XDG_CONFIG_HOME, ignored per XDG spec and falls back to homeDir/.config
	t.Setenv("XDG_CONFIG_HOME", "relative/path")
	got = userDataDirForOS("linux", "/home/testuser")
	expected = filepath.Join("/home/testuser", ".config", "AGYBoost")
	if got != expected {
		t.Errorf("expected %q when XDG_CONFIG_HOME is relative, got %q", expected, got)
	}
}

func TestUserDataDir_DarwinAndWindows(t *testing.T) {
	// Darwin
	darwinDir := userDataDirForOS("darwin", "/Users/alice")
	expectedDarwin := filepath.Join("/Users/alice", "Library", "Application Support", "AGYBoost")
	if darwinDir != expectedDarwin {
		t.Errorf("expected darwin path %q, got %q", expectedDarwin, darwinDir)
	}

	// Windows with APPDATA
	t.Setenv("APPDATA", `C:\Users\alice\AppData\Roaming`)
	winDir := userDataDirForOS("windows", `C:\Users\alice`)
	expectedWin := filepath.Join(`C:\Users\alice\AppData\Roaming`, "AGYBoost")
	if winDir != expectedWin {
		t.Errorf("expected windows path %q with APPDATA, got %q", expectedWin, winDir)
	}

	// Windows fallback when APPDATA is unset
	t.Setenv("APPDATA", "")
	winDirFallback := userDataDirForOS("windows", `C:\Users\alice`)
	expectedWinFallback := filepath.Join(`C:\Users\alice`, "AppData", "Roaming", "AGYBoost")
	if winDirFallback != expectedWinFallback {
		t.Errorf("expected windows path %q without APPDATA, got %q", expectedWinFallback, winDirFallback)
	}
}

func TestResolveHomeDir(t *testing.T) {
	home, err := resolveHomeDir()
	if err != nil {
		t.Fatalf("resolveHomeDir failed: %v", err)
	}
	if home == "" {
		t.Fatal("resolveHomeDir returned empty string")
	}
}
