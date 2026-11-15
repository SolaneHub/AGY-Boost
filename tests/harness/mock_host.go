package harness

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/agy-boost/agy-boost/src/patcher"
)

// MockHost holds the layout and metadata of a simulated Antigravity installation.
type MockHost struct {
	RootDir        string
	ResourcesDir   string
	ExecutablePath string
	AppAsarPath    string
	OriginalSHA256 string
}

// NewMockHost creates a fully valid simulated Google Antigravity directory tree inside a temporary directory.
// The structure matches the native layout of the current operating system (macOS, Windows, or Linux).
func NewMockHost(t testing.TB) *MockHost {
	tempDir := t.TempDir()

	mock := &MockHost{
		RootDir: tempDir,
	}

	var exeRelPath string
	var resourcesRelPath string

	switch runtime.GOOS {
	case "darwin":
		resourcesRelPath = filepath.Join("Contents", "Resources")
		exeRelPath = filepath.Join("Contents", "MacOS", "Antigravity")
	case "windows":
		resourcesRelPath = "resources"
		exeRelPath = "Antigravity.exe"
	default: // linux and others
		resourcesRelPath = "resources"
		exeRelPath = "antigravity"
	}

	mock.ResourcesDir = filepath.Join(tempDir, resourcesRelPath)
	mock.ExecutablePath = filepath.Join(tempDir, exeRelPath)
	mock.AppAsarPath = filepath.Join(mock.ResourcesDir, "app.asar")

	// Create directories
	if err := os.MkdirAll(mock.ResourcesDir, 0755); err != nil {
		t.Fatalf("failed to create mock resources dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(mock.ExecutablePath), 0755); err != nil {
		t.Fatalf("failed to create mock executable dir: %v", err)
	}

	// Create dummy host executable binary
	dummyBinaryContent := []byte("#!/bin/sh\necho 'Google Antigravity Host Mock'\n")
	if err := os.WriteFile(mock.ExecutablePath, dummyBinaryContent, 0755); err != nil {
		t.Fatalf("failed to create mock executable: %v", err)
	}

	// Generate a valid original app.asar containing package.json and dist/main.js
	originalFiles := map[string][]byte{
		"package.json": []byte(`{"name":"antigravity","main":"dist/main.js","version":"2.32.1"}`),
		"dist/main.js": []byte(`console.log("Antigravity host entrypoint running");`),
	}

	if err := patcher.PackAsar(originalFiles, mock.AppAsarPath); err != nil {
		t.Fatalf("failed to generate original mock app.asar: %v", err)
	}

	// Compute SHA-256 of the pristine original app.asar
	hash, err := FileSHA256(mock.AppAsarPath)
	if err != nil {
		t.Fatalf("failed to calculate sha256 of original app.asar: %v", err)
	}
	mock.OriginalSHA256 = hash

	return mock
}

// FileSHA256 computes the hexadecimal SHA-256 checksum of a file.
func FileSHA256(filePath string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return "", fmt.Errorf("hashing %s failed: %w", filePath, err)
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}
