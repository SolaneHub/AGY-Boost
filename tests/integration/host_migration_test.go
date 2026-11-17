package integration

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/agy-boost/agy-boost/src/host"
	"github.com/agy-boost/agy-boost/src/patcher"
	"github.com/agy-boost/agy-boost/tests/harness"
)

func TestHostMigrationAndStaleBackupTrap(t *testing.T) {
	// Step 1: Crea un'installazione stock v2.0 con hash originale SHA256_A.
	mock := harness.NewMockHost(t)
	sha256A := mock.OriginalSHA256
	if sha256A == "" {
		t.Fatalf("expected non-empty sha256 for initial mock host")
	}

	info, err := host.FindAntigravity(mock.RootDir)
	if err != nil {
		t.Fatalf("host.FindAntigravity failed: %v", err)
	}
	info.Version = "2.0.0"

	// Step 2: Esegui patcher.Apply(info, runtimeJS) -> app.asar diventa bootstrap, _app.asar ha hash SHA256_A.
	mockRuntimeJS := []byte("// agy-boost runtime v2.0\nwindow.__AGY_BOOST_LOADED__ = true;\n")
	if err := patcher.Apply(info, mockRuntimeJS); err != nil {
		t.Fatalf("patcher.Apply on v2.0 failed: %v", err)
	}

	isBootstrap, err := host.IsBootstrapAsar(info.CurrentAsar)
	if err != nil {
		t.Fatalf("failed to inspect patched app.asar: %v", err)
	}
	if !isBootstrap {
		t.Fatalf("expected app.asar to be a bootstrap archive after Apply")
	}

	backupSHA, err := harness.FileSHA256(info.OriginalAsar)
	if err != nil {
		t.Fatalf("failed to calculate sha256 of _app.asar: %v", err)
	}
	if backupSHA != sha256A {
		t.Fatalf("_app.asar checksum mismatch: got %s, want SHA256_A (%s)", backupSHA, sha256A)
	}

	// Step 3: Simula un aggiornamento ufficiale Antigravity a v2.1:
	// Sovrascrivi app.asar con un nuovo binario stock v2.1 avente hash SHA256_B (lasciando _app.asar stantio con SHA256_A).
	v21Files := map[string][]byte{
		"package.json": []byte(`{"name":"antigravity","main":"dist/main.js","version":"2.1.0"}`),
		"dist/main.js": []byte(`console.log("Antigravity host entrypoint v2.1.0 running");`),
	}
	if err := patcher.PackAsar(v21Files, mock.AppAsarPath); err != nil {
		t.Fatalf("failed to pack mock v2.1 app.asar: %v", err)
	}

	sha256B, err := harness.FileSHA256(mock.AppAsarPath)
	if err != nil {
		t.Fatalf("failed to calculate sha256 of v2.1 app.asar: %v", err)
	}
	if sha256B == sha256A {
		t.Fatalf("SHA256_B (%s) should differ from SHA256_A (%s)", sha256B, sha256A)
	}

	// Verify _app.asar is still stale SHA256_A
	staleBackupSHA, err := harness.FileSHA256(info.OriginalAsar)
	if err != nil {
		t.Fatalf("failed to read stale _app.asar: %v", err)
	}
	if staleBackupSHA != sha256A {
		t.Fatalf("expected stale _app.asar to maintain SHA256_A, got %s", staleBackupSHA)
	}

	// Step 4: Ispeziona con host.FindAntigravity: deve rilevare IsPatched = false.
	reinspectedInfo, err := host.FindAntigravity(mock.RootDir)
	if err != nil {
		t.Fatalf("host.FindAntigravity after update failed: %v", err)
	}
	if reinspectedInfo.IsPatched {
		t.Fatalf("expected IsPatched=false after official host update, got true")
	}
	reinspectedInfo.Version = "2.1.0"

	// Step 5: Esegui nuovamente patcher.Apply(info, runtimeJS):
	// Verifica che il patcher rilevi la versione stock v2.1, aggiorni atomicamente _app.asar con hash SHA256_B e applichi il nuovo bootstrap.
	if err := patcher.Apply(reinspectedInfo, mockRuntimeJS); err != nil {
		t.Fatalf("patcher.Apply on v2.1 failed: %v", err)
	}

	isBootstrapV21, err := host.IsBootstrapAsar(reinspectedInfo.CurrentAsar)
	if err != nil {
		t.Fatalf("failed to inspect patched v2.1 app.asar: %v", err)
	}
	if !isBootstrapV21 {
		t.Fatalf("expected app.asar to be bootstrap archive after re-applying patch")
	}

	updatedBackupSHA, err := harness.FileSHA256(reinspectedInfo.OriginalAsar)
	if err != nil {
		t.Fatalf("failed to calculate sha256 of updated _app.asar: %v", err)
	}
	if updatedBackupSHA != sha256B {
		t.Fatalf("_app.asar checksum mismatch after re-patch: got %s, want SHA256_B (%s)", updatedBackupSHA, sha256B)
	}

	// Step 6: Esegui patcher.Restore(info):
	// Verifica che app.asar ripristinato abbia esattamente hash SHA256_B byte-for-byte.
	if err := patcher.Restore(reinspectedInfo); err != nil {
		t.Fatalf("patcher.Restore failed: %v", err)
	}

	restoredSHA, err := harness.FileSHA256(mock.AppAsarPath)
	if err != nil {
		t.Fatalf("failed to calculate sha256 of restored app.asar: %v", err)
	}
	if restoredSHA != sha256B {
		t.Fatalf("restored app.asar sha256 mismatch: got %s, want SHA256_B (%s)", restoredSHA, sha256B)
	}

	// Verifica che _app.asar sia stato rimosso
	if _, err := os.Stat(filepath.Join(mock.ResourcesDir, "_app.asar")); !os.IsNotExist(err) {
		t.Fatalf("expected _app.asar to be removed after Restore")
	}

	// Verifica che il marker sia stato rimosso
	if _, err := os.Stat(filepath.Join(mock.ResourcesDir, ".agy-boost.json")); !os.IsNotExist(err) {
		t.Fatalf("expected .agy-boost.json to be removed after Restore")
	}

	// Ispeziona di nuovo con host.FindAntigravity: deve essere pulito e IsPatched = false
	cleanInfo, err := host.FindAntigravity(mock.RootDir)
	if err != nil {
		t.Fatalf("host.FindAntigravity after restore failed: %v", err)
	}
	if cleanInfo.IsPatched {
		t.Fatalf("expected IsPatched=false after restore")
	}
}
