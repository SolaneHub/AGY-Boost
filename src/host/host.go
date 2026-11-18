package host

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
)

type HostInfo struct {
	Platform       string `json:"platform"`
	RootPath       string `json:"rootPath"`
	ExecutablePath string `json:"executablePath"`
	ResourcesPath  string `json:"resourcesPath"`
	CurrentAsar    string `json:"currentAsar"`
	OriginalAsar   string `json:"originalAsar"`
	MarkerPath     string `json:"markerPath"`
	RuntimeDir     string `json:"runtimeDir"`
	Version        string `json:"version"`
	IsPatched      bool   `json:"isPatched"`
}

type MarkerData struct {
	AGYBoostVersion string `json:"agyBoostVersion"`
	PatchedAt       string `json:"patchedAt"`
	HostVersion     string `json:"hostVersion"`
	EntryPoint      string `json:"entryPoint,omitempty"`
}

// FindAntigravity locates the standard Antigravity installation on the host system.
// If customPath is provided, only customPath is inspected.
func FindAntigravity(customPath string) (*HostInfo, error) {
	if customPath != "" {
		info, err := inspectCandidate(customPath)
		if err != nil {
			return nil, fmt.Errorf("custom Antigravity path invalid: %w", err)
		}
		return info, nil
	}

	var candidates []string

	home, _ := resolveHomeDir()

	switch runtime.GOOS {
	case "darwin":
		candidates = append(candidates,
			"/Applications/Antigravity.app",
			filepath.Join(home, "Applications/Antigravity.app"),
		)
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		progFiles := os.Getenv("ProgramFiles")
		if localAppData != "" {
			candidates = append(candidates,
				filepath.Join(localAppData, "Programs", "Antigravity"),
				filepath.Join(localAppData, "Antigravity"),
			)
		}
		if progFiles != "" {
			candidates = append(candidates, filepath.Join(progFiles, "Antigravity"))
		}
	case "linux":
		candidates = append(candidates,
			"/opt/Antigravity",
			"/usr/share/antigravity",
			filepath.Join(home, ".local/share/Antigravity"),
		)
	}

	for _, cand := range candidates {
		info, err := inspectCandidate(cand)
		if err == nil {
			return info, nil
		}
	}

	return nil, errors.New("Antigravity installation not found on system")
}

func inspectCandidate(root string) (*HostInfo, error) {
	if _, err := os.Stat(root); err != nil {
		return nil, err
	}

	info := &HostInfo{
		Platform: runtime.GOOS,
		RootPath: root,
	}

	switch runtime.GOOS {
	case "darwin":
		info.ResourcesPath = filepath.Join(root, "Contents", "Resources")
		info.ExecutablePath = filepath.Join(root, "Contents", "MacOS", "Antigravity")
	case "windows":
		info.ResourcesPath = filepath.Join(root, "resources")
		info.ExecutablePath = filepath.Join(root, "Antigravity.exe")
	default:
		info.ResourcesPath = filepath.Join(root, "resources")
		info.ExecutablePath = filepath.Join(root, "antigravity")
	}

	info.CurrentAsar = filepath.Join(info.ResourcesPath, "app.asar")
	info.OriginalAsar = filepath.Join(info.ResourcesPath, "_app.asar")
	info.MarkerPath = filepath.Join(info.ResourcesPath, ".agy-boost.json")
	info.RuntimeDir = filepath.Join(info.ResourcesPath, ".agy-boost")

	if _, err := os.Stat(info.CurrentAsar); err != nil && !fileExists(info.OriginalAsar) {
		return nil, fmt.Errorf("app.asar not found in %s", info.ResourcesPath)
	}

	// Check if already patched:
	// IsPatched is true ONLY IF the marker .agy-boost.json is valid AND app.asar is indeed the bootstrap asar.
	if fileExists(info.MarkerPath) && fileExists(info.OriginalAsar) && fileExists(info.CurrentAsar) {
		if data, err := os.ReadFile(info.MarkerPath); err == nil {
			var marker MarkerData
			if json.Unmarshal(data, &marker) == nil && marker.AGYBoostVersion != "" {
				if isBootstrap, err := IsBootstrapAsar(info.CurrentAsar); err == nil && isBootstrap {
					info.IsPatched = true
					info.Version = marker.HostVersion
				}
			}
		}
	}

	return info, nil
}

type asarHeaderCheck struct {
	Files map[string]interface{} `json:"files"`
}

// IsBootstrapAsar inspects an Electron .asar archive and checks if it contains "bootstrap.js".
func IsBootstrapAsar(asarPath string) (bool, error) {
	f, err := os.Open(asarPath)
	if err != nil {
		return false, err
	}
	defer f.Close()

	var sizeBuf [8]byte
	if _, err := io.ReadFull(f, sizeBuf[:]); err != nil {
		return false, err
	}

	headerBufSize := binary.LittleEndian.Uint32(sizeBuf[4:8])
	if headerBufSize < 8 {
		return false, nil
	}

	var headerPickleBuf [8]byte
	if _, err := io.ReadFull(f, headerPickleBuf[:]); err != nil {
		return false, err
	}

	jsonLen := binary.LittleEndian.Uint32(headerPickleBuf[4:8])
	if jsonLen == 0 || jsonLen > 50*1024*1024 {
		return false, nil
	}

	jsonBytes := make([]byte, jsonLen)
	if _, err := io.ReadFull(f, jsonBytes); err != nil {
		return false, err
	}

	var header asarHeaderCheck
	if err := json.Unmarshal(jsonBytes, &header); err != nil {
		return false, nil
	}

	if header.Files != nil {
		if _, ok := header.Files["bootstrap.js"]; ok {
			return true, nil
		}
	}

	return false, nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func resolveHomeDir() (string, error) {
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		return home, nil
	}
	usr, err := user.Current()
	if err == nil && usr.HomeDir != "" {
		return usr.HomeDir, nil
	}
	if homeEnv := os.Getenv("HOME"); homeEnv != "" {
		return homeEnv, nil
	}
	if userProfile := os.Getenv("USERPROFILE"); userProfile != "" {
		return userProfile, nil
	}
	return "", fmt.Errorf("unable to determine user home directory")
}

// UserDataDir returns the platform-specific data directory for AGY Boost
func UserDataDir() (string, error) {
	if custom := os.Getenv("AGY_BOOST_USER_DATA"); custom != "" {
		return custom, nil
	}

	homeDir, err := resolveHomeDir()
	if err != nil {
		return "", err
	}

	return userDataDirForOS(runtime.GOOS, homeDir), nil
}

func userDataDirForOS(goos, homeDir string) string {
	switch goos {
	case "darwin":
		return filepath.Join(homeDir, "Library", "Application Support", "AGYBoost")
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(homeDir, "AppData", "Roaming")
		}
		return filepath.Join(appData, "AGYBoost")
	default:
		var configBase string
		if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" && (filepath.IsAbs(xdg) || strings.HasPrefix(xdg, "/")) {
			configBase = xdg
		} else {
			configBase = filepath.Join(homeDir, ".config")
		}

		standardPath := filepath.Join(configBase, "AGYBoost")
		legacyPath := filepath.Join(configBase, "agy-boost")
		homeLegacyPath := filepath.Join(homeDir, ".config", "agy-boost")

		if fileExists(legacyPath) && !fileExists(standardPath) {
			return legacyPath
		}
		if fileExists(homeLegacyPath) && !fileExists(standardPath) {
			return homeLegacyPath
		}
		return standardPath
	}
}
