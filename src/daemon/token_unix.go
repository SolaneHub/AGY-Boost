//go:build !windows

package daemon

import "os"

// writeSecureToken writes the daemon security token to tokenPath with restricted permissions (0600 on Unix/macOS).
func writeSecureToken(tokenPath, token string) error {
	return os.WriteFile(tokenPath, []byte(token), 0600)
}
