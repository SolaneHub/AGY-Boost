package patcher

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
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
func PackAsar(files map[string][]byte, destPath string) error {
	header := asarHeader{
		Files: make(map[string]*asarEntry),
	}

	var payload bytes.Buffer
	currentOffset := 0

	for name, content := range files {
		entry := &asarEntry{
			Size:   len(content),
			Offset: fmt.Sprintf("%d", currentOffset),
		}
		header.Files[name] = entry
		payload.Write(content)
		currentOffset += len(content)
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


