//go:build windows

package daemon

import (
	"fmt"
	"os"
	"os/exec"
)

// writeSecureToken writes the daemon security token to tokenPath and locks down ACLs on Windows NTFS.
func writeSecureToken(tokenPath, token string) error {
	if err := os.WriteFile(tokenPath, []byte(token), 0600); err != nil {
		return err
	}

	username := os.Getenv("USERNAME")
	if username == "" {
		return nil
	}

	// Remove inherited ACLs and grant exclusive Read/Write permissions to current user:
	// icacls <tokenPath> /inheritance:r /grant:r "%USERNAME%":(R,W)
	cmd := exec.Command("icacls", tokenPath, "/inheritance:r", "/grant:r", fmt.Sprintf("%s:(R,W)", username))
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to secure token permissions via icacls: %w (output: %s)", err, string(out))
	}

	return nil
}
