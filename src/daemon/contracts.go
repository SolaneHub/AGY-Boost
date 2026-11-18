package daemon

// ModTogglePayload represents the request payload for POST /mods/toggle.
type ModTogglePayload struct {
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

// ModToggleResponse represents the response payload for POST /mods/toggle.
type ModToggleResponse struct {
	OK      bool   `json:"ok"`
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

// OpenFolderResponse represents the response payload for POST /mods/open-folder.
type OpenFolderResponse struct {
	OK   bool   `json:"ok"`
	Path string `json:"path,omitempty"`
}

// DaemonSpawnPayload represents the request payload for POST /daemon/spawn.
type DaemonSpawnPayload struct {
	ModID      string   `json:"modId"`
	BinaryPath string   `json:"binaryPath"`
	Args       []string `json:"args"`
}

// DaemonSpawnResponse represents the response payload for POST /daemon/spawn.
type DaemonSpawnResponse struct {
	OK    bool   `json:"ok"`
	PID   int    `json:"pid"`
	ModID string `json:"modId"`
}

// DaemonKillPayload represents the request payload for POST /daemon/kill.
type DaemonKillPayload struct {
	ModID string `json:"modId"`
}

// DaemonKillResponse represents the response payload for POST /daemon/kill.
type DaemonKillResponse struct {
	OK    bool   `json:"ok"`
	ModID string `json:"modId"`
}

// HealthResponse represents the response payload for GET /health.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Uptime  string `json:"uptime"`
	ModsDir string `json:"modsDir"`
}

// AuthTokenHeaders represents IPC authorization headers and token exchange contract.
type AuthTokenHeaders struct {
	Token string `json:"token"`
}
