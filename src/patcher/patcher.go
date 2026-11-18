package patcher

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/agy-boost/agy-boost/src/host"
)

const AGYBoostVersion = "0.1.0"

// Apply installs the AGY Boost native patch into the target Antigravity installation.
func Apply(info *host.HostInfo, runtimeJS []byte) error {
	if info == nil {
		return errors.New("invalid host info")
	}

	resourcesDir := info.ResourcesPath
	currentAsar := filepath.Join(resourcesDir, "app.asar")
	backupAsar := filepath.Join(resourcesDir, "_app.asar")
	runtimeDir := filepath.Join(resourcesDir, ".agy-boost")
	markerPath := filepath.Join(resourcesDir, ".agy-boost.json")

	// 1. Verify state of current app.asar and manage backups
	if !fileExists(currentAsar) {
		// If current app.asar is missing, but backup exists, we cannot proceed safely without app.asar
		return fmt.Errorf("target app.asar not found at %s", currentAsar)
	}

	isBootstrap, err := host.IsBootstrapAsar(currentAsar)
	if err != nil {
		return fmt.Errorf("failed to inspect app.asar: %w", err)
	}

	if !isBootstrap {
		// current app.asar is an official/unpatched Antigravity release.
		// If _app.asar exists, it represents a stale backup from a previous version.
		// Atomically replace _app.asar with current app.asar by backing up to a temp file first.
		backupTemp := filepath.Join(resourcesDir, "_app.asar.tmp")
		_ = os.Remove(backupTemp)
		defer os.Remove(backupTemp)

		if err := copyFile(currentAsar, backupTemp); err != nil {
			return fmt.Errorf("failed to create backup of new app.asar: %w", err)
		}
		if err := os.Rename(backupTemp, backupAsar); err != nil {
			return fmt.Errorf("failed to update backup _app.asar: %w", err)
		}
	} else {
		// current app.asar is already a bootstrap asar.
		// Ensure backup _app.asar exists.
		if !fileExists(backupAsar) {
			return errors.New("app.asar is patched but original _app.asar backup is missing; cannot guarantee safe patching")
		}
	}

	// 2. Deploy runtime directory
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		return fmt.Errorf("failed to create runtime dir: %w", err)
	}

	runtimeDest := filepath.Join(runtimeDir, "runtime.js")
	if err := os.WriteFile(runtimeDest, runtimeJS, 0644); err != nil {
		return fmt.Errorf("failed to write runtime.js: %w", err)
	}

	// 3. Detect actual host entry point from original _app.asar package.json or fallback candidates
	entryPoint := DetectHostEntryPoint(backupAsar)

	// 4. Prepare bootstrap assets for the new app.asar
	escapedEntryJSON, _ := json.Marshal(entryPoint)
	bootstrapJS := fmt.Sprintf(`// AGY Boost v%s - Native Bootstrap Loader
const path = require("node:path");
const fs = require("node:fs");
const { app, session } = require("electron");

const resourcesDir = path.dirname(__dirname);
const originalAsar = path.join(resourcesDir, "_app.asar");
const runtimeFile = path.join(resourcesDir, ".agy-boost", "runtime.js");

// Read original package.json to restore host identity
let mainEntry = %s;
try {
  const originalPkg = JSON.parse(fs.readFileSync(path.join(originalAsar, "package.json"), "utf8"));
  if (originalPkg) {
    if (originalPkg.productName || originalPkg.name) {
      app.setName(originalPkg.productName || originalPkg.name);
    }
    if (originalPkg.main) mainEntry = originalPkg.main;
  }
} catch {}

app.setAppPath(originalAsar);

function setupSession(sess) {
  if (!sess || sess._agyBoostConfigured) return;
  sess._agyBoostConfigured = true;

  try {
    sess.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase().startsWith("content-security-policy")) {
          delete responseHeaders[key];
        }
      }
      callback({ responseHeaders });
    });
  } catch {}
}

// Intercept session creation for partition sessions
app.on("session-created", (s) => setupSession(s));

// Attach to defaultSession when app is ready
app.whenReady().then(() => {
  setupSession(session.defaultSession);
});

// Intercept webContents to ensure runtime is injected on every page load
app.on("web-contents-created", (_event, webContents) => {
  if (webContents.session) setupSession(webContents.session);

  webContents.on("dom-ready", () => {
    try {
      const url = webContents.getURL() || "";
      if (url.startsWith("https://127.0.0.1:") || url.startsWith("http://127.0.0.1:") || url.startsWith("https://localhost:") || url.startsWith("http://localhost:")) {
        if (fs.existsSync(runtimeFile)) {
          let tokenScript = "";
          try {
            const customUserData = process.env.AGY_BOOST_USER_DATA;
            const xdgEnv = process.env.XDG_CONFIG_HOME;
            const xdgConfig = (xdgEnv && path.isAbsolute(xdgEnv)) ? xdgEnv : path.join(app.getPath("home"), ".config");
            let tokenPath = customUserData
              ? path.join(customUserData, ".token")
              : (process.platform === "darwin"
                ? path.join(app.getPath("home"), "Library", "Application Support", "AGYBoost", ".token")
                : (process.platform === "win32"
                  ? path.join(process.env.APPDATA || path.join(app.getPath("home"), "AppData", "Roaming"), "AGYBoost", ".token")
                  : path.join(xdgConfig, "AGYBoost", ".token")));
            if (!customUserData && process.platform !== "darwin" && process.platform !== "win32" && !fs.existsSync(tokenPath)) {
              const legacyTokenPath = path.join(xdgConfig, "agy-boost", ".token");
              const homeLegacyTokenPath = path.join(app.getPath("home"), ".config", "agy-boost", ".token");
              if (fs.existsSync(legacyTokenPath)) {
                tokenPath = legacyTokenPath;
              } else if (fs.existsSync(homeLegacyTokenPath)) {
                tokenPath = homeLegacyTokenPath;
              }
            }
            if (fs.existsSync(tokenPath)) {
              const tokenVal = fs.readFileSync(tokenPath, "utf8").trim();
              if (tokenVal) tokenScript = "globalThis.__AGY_TOKEN__ = " + JSON.stringify(tokenVal) + "; if (document.documentElement) document.documentElement.dataset.agyToken = " + JSON.stringify(tokenVal) + ";\n";
            }
          } catch {}
          const code = fs.readFileSync(runtimeFile, "utf8");
          webContents.executeJavaScript(tokenScript + code).catch(() => {});
        }
      }
    } catch {}
  });
});

// Trust local loopback certificates for local daemon communication
app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
  if (url.startsWith("https://127.0.0.1:") || url.startsWith("https://localhost:")) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Delegate to the stock Antigravity application entry point
const originalMain = path.join(originalAsar, mainEntry);
require.main.filename = originalMain;
require(originalMain);
`, AGYBoostVersion, string(escapedEntryJSON))

	bootstrapPkg := `{"name":"antigravity","main":"bootstrap.js"}`

	asarFiles := map[string][]byte{
		"package.json": []byte(bootstrapPkg),
		"bootstrap.js": []byte(bootstrapJS),
	}

	tempAsar := filepath.Join(resourcesDir, "app.asar.tmp")
	_ = os.Remove(tempAsar)
	defer os.Remove(tempAsar)

	if err := PackAsar(asarFiles, tempAsar); err != nil {
		return fmt.Errorf("failed to pack bootstrap asar: %w", err)
	}

	if err := os.Rename(tempAsar, currentAsar); err != nil {
		return fmt.Errorf("failed to replace app.asar: %w", err)
	}

	// 5. Write marker file
	marker := host.MarkerData{
		AGYBoostVersion: AGYBoostVersion,
		PatchedAt:       time.Now().UTC().Format(time.RFC3339),
		HostVersion:     info.Version,
		EntryPoint:      entryPoint,
	}
	markerJSON, _ := json.MarshalIndent(marker, "", "  ")
	_ = os.WriteFile(markerPath, markerJSON, 0644)

	return nil
}

// DetectHostEntryPoint inspects an original Antigravity ASAR archive to detect its main entry point.
// It first attempts to parse package.json from the archive. If missing or invalid, it tests standard
// fallback entry points (e.g. dist/main.js, bundle/desktop.js, etc.) and defaults safely to "dist/main.js".
func DetectHostEntryPoint(asarPath string) string {
	fallbackCandidates := []string{
		"dist/main.js",
		"bundle/entry.cjs",
		"bundle/desktop.js",
		"bundle/main.js",
		"main.js",
		"index.js",
	}

	// 1. Try reading package.json from the archive
	if pkgBytes, err := ReadAsarFile(asarPath, "package.json"); err == nil {
		var pkg struct {
			Main string `json:"main"`
		}
		if err := json.Unmarshal(pkgBytes, &pkg); err == nil && pkg.Main != "" {
			return filepath.ToSlash(filepath.Clean(pkg.Main))
		}
	}

	// 2. Fallback: inspect ASAR header for presence of known entry point files
	for _, candidate := range fallbackCandidates {
		if AsarFileExists(asarPath, candidate) {
			return candidate
		}
	}

	// 3. Ultimate default
	return "dist/main.js"
}

// Restore removes the AGY Boost patch and restores stock Antigravity byte-for-byte.
func Restore(info *host.HostInfo) error {
	if info == nil {
		return errors.New("invalid host info")
	}

	resourcesDir := info.ResourcesPath
	currentAsar := filepath.Join(resourcesDir, "app.asar")
	backupAsar := filepath.Join(resourcesDir, "_app.asar")
	runtimeDir := filepath.Join(resourcesDir, ".agy-boost")
	markerPath := filepath.Join(resourcesDir, ".agy-boost.json")

	if !fileExists(backupAsar) {
		return errors.New("original _app.asar backup not found; cannot restore")
	}

	// Remove patched app.asar
	_ = os.Remove(currentAsar)

	// Move _app.asar back to app.asar
	if err := os.Rename(backupAsar, currentAsar); err != nil {
		return fmt.Errorf("failed to restore original app.asar: %w", err)
	}

	// Remove marker and runtime dir
	_ = os.Remove(markerPath)
	_ = os.RemoveAll(runtimeDir)

	return nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer func() {
		_ = out.Close()
	}()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}

	return out.Sync()
}
