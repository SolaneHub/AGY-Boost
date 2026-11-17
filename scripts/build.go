// Pure native Go build and tooling utility for AGY Boost
// Replaces legacy .mjs wrapper scripts with idiomatic, zero-dependency Go.

package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]
	args := os.Args[2:]

	switch command {
	case "format":
		runFormat(args)
	case "lint":
		runLint(args)
	case "typecheck":
		runTypecheck(args)
	case "copy-runtime":
		runCopyRuntime()
	case "test-selective":
		runTestSelective()
	case "build":
		target := "host"
		if len(args) > 0 {
			target = args[0]
		}
		runBuild(target)
	case "all":
		runBuild("all")
	case "win":
		runBuild("win")
	case "linux":
		runBuild("linux")
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("Usage: go run ./scripts/build.go <command> [args...]")
	fmt.Println("Commands:")
	fmt.Println("  format [--check]       Format Go files using gofmt (-w or -l)")
	fmt.Println("  lint                   Run go vet and golangci-lint")
	fmt.Println("  typecheck              Typecheck Go packages ('go test -run=^$ ./...')")
	fmt.Println("  copy-runtime           Deploy client runtime to embedded and dist")
	fmt.Println("  test-selective         Run selective test loop based on git diff")
	fmt.Println("  build [target]         Build CLI binary (host, win, linux, all)")
}

func runFormat(args []string) {
	isCheck := false
	for _, a := range args {
		if a == "--check" {
			isCheck = true
			break
		}
	}

	if isCheck {
		cmd := exec.Command("gofmt", "-l", "-s", ".")
		var stdout bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Error executing gofmt: %v\n", err)
			os.Exit(1)
		}

		unformatted := strings.TrimSpace(stdout.String())
		if unformatted != "" {
			fmt.Fprintln(os.Stderr, "The following Go files are not formatted properly:")
			for _, file := range strings.Split(unformatted, "\n") {
				file = strings.TrimSpace(file)
				if file != "" {
					fmt.Fprintf(os.Stderr, "  - %s\n", file)
				}
			}
			fmt.Fprintln(os.Stderr, "\nRun 'pnpm run format' or 'gofmt -w -s .' to fix them.")
			os.Exit(1)
		}
		fmt.Println("All Go files are properly formatted.")
	} else {
		cmd := exec.Command("gofmt", "-w", "-s", ".")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to format Go files: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Formatted Go files with gofmt.")
	}
}

func runLint(_ []string) {
	fmt.Println("Running 'go vet ./...'...")
	vetCmd := exec.Command("go", "vet", "./...")
	vetCmd.Stdout = os.Stdout
	vetCmd.Stderr = os.Stderr
	if err := vetCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "go vet failed: %v\n", err)
		os.Exit(1)
	}

	golangciLint := findGolangciLint()
	if golangciLint != "" {
		fmt.Printf("Running '%s run ./...'...\n", golangciLint)
		lintCmd := exec.Command(golangciLint, "run", "./...")
		lintCmd.Stdout = os.Stdout
		lintCmd.Stderr = os.Stderr
		if err := lintCmd.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "golangci-lint failed: %v\n", err)
			os.Exit(1)
		}
	} else {
		fmt.Println("golangci-lint not found; 'go vet' passed. Install golangci-lint for additional checks.")
	}

	fmt.Println("Go lint checks passed.")
}

func findGolangciLint() string {
	if path, err := exec.LookPath("golangci-lint"); err == nil {
		return path
	}

	cmd := exec.Command("go", "env", "GOPATH")
	out, err := cmd.Output()
	if err == nil {
		gopath := strings.TrimSpace(string(out))
		if gopath != "" {
			candidate := filepath.Join(gopath, "bin", "golangci-lint")
			if runtime.GOOS == "windows" {
				candidate += ".exe"
			}
			if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
				return candidate
			}
		}
	}

	return ""
}

func runTypecheck(_ []string) {
	fmt.Println("Typechecking Go packages and tests ('go test -run=^$ ./...')...")
	cmd := exec.Command("go", "test", "-run=^$", "./...")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Go typecheck failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Go typecheck passed.")
}

func runCopyRuntime() {
	src := filepath.Join("src", "client", "dist", "agy-boost.js")
	embeddedDest := filepath.Join("src", "cli", "embedded", "runtime.js")
	distDest := filepath.Join("dist", "agy-boost.js")

	if err := os.MkdirAll(filepath.Dir(embeddedDest), 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create embedded directory: %v\n", err)
		os.Exit(1)
	}
	if err := os.MkdirAll("dist", 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create dist directory: %v\n", err)
		os.Exit(1)
	}

	if err := copyFile(src, embeddedDest); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to copy to embedded runtime: %v\n", err)
		os.Exit(1)
	}
	if err := copyFile(src, distDest); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to copy to dist: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Successfully deployed runtime assets.")
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func runTestSelective() {
	cmd := exec.Command("git", "status", "--porcelain")
	out, err := cmd.Output()
	var changedFiles []string
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if len(line) > 3 {
				changedFiles = append(changedFiles, strings.TrimSpace(line[3:]))
			}
		}
	}

	fmt.Printf("[Fast-Loop] %d file modificati rilevati.\n", len(changedFiles))

	runClient := false
	runGo := false
	runInvariants := false

	if len(changedFiles) == 0 {
		runClient = true
		runGo = true
	} else {
		for _, f := range changedFiles {
			if strings.HasPrefix(f, "src/client/") || strings.HasPrefix(f, "tests/ui/") || strings.HasPrefix(f, "tests/core/") {
				runClient = true
			}
			if (strings.HasPrefix(f, "src/") && strings.HasSuffix(f, ".go")) ||
				(strings.HasPrefix(f, "tests/") && strings.HasSuffix(f, ".go")) ||
				(strings.HasPrefix(f, "scripts/") && strings.HasSuffix(f, ".go")) {
				runGo = true
			}
			if strings.HasPrefix(f, "tests/ci/") || f == "package.json" || f == ".gitignore" || f == "biome.json" {
				runInvariants = true
			}
		}
	}

	start := time.Now()

	nodeModulesExist := false
	if fi, err := os.Stat("node_modules"); err == nil && fi.IsDir() {
		nodeModulesExist = true
	}

	if (runClient || runInvariants) && !nodeModulesExist {
		fmt.Println("⚠️  node_modules non trovato nella root del progetto.")
		fmt.Println("   Esecuzione fallback sicuro su unit test Go ('go test -short ./src/...').")
		executeCommand("go", "test", "-short", "./src/...")
		fmt.Printf("✓ Fast-loop (fallback Go) completato con successo in %v\n", time.Since(start))
		return
	}

	if runClient {
		fmt.Println("⚡ Esecuzione rapida test client...")
		executeCommand("pnpm", "--dir", "src/client", "run", "typecheck")
		executeCommand("node", "--import", "./tests/harness/register-loader.mjs", "--test", "tests/core/*.test.ts", "tests/ui/*.test.ts")
	}

	if runGo {
		fmt.Println("⚡ Esecuzione rapida unit test Go...")
		executeCommand("go", "test", "-short", "./src/...")
	}

	if runInvariants {
		fmt.Println("⚡ Esecuzione radar invarianti...")
		executeCommand("node", "--import", "./tests/harness/register-loader.mjs", "--test", "tests/ci/*.test.ts")
	}

	fmt.Printf("✓ Fast-loop completato con successo in %v\n", time.Since(start))
}

func executeCommand(name string, args ...string) {
	c := exec.Command(name, args...)
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	c.Stdin = os.Stdin
	if err := c.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Command failed (%s): %v\n", name, err)
		os.Exit(1)
	}
}

func runBuild(target string) {
	if err := os.MkdirAll("dist", 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create dist directory: %v\n", err)
		os.Exit(1)
	}

	hostOut := filepath.Join("dist", "agy-boost")
	if runtime.GOOS == "windows" {
		hostOut += ".exe"
	}

	switch target {
	case "all":
		buildBinary(hostOut, nil)
		buildBinary(filepath.Join("dist", "agy-boost-darwin-arm64"), map[string]string{"GOOS": "darwin", "GOARCH": "arm64"})
		buildBinary(filepath.Join("dist", "agy-boost-darwin-amd64"), map[string]string{"GOOS": "darwin", "GOARCH": "amd64"})
		buildBinary(filepath.Join("dist", "agy-boost-linux-amd64"), map[string]string{"GOOS": "linux", "GOARCH": "amd64"})
		buildBinary(filepath.Join("dist", "agy-boost-windows-amd64.exe"), map[string]string{"GOOS": "windows", "GOARCH": "amd64"})
	case "darwin-arm64":
		buildBinary(filepath.Join("dist", "agy-boost-darwin-arm64"), map[string]string{"GOOS": "darwin", "GOARCH": "arm64"})
	case "darwin-amd64":
		buildBinary(filepath.Join("dist", "agy-boost-darwin-amd64"), map[string]string{"GOOS": "darwin", "GOARCH": "amd64"})
	case "win":
		buildBinary(filepath.Join("dist", "agy-boost.exe"), map[string]string{"GOOS": "windows", "GOARCH": "amd64"})
	case "linux":
		buildBinary(filepath.Join("dist", "agy-boost-linux"), map[string]string{"GOOS": "linux", "GOARCH": "amd64"})
	default:
		buildBinary(hostOut, nil)
	}
}

func buildBinary(outPath string, envVars map[string]string) {
	cleanPath := filepath.Clean(outPath)
	cmd := exec.Command("go", "build", "-trimpath", "-o", cleanPath, "./src/cli")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if len(envVars) > 0 {
		cmd.Env = os.Environ()
		for k, v := range envVars {
			cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
		}
	}

	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Build failed for %s: %v\n", cleanPath, err)
		os.Exit(1)
	}
}
