// Tooling script to extract daemon API contracts and generate intermediate JSON schema.
// Usage: go run ./tests/tooling/genschema

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/agy-boost/agy-boost/src/daemon"
)

type FieldSchema struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Optional bool   `json:"optional"`
}

type TypeSchema struct {
	Name   string                 `json:"name"`
	Fields map[string]FieldSchema `json:"fields"`
}

type ContractSchema struct {
	Version   string                `json:"version"`
	Generated string                `json:"generated"`
	Types     map[string]TypeSchema `json:"types"`
}

func inspectType(t reflect.Type) TypeSchema {
	if t.Kind() == reflect.Pointer {
		t = t.Elem()
	}

	fields := make(map[string]FieldSchema)

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}

		jsonTag := field.Tag.Get("json")
		if jsonTag == "-" {
			continue
		}

		fieldName := field.Name
		optional := false

		if jsonTag != "" {
			parts := strings.Split(jsonTag, ",")
			if parts[0] != "" {
				fieldName = parts[0]
			}
			for _, opt := range parts[1:] {
				if opt == "omitempty" {
					optional = true
				}
			}
		}

		fieldTypeStr := resolveTypeString(field.Type)

		fields[fieldName] = FieldSchema{
			Name:     fieldName,
			Type:     fieldTypeStr,
			Optional: optional,
		}
	}

	return TypeSchema{
		Name:   t.Name(),
		Fields: fields,
	}
}

func resolveTypeString(t reflect.Type) string {
	if t.Kind() == reflect.Pointer {
		return resolveTypeString(t.Elem())
	}

	// Special-case time.Time
	if t == reflect.TypeOf(time.Time{}) {
		return "string" // ISO 8601 string
	}

	switch t.Kind() {
	case reflect.String:
		return "string"
	case reflect.Bool:
		return "boolean"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number"
	case reflect.Slice, reflect.Array:
		elemType := resolveTypeString(t.Elem())
		return elemType + "[]"
	case reflect.Interface:
		return "any"
	case reflect.Struct:
		return t.Name()
	case reflect.Map:
		return fmt.Sprintf("Record<string, %s>", resolveTypeString(t.Elem()))
	default:
		return "unknown"
	}
}

func main() {
	contract := ContractSchema{
		Version:   "1.0.0",
		Generated: time.Now().UTC().Format(time.RFC3339),
		Types:     make(map[string]TypeSchema),
	}

	// Register all contractual IPC structs
	typesToInspect := []any{
		daemon.ModManifest{},
		daemon.DiagnosticsResponse{},
		daemon.LogEntry{},
		daemon.ModTogglePayload{},
		daemon.ModToggleResponse{},
		daemon.OpenFolderResponse{},
		daemon.DaemonSpawnPayload{},
		daemon.DaemonSpawnResponse{},
		daemon.DaemonKillPayload{},
		daemon.DaemonKillResponse{},
		daemon.HealthResponse{},
		daemon.AuthTokenHeaders{},
	}

	for _, sample := range typesToInspect {
		schema := inspectType(reflect.TypeOf(sample))
		contract.Types[schema.Name] = schema
	}

	data, err := json.MarshalIndent(contract, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to serialize contract schema: %v\n", err)
		os.Exit(1)
	}
	data = append(data, '\n')

	outDir := filepath.Join("tests", "harness", "contracts")
	if err := os.MkdirAll(outDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create contracts dir: %v\n", err)
		os.Exit(1)
	}

	outFile := filepath.Join(outDir, "daemon_api.json")
	if err := os.WriteFile(outFile, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write schema file: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Generated daemon API contract schema at %s (%d types)\n", outFile, len(contract.Types))
}
