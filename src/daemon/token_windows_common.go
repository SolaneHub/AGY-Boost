package daemon

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"strings"
)

// icaclsRunner decouples command execution for Windows icacls logic, enabling cross-platform testing.
var icaclsRunner = func(name string, arg ...string) *exec.Cmd {
	return exec.Command(name, arg...)
}

// lookupWindowsUsername resolves username for Windows ACL configuration with fallbacks:
// USERNAME -> USER -> user.Current().
func lookupWindowsUsername() (string, error) {
	if u := os.Getenv("USERNAME"); u != "" {
		return u, nil
	}
	if u := os.Getenv("USER"); u != "" {
		return u, nil
	}
	currUser, err := user.Current()
	if err == nil && currUser.Username != "" {
		return currUser.Username, nil
	}
	return "", fmt.Errorf("unable to determine Windows username: USERNAME and USER unset and user.Current() failed")
}

// ensureSecureTokenPermissionsWindows executes icacls lockdown to strip inherited ACLs and grant exclusive RW permissions.
func ensureSecureTokenPermissionsWindows(tokenPath string) error {
	fi, err := os.Lstat(tokenPath)
	if err != nil {
		return err
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("refusing to set permissions on symlink: %s", tokenPath)
	}

	username, err := lookupWindowsUsername()
	if err != nil {
		return fmt.Errorf("cannot secure token permissions: %w", err)
	}

	cmd := icaclsRunner("icacls", tokenPath, "/inheritance:r", "/grant:r", fmt.Sprintf("%s:(R,W)", username))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to secure token permissions via icacls: %w (output: %s)", err, string(out))
	}
	return nil
}

// validateSecureTokenPermissionsWindows validates token file existence, regular mode, and parses icacls output.
func validateSecureTokenPermissionsWindows(tokenPath string) error {
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

	cmd := icaclsRunner("icacls", tokenPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to validate token ACLs via icacls: %w (output: %s)", err, string(out))
	}

	outStr := string(out)
	if strings.Contains(outStr, "(I)") {
		return fmt.Errorf("token file %s has insecure inherited ACLs", tokenPath)
	}
	if strings.Contains(outStr, "Everyone:(") || strings.Contains(outStr, "BUILTIN\\Users:(") || strings.Contains(outStr, "NT AUTHORITY\\Authenticated Users:(") {
		return fmt.Errorf("token file %s has overly permissive access grants", tokenPath)
	}

	username, uerr := lookupWindowsUsername()
	if uerr == nil && username != "" {
		if !strings.Contains(outStr, username+":(R,W)") && !strings.Contains(outStr, username+":(F)") {
			return fmt.Errorf("token file %s lacks exclusive permissions for %s", tokenPath, username)
		}
	}

	return nil
}
