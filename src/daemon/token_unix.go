//go:build !windows

package daemon

import (
	"fmt"
	"os"
)

// validateSecureTokenPermissions verifies that tokenPath exists, is a regular file (not a symlink),
// and has strict 0600 mode permissions on POSIX / Unix platforms.
func validateSecureTokenPermissions(tokenPath string) error {
	fi, err := os.Lstat(tokenPath)
	if err != nil {
		return err
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("token file %s is a symlink", tokenPath)
	}
	if !fi.Mode().IsRegular() {
		return fmt.Errorf("token file %s is not a regular file", tokenPath)
	}
	if fi.Mode().Perm() != 0600 {
		return fmt.Errorf("token file %s has insecure permissions %04o (expected 0600)", tokenPath, fi.Mode().Perm())
	}
	return nil
}

// ensureSecureTokenPermissions enforces strict 0600 permissions on tokenPath, refusing symlinks.
func ensureSecureTokenPermissions(tokenPath string) error {
	fi, err := os.Lstat(tokenPath)
	if err != nil {
		return err
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("refusing to set permissions on symlink: %s", tokenPath)
	}
	return os.Chmod(tokenPath, 0600)
}

// writeSecureToken writes the daemon security token to tokenPath with restricted permissions (0600 on Unix/macOS).
func writeSecureToken(tokenPath, token string) error {
	if fi, err := os.Lstat(tokenPath); err == nil {
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("refusing to write token to symlink: %s", tokenPath)
		}
		if !fi.Mode().IsRegular() {
			return fmt.Errorf("refusing to write token to non-regular file: %s", tokenPath)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	if err := os.WriteFile(tokenPath, []byte(token), 0600); err != nil {
		return err
	}
	return ensureSecureTokenPermissions(tokenPath)
}
