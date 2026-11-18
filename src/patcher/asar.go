package patcher

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type asarEntry struct {
	Size   int                   `json:"size,omitempty"`
	Offset string                `json:"offset,omitempty"`
	Files  map[string]*asarEntry `json:"files,omitempty"`
}

type asarHeader struct {
	Files map[string]*asarEntry `json:"files"`
}

// PackAsar creates a valid Electron .asar archive from a map of relative file paths to their byte contents.
// It supports nested paths such as "dist/main.js" or "bundle/entry.cjs".
func PackAsar(files map[string][]byte, destPath string) error {
	header := asarHeader{
		Files: make(map[string]*asarEntry),
	}

	var payload bytes.Buffer
	currentOffset := 0

	for name, content := range files {
		cleanName := filepath.ToSlash(filepath.Clean(name))
		parts := strings.Split(strings.Trim(cleanName, "/"), "/")

		currentFiles := header.Files
		for i, part := range parts {
			if i == len(parts)-1 {
				// Leaf file
				entry := &asarEntry{
					Size:   len(content),
					Offset: fmt.Sprintf("%d", currentOffset),
				}
				currentFiles[part] = entry
				payload.Write(content)
				currentOffset += len(content)
			} else {
				// Intermediate directory
				dirEntry, exists := currentFiles[part]
				if !exists || dirEntry == nil {
					dirEntry = &asarEntry{
						Files: make(map[string]*asarEntry),
					}
					currentFiles[part] = dirEntry
				}
				if dirEntry.Files == nil {
					dirEntry.Files = make(map[string]*asarEntry)
				}
				currentFiles = dirEntry.Files
			}
		}
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return fmt.Errorf("failed to marshal asar header: %w", err)
	}

	jsonLen := len(headerJSON)
	padding := (4 - (jsonLen % 4)) % 4
	alignedJsonLen := jsonLen + padding

	headerPayloadSize := 4 + alignedJsonLen
	headerBufSize := 4 + headerPayloadSize // 8 + alignedJsonLen

	out, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("failed to create destination file: %w", err)
	}
	defer out.Close()

	// 1. sizePickle (8 bytes):
	// uint32(4): payload size of sizePickle
	// uint32(headerBufSize): header size (read by Electron asar reader)
	var sizeBuf [8]byte
	binary.LittleEndian.PutUint32(sizeBuf[0:4], 4)
	binary.LittleEndian.PutUint32(sizeBuf[4:8], uint32(headerBufSize))
	if _, err := out.Write(sizeBuf[:]); err != nil {
		return err
	}

	// 2. headerPickle (8 bytes pickle metadata + json + padding):
	// uint32(headerPayloadSize): payload size of headerPickle
	// uint32(jsonLen): actual UTF-8 string byte length
	var headerPickleBuf [8]byte
	binary.LittleEndian.PutUint32(headerPickleBuf[0:4], uint32(headerPayloadSize))
	binary.LittleEndian.PutUint32(headerPickleBuf[4:8], uint32(jsonLen))
	if _, err := out.Write(headerPickleBuf[:]); err != nil {
		return err
	}

	if _, err := out.Write(headerJSON); err != nil {
		return err
	}

	if padding > 0 {
		padBytes := make([]byte, padding)
		if _, err := out.Write(padBytes); err != nil {
			return err
		}
	}

	// 3. Payload containing all files
	if _, err := io.Copy(out, &payload); err != nil {
		return err
	}

	return nil
}

// AsarFileExists checks whether a relative file path exists within an Electron .asar archive.
func AsarFileExists(asarPath string, filePath string) bool {
	f, err := os.Open(asarPath)
	if err != nil {
		return false
	}
	defer f.Close()

	var sizeBuf [8]byte
	if _, err := io.ReadFull(f, sizeBuf[:]); err != nil {
		return false
	}

	headerBufSize := binary.LittleEndian.Uint32(sizeBuf[4:8])
	if headerBufSize < 8 {
		return false
	}

	var headerPickleBuf [8]byte
	if _, err := io.ReadFull(f, headerPickleBuf[:]); err != nil {
		return false
	}

	jsonLen := binary.LittleEndian.Uint32(headerPickleBuf[4:8])
	if jsonLen == 0 || jsonLen > 50*1024*1024 {
		return false
	}

	jsonBytes := make([]byte, jsonLen)
	if _, err := io.ReadFull(f, jsonBytes); err != nil {
		return false
	}

	var header asarHeader
	if err := json.Unmarshal(jsonBytes, &header); err != nil {
		return false
	}

	cleanPath := filepath.ToSlash(filepath.Clean(filePath))
	parts := strings.Split(strings.Trim(cleanPath, "/"), "/")

	currentFiles := header.Files
	for i, part := range parts {
		entry, ok := currentFiles[part]
		if !ok || entry == nil {
			return false
		}
		if i == len(parts)-1 {
			// Found file
			return entry.Files == nil
		}
		if entry.Files == nil {
			return false
		}
		currentFiles = entry.Files
	}

	return false
}

// If the path contains subdirectories (e.g. "dist/main.js"), it resolves through the nested directory structure.
func ReadAsarFile(asarPath string, filePath string) ([]byte, error) {
	f, err := os.Open(asarPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var sizeBuf [8]byte
	if _, err := io.ReadFull(f, sizeBuf[:]); err != nil {
		return nil, fmt.Errorf("failed to read asar size header: %w", err)
	}

	headerBufSize := binary.LittleEndian.Uint32(sizeBuf[4:8])
	if headerBufSize < 8 {
		return nil, fmt.Errorf("invalid asar header size: %d", headerBufSize)
	}

	var headerPickleBuf [8]byte
	if _, err := io.ReadFull(f, headerPickleBuf[:]); err != nil {
		return nil, fmt.Errorf("failed to read asar header pickle: %w", err)
	}

	jsonLen := binary.LittleEndian.Uint32(headerPickleBuf[4:8])
	if jsonLen == 0 || jsonLen > 50*1024*1024 {
		return nil, fmt.Errorf("invalid asar header json length: %d", jsonLen)
	}

	jsonBytes := make([]byte, jsonLen)
	if _, err := io.ReadFull(f, jsonBytes); err != nil {
		return nil, fmt.Errorf("failed to read asar header json: %w", err)
	}

	var header asarHeader
	if err := json.Unmarshal(jsonBytes, &header); err != nil {
		return nil, fmt.Errorf("failed to parse asar header json: %w", err)
	}

	// Payload start offset in the .asar file
	payloadBase := int64(8 + headerBufSize)

	// Clean and split file path into components
	cleanPath := filepath.ToSlash(filepath.Clean(filePath))
	parts := strings.Split(strings.Trim(cleanPath, "/"), "/")

	currentFiles := header.Files
	for i, part := range parts {
		entry, ok := currentFiles[part]
		if !ok || entry == nil {
			return nil, fmt.Errorf("file not found in asar: %s", filePath)
		}

		if i == len(parts)-1 {
			// Target file reached
			var offsetInt int64
			if _, err := fmt.Sscanf(entry.Offset, "%d", &offsetInt); err != nil {
				return nil, fmt.Errorf("invalid offset in asar for %s: %w", filePath, err)
			}

			targetOffset := payloadBase + offsetInt
			if _, err := f.Seek(targetOffset, io.SeekStart); err != nil {
				return nil, fmt.Errorf("failed to seek to file offset in asar: %w", err)
			}

			content := make([]byte, entry.Size)
			if _, err := io.ReadFull(f, content); err != nil {
				return nil, fmt.Errorf("failed to read file content from asar: %w", err)
			}
			return content, nil
		}

		// Intermediate directory
		if entry.Files == nil {
			return nil, fmt.Errorf("expected directory at %s in asar", part)
		}
		currentFiles = entry.Files
	}

	return nil, fmt.Errorf("file not found in asar: %s", filePath)
}
