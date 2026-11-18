//go:build windows

package daemon

import (
	"fmt"
	"os"
)

// ensureSecureTokenPermissions enforces strict ACLs on the token file via icacls on Windows.
func ensureSecureTokenPermissions(tokenPath string) error {
	return ensureSecureTokenPermissionsWindows(tokenPath)
}

// validateSecureTokenPermissions validates that the token file exists, is regular, and has valid ACLs via icacls.
func validateSecureTokenPermissions(tokenPath string) error {
	return validateSecureTokenPermissionsWindows(tokenPath)
}

// writeSecureToken writes the daemon security token to tokenPath and locks down ACLs on Windows NTFS.
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
