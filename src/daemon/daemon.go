package daemon

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/agy-boost/agy-boost/src/host"
)

type ModManifest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Author      string `json:"author,omitempty"`
	Main        string `json:"main,omitempty"`
	Style       any    `json:"style,omitempty"`
	Wasm        string `json:"wasm,omitempty"`
	Daemon      string `json:"daemon,omitempty"`
	Enabled     bool   `json:"enabled"`
	Path        string `json:"path"`
}

type DaemonServer struct {
	Port           int
	Token          string
	startTime      time.Time
	modsDir        string
	openFolderFunc func(dir string) error
	procsMu        sync.Mutex
	procs          map[string]*exec.Cmd
	stateMu        sync.RWMutex
	disabled       map[string]bool

	// In-memory mods cache
	modsCacheMu   sync.RWMutex
	cachedMods    []ModManifest
	cacheValid    bool
	modsWatcherMu sync.Mutex
	lastDirMtime  time.Time

	// In-memory diagnostic ring buffer
	logRing *LogRingBuffer
}

func generateSecureToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func isAllowedOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	hostname := u.Hostname()
	return hostname == "127.0.0.1" || hostname == "localhost"
}

func NewDaemonServer(port int) (*DaemonServer, error) {
	userData, err := host.UserDataDir()
	if err != nil {
		return nil, err
	}
	return NewDaemonServerWithDir(port, userData)
}

// NewDaemonServerWithDir instantiates a daemon server rooted at customUserDataDir.
func NewDaemonServerWithDir(port int, customUserDataDir string) (*DaemonServer, error) {
	userData := customUserDataDir
	modsDir := filepath.Join(userData, "mods")
	_ = os.MkdirAll(modsDir, 0755)

	tokenPath := filepath.Join(userData, ".token")
	var token string
	if data, err := os.ReadFile(tokenPath); err == nil && len(strings.TrimSpace(string(data))) == 64 {
		token = strings.TrimSpace(string(data))
	} else {
		var err error
		token, err = generateSecureToken()
		if err != nil {
			return nil, fmt.Errorf("failed to generate secure token: %w", err)
		}
		if err := writeSecureToken(tokenPath, token); err != nil {
			return nil, fmt.Errorf("failed to save security token: %w", err)
		}
	}

	server := &DaemonServer{
		Port:      port,
		Token:     token,
		startTime: time.Now(),
		modsDir:   modsDir,
		procs:     make(map[string]*exec.Cmd),
		disabled:  make(map[string]bool),
		logRing:   NewLogRingBuffer(LogBufferCapacity),
	}
	server.loadState()
	server.Log("INFO", fmt.Sprintf("Daemon server initialized (modsDir: %s)", modsDir))
	return server, nil
}

func (s *DaemonServer) routes() http.Handler {
	mux := http.NewServeMux()

	cors := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				if !isAllowedOrigin(origin) {
					http.Error(w, "Forbidden origin", http.StatusForbidden)
					return
				}
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-AGY-Token")

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next(w, r)
		}
	}

	auth := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get("X-AGY-Token")
			if subtle.ConstantTimeCompare([]byte(token), []byte(s.Token)) != 1 {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			next(w, r)
		}
	}

	mux.HandleFunc("/health", cors(s.handleHealth))
	mux.HandleFunc("/diagnostics", cors(auth(s.handleDiagnostics)))
	mux.HandleFunc("/mods", cors(auth(s.handleMods)))
	mux.HandleFunc("/mods/toggle", cors(auth(s.handleModToggle)))
	mux.HandleFunc("/mods/open-folder", cors(auth(s.handleModOpenFolder)))
	mux.HandleFunc("/mods/file", cors(auth(s.handleModFile)))
	mux.HandleFunc("/daemon/spawn", cors(auth(s.handleDaemonSpawn)))
	mux.HandleFunc("/daemon/kill", cors(auth(s.handleDaemonKill)))

	return mux
}

// ServeHTTP implements http.Handler for DaemonServer, routing requests through routes().
func (s *DaemonServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.routes().ServeHTTP(w, r)
}

// Routes returns the configured HTTP handler for the daemon server.
func (s *DaemonServer) Routes() http.Handler {
	return s.routes()
}

func (s *DaemonServer) Start() error {
	handler := s.routes()
	addr := fmt.Sprintf("127.0.0.1:%d", s.Port)
	s.Log("INFO", fmt.Sprintf("Listening on http://%s", addr))
	fmt.Printf("[AGY Boost Daemon] Listening natively on http://%s (RAM <10MB)\n", addr)
	return http.ListenAndServe(addr, handler)
}

func (s *DaemonServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "ok",
		"version": "0.1.0",
		"uptime":  time.Since(s.startTime).String(),
		"modsDir": s.modsDir,
	})
}

// DiagnosticsResponse represents the telemetry payload returned by GET /diagnostics.
type DiagnosticsResponse struct {
	Uptime           string     `json:"uptime"`
	UptimeSeconds    float64    `json:"uptimeSeconds"`
	ResidentMemoryKB uint64     `json:"residentMemoryKB"`
	Goroutines       int        `json:"goroutines"`
	ActiveGoroutines int        `json:"activeGoroutines"`
	EnabledMods      int        `json:"enabledMods"`
	EnabledModsCount int        `json:"enabledModsCount"`
	Logs             []LogEntry `json:"logs"`
}

func (s *DaemonServer) handleDiagnostics(w http.ResponseWriter, r *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	residentBytes := mem.Alloc
	if mem.HeapInuse > 0 && mem.HeapInuse < 10*1024*1024 {
		residentBytes = mem.HeapInuse
	}
	residentMemoryKB := residentBytes / 1024

	var logs []LogEntry
	if s.logRing != nil {
		logs = s.logRing.Entries()
	} else {
		logs = []LogEntry{}
	}

	uptimeDuration := time.Since(s.startTime)
	numGoroutines := runtime.NumGoroutine()
	enabledCount := s.countEnabledMods()

	resp := DiagnosticsResponse{
		Uptime:           uptimeDuration.String(),
		UptimeSeconds:    uptimeDuration.Seconds(),
		ResidentMemoryKB: residentMemoryKB,
		Goroutines:       numGoroutines,
		ActiveGoroutines: numGoroutines,
		EnabledMods:      enabledCount,
		EnabledModsCount: enabledCount,
		Logs:             logs,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *DaemonServer) countEnabledMods() int {
	s.checkFilesystemChanges()

	s.modsCacheMu.RLock()
	valid := s.cacheValid
	s.modsCacheMu.RUnlock()

	if !valid {
		s.refreshModsCache()
	}

	s.modsCacheMu.RLock()
	defer s.modsCacheMu.RUnlock()

	count := 0
	for _, m := range s.cachedMods {
		if m.Enabled {
			count++
		}
	}
	return count
}

func (s *DaemonServer) Log(level string, message string) {
	if s.logRing != nil {
		s.logRing.Add(LogEntry{
			Timestamp: time.Now().UTC(),
			Level:     level,
			Message:   message,
		})
	}
}

func (s *DaemonServer) LogRing() *LogRingBuffer {
	return s.logRing
}

func (s *DaemonServer) handleMods(w http.ResponseWriter, r *http.Request) {
	s.checkFilesystemChanges()

	s.modsCacheMu.RLock()
	if s.cacheValid {
		mods := s.cachedMods
		s.modsCacheMu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mods)
		return
	}
	s.modsCacheMu.RUnlock()

	s.refreshModsCache()

	s.modsCacheMu.RLock()
	mods := s.cachedMods
	s.modsCacheMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(mods)
}

func (s *DaemonServer) handleModToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ID      string `json:"id"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.stateMu.Lock()
	if s.disabled == nil {
		s.disabled = make(map[string]bool)
	}
	if req.Enabled {
		delete(s.disabled, req.ID)
	} else {
		s.disabled[req.ID] = true
	}
	s.stateMu.Unlock()
	s.saveState()

	// Invalidate cache or update in-memory entry directly
	s.modsCacheMu.Lock()
	if s.cacheValid {
		for i := range s.cachedMods {
			if s.cachedMods[i].ID == req.ID {
				s.cachedMods[i].Enabled = req.Enabled
				break
			}
		}
	} else {
		s.cacheValid = false
	}
	s.modsCacheMu.Unlock()

	s.Log("INFO", fmt.Sprintf("Mod toggle: id=%s enabled=%v", req.ID, req.Enabled))

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "id": req.ID, "enabled": req.Enabled})
}

func (s *DaemonServer) handleModOpenFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Ensure mods directory exists before opening
	_ = os.MkdirAll(s.modsDir, 0755)

	if s.openFolderFunc != nil {
		_ = s.openFolderFunc(s.modsDir)
	} else {
		var cmd *exec.Cmd
		switch runtime.GOOS {
		case "windows":
			cmd = exec.Command("explorer", s.modsDir)
		case "darwin":
			cmd = exec.Command("open", s.modsDir)
		default:
			cmd = exec.Command("xdg-open", s.modsDir)
		}
		if cmd != nil {
			_ = cmd.Start()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":   true,
		"path": s.modsDir,
	})
}

func (s *DaemonServer) handleModFile(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	file := r.URL.Query().Get("file")
	if id == "" || file == "" {
		http.Error(w, "Missing id or file parameter", http.StatusBadRequest)
		return
	}

	cleanID := filepath.Clean(id)
	if filepath.IsAbs(cleanID) || strings.Contains(cleanID, "..") || strings.ContainsAny(cleanID, `/\`) {
		http.Error(w, "Invalid mod id", http.StatusForbidden)
		return
	}

	cleanFile := filepath.Clean(file)
	if filepath.IsAbs(cleanFile) || strings.HasPrefix(cleanFile, "..") || strings.Contains(cleanFile, "..") ||
		strings.HasPrefix(file, "/") || strings.HasPrefix(file, "\\") ||
		strings.HasPrefix(cleanFile, "/") || strings.HasPrefix(cleanFile, "\\") ||
		filepath.VolumeName(cleanFile) != "" {
		http.Error(w, "Invalid file path", http.StatusForbidden)
		return
	}

	modPath := filepath.Join(s.modsDir, cleanID)
	targetPath := filepath.Join(modPath, cleanFile)

	if !strings.HasPrefix(targetPath, s.modsDir) {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	rel, err := filepath.Rel(modPath, targetPath)
	if err != nil || strings.HasPrefix(rel, "..") || strings.Contains(rel, "..") {
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	f, err := os.Open(targetPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "Failed to read file metadata", http.StatusInternalServerError)
		return
	}

	switch filepath.Ext(targetPath) {
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case ".js", ".mjs":
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	case ".wasm":
		w.Header().Set("Content-Type", "application/wasm")
	case ".json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	default:
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	}

	http.ServeContent(w, r, filepath.Base(targetPath), stat.ModTime(), f)
}

func (s *DaemonServer) loadState() {
	s.stateMu.Lock()
	if s.disabled == nil {
		s.disabled = make(map[string]bool)
	}
	s.stateMu.Unlock()

	stateFile := filepath.Join(s.modsDir, ".state.json")
	data, err := os.ReadFile(stateFile)
	if err != nil {
		return
	}

	var state struct {
		Disabled []string `json:"disabled"`
	}
	if err := json.Unmarshal(data, &state); err == nil {
		s.stateMu.Lock()
		for _, id := range state.Disabled {
			s.disabled[id] = true
		}
		s.stateMu.Unlock()
	}

	s.modsCacheMu.Lock()
	s.cacheValid = false
	s.modsCacheMu.Unlock()
}

func (s *DaemonServer) saveState() {
	s.stateMu.RLock()
	var disabledList []string
	for id := range s.disabled {
		disabledList = append(disabledList, id)
	}
	s.stateMu.RUnlock()

	stateFile := filepath.Join(s.modsDir, ".state.json")
	state := struct {
		Disabled []string `json:"disabled"`
	}{
		Disabled: disabledList,
	}

	if data, err := json.MarshalIndent(state, "", "  "); err == nil {
		_ = os.WriteFile(stateFile, data, 0644)
	}
}

func (s *DaemonServer) refreshModsCache() {
	s.modsWatcherMu.Lock()
	defer s.modsWatcherMu.Unlock()

	// Double-check if another goroutine already refreshed it while we waited
	s.modsCacheMu.RLock()
	if s.cacheValid {
		s.modsCacheMu.RUnlock()
		return
	}
	s.modsCacheMu.RUnlock()

	mods := s.scanMods()

	s.modsCacheMu.Lock()
	s.cachedMods = mods
	s.cacheValid = true
	if fi, err := os.Stat(s.modsDir); err == nil {
		s.lastDirMtime = fi.ModTime()
	}
	s.modsCacheMu.Unlock()
}

func (s *DaemonServer) checkFilesystemChanges() {
	fi, err := os.Stat(s.modsDir)
	if err != nil {
		return
	}

	s.modsCacheMu.RLock()
	valid := s.cacheValid
	lastMtime := s.lastDirMtime
	s.modsCacheMu.RUnlock()

	if valid && !fi.ModTime().Equal(lastMtime) {
		s.modsCacheMu.Lock()
		s.cacheValid = false
		s.modsCacheMu.Unlock()
	}
}

func (s *DaemonServer) InvalidateCache() {
	s.modsCacheMu.Lock()
	s.cacheValid = false
	s.modsCacheMu.Unlock()
}

func (s *DaemonServer) scanMods() []ModManifest {
	var mods []ModManifest
	entries, err := os.ReadDir(s.modsDir)
	if err != nil {
		return mods
	}

	s.stateMu.RLock()
	defer s.stateMu.RUnlock()

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifestPath := filepath.Join(s.modsDir, entry.Name(), "mod.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}

		var m ModManifest
		if json.Unmarshal(data, &m) == nil {
			m.Path = filepath.Join(s.modsDir, entry.Name())
			m.Enabled = !s.disabled[m.ID]
			mods = append(mods, m)
		}
	}

	return mods
}

func (s *DaemonServer) handleDaemonSpawn(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ModID      string   `json:"modId"`
		BinaryPath string   `json:"binaryPath"`
		Args       []string `json:"args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	cleanModID := filepath.Clean(req.ModID)
	if req.ModID == "" || filepath.IsAbs(cleanModID) || strings.Contains(cleanModID, "..") || strings.ContainsAny(cleanModID, `/\`) {
		http.Error(w, "Invalid mod id", http.StatusForbidden)
		return
	}

	cleanBin := filepath.Clean(req.BinaryPath)
	if req.BinaryPath == "" || strings.Contains(cleanBin, "..") ||
		filepath.IsAbs(req.BinaryPath) || filepath.IsAbs(cleanBin) ||
		strings.HasPrefix(req.BinaryPath, "/") || strings.HasPrefix(req.BinaryPath, "\\") ||
		strings.HasPrefix(cleanBin, "/") || strings.HasPrefix(cleanBin, "\\") ||
		filepath.VolumeName(cleanBin) != "" {
		http.Error(w, "Executable must reside inside mod directory", http.StatusForbidden)
		return
	}

	modDir := filepath.Join(s.modsDir, cleanModID)
	execPath := filepath.Join(modDir, cleanBin)

	// Executable MUST reside inside the mod's specific directory
	rel, err := filepath.Rel(modDir, execPath)
	if err != nil || strings.HasPrefix(rel, "..") || strings.Contains(rel, "..") || !strings.HasPrefix(execPath, modDir) {
		http.Error(w, "Executable must reside inside mod directory", http.StatusForbidden)
		return
	}

	s.procsMu.Lock()
	defer s.procsMu.Unlock()

	// If already running, kill previous instance
	if existing, ok := s.procs[req.ModID]; ok && existing != nil && existing.Process != nil {
		_ = existing.Process.Kill()
	}

	cmd := exec.Command(execPath, req.Args...)
	if err := cmd.Start(); err != nil {
		http.Error(w, fmt.Sprintf("Failed to spawn daemon: %v", err), http.StatusInternalServerError)
		return
	}

	s.procs[req.ModID] = cmd
	s.Log("INFO", fmt.Sprintf("Spawned daemon for mod %s (pid: %d)", req.ModID, cmd.Process.Pid))

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":    true,
		"pid":   cmd.Process.Pid,
		"modId": req.ModID,
	})
}

func (s *DaemonServer) handleDaemonKill(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ModID string `json:"modId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.procsMu.Lock()
	defer s.procsMu.Unlock()

	if cmd, ok := s.procs[req.ModID]; ok && cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
		delete(s.procs, req.ModID)
		s.Log("INFO", fmt.Sprintf("Killed daemon for mod %s", req.ModID))
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "modId": req.ModID})
}
