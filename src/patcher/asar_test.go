package patcher

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPackAsar(t *testing.T) {
	tempDir := t.TempDir()
	asarPath := filepath.Join(tempDir, "test.asar")

	files := map[string][]byte{
		"package.json": []byte(`{"name":"test-app","main":"index.js"}`),
		"index.js":     []byte(`console.log("hello world");`),
	}

	if err := PackAsar(files, asarPath); err != nil {
		t.Fatalf("PackAsar failed: %v", err)
	}

	info, err := os.Stat(asarPath)
	if err != nil {
		t.Fatalf("Stat failed: %v", err)
	}

	if info.Size() < 50 {
		t.Errorf("ASAR file too small: %d bytes", info.Size())
	}
}
