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

	// Verify ReadAsarFile on flat and nested entries
	pkgData, err := ReadAsarFile(asarPath, "package.json")
	if err != nil {
		t.Fatalf("ReadAsarFile failed for package.json: %v", err)
	}
	if string(pkgData) != `{"name":"test-app","main":"index.js"}` {
		t.Errorf("ReadAsarFile returned unexpected content: %s", string(pkgData))
	}

	indexData, err := ReadAsarFile(asarPath, "index.js")
	if err != nil {
		t.Fatalf("ReadAsarFile failed for index.js: %v", err)
	}
	if string(indexData) != `console.log("hello world");` {
		t.Errorf("ReadAsarFile returned unexpected content: %s", string(indexData))
	}
}

func TestPackAndReadNestedAsar(t *testing.T) {
	tempDir := t.TempDir()
	asarPath := filepath.Join(tempDir, "nested.asar")

	files := map[string][]byte{
		"package.json":     []byte(`{"name":"nested-app","main":"bundle/entry.cjs"}`),
		"bundle/entry.cjs": []byte(`console.log("nested entrypoint");`),
		"dist/deep/sub.js": []byte(`module.exports = "deep";`),
	}

	if err := PackAsar(files, asarPath); err != nil {
		t.Fatalf("PackAsar with nested files failed: %v", err)
	}

	entryData, err := ReadAsarFile(asarPath, "bundle/entry.cjs")
	if err != nil {
		t.Fatalf("ReadAsarFile failed for bundle/entry.cjs: %v", err)
	}
	if string(entryData) != `console.log("nested entrypoint");` {
		t.Errorf("ReadAsarFile content mismatch: %s", string(entryData))
	}

	subData, err := ReadAsarFile(asarPath, "dist/deep/sub.js")
	if err != nil {
		t.Fatalf("ReadAsarFile failed for dist/deep/sub.js: %v", err)
	}
	if string(subData) != `module.exports = "deep";` {
		t.Errorf("ReadAsarFile content mismatch: %s", string(subData))
	}

	// Test non-existent file
	if _, err := ReadAsarFile(asarPath, "nonexistent.js"); err == nil {
		t.Errorf("expected error reading non-existent file, got nil")
	}
}
