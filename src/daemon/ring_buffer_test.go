package daemon

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestLogRingBuffer_BasicAndCapacity(t *testing.T) {
	rb := NewLogRingBuffer(LogBufferCapacity)

	if rb.Capacity() != 50 {
		t.Fatalf("expected capacity 50, got %d", rb.Capacity())
	}
	if rb.Count() != 0 {
		t.Fatalf("expected initial count 0, got %d", rb.Count())
	}

	// Empty entries must be non-nil slice
	entries := rb.Entries()
	if entries == nil {
		t.Fatal("expected non-nil slice for empty ring buffer")
	}
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries, got %d", len(entries))
	}

	// Add 30 entries
	for i := 0; i < 30; i++ {
		rb.Add(LogEntry{
			Timestamp: time.Now().UTC(),
			Level:     "INFO",
			Message:   fmt.Sprintf("message %d", i),
		})
	}

	if rb.Count() != 30 {
		t.Fatalf("expected count 30, got %d", rb.Count())
	}
	entries = rb.Entries()
	if len(entries) != 30 {
		t.Fatalf("expected 30 entries, got %d", len(entries))
	}
	for i := 0; i < 30; i++ {
		expected := fmt.Sprintf("message %d", i)
		if entries[i].Message != expected {
			t.Fatalf("entry %d: expected message %q, got %q", i, expected, entries[i].Message)
		}
	}

	// Add another 30 entries (total 60 inserted)
	for i := 30; i < 60; i++ {
		rb.Add(LogEntry{
			Timestamp: time.Now().UTC(),
			Level:     "INFO",
			Message:   fmt.Sprintf("message %d", i),
		})
	}

	// Must be capped at capacity (50)
	if rb.Count() != 50 {
		t.Fatalf("expected count 50 after overflow, got %d", rb.Count())
	}
	entries = rb.Entries()
	if len(entries) != 50 {
		t.Fatalf("expected 50 entries after overflow, got %d", len(entries))
	}

	// Entries 0..9 should have been evicted; entries should be message 10 through 59
	for i := 0; i < 50; i++ {
		expected := fmt.Sprintf("message %d", i+10)
		if entries[i].Message != expected {
			t.Fatalf("overflow entry %d: expected message %q, got %q", i, expected, entries[i].Message)
		}
	}
}

func TestLogRingBuffer_ThreadSafety(t *testing.T) {
	rb := NewLogRingBuffer(50)
	var wg sync.WaitGroup

	numWriters := 20
	entriesPerWriter := 50

	// Concurrent writers
	for w := 0; w < numWriters; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for i := 0; i < entriesPerWriter; i++ {
				rb.Add(LogEntry{
					Timestamp: time.Now().UTC(),
					Level:     "DEBUG",
					Message:   fmt.Sprintf("worker %d message %d", workerID, i),
				})
			}
		}(w)
	}

	// Concurrent readers
	stopReaders := make(chan struct{})
	numReaders := 5
	var readerWg sync.WaitGroup
	for r := 0; r < numReaders; r++ {
		readerWg.Add(1)
		go func() {
			defer readerWg.Done()
			for {
				select {
				case <-stopReaders:
					return
				default:
					entries := rb.Entries()
					count := rb.Count()
					if len(entries) > 50 {
						t.Errorf("entries length %d exceeded capacity 50", len(entries))
					}
					if count > 50 {
						t.Errorf("count %d exceeded capacity 50", count)
					}
				}
			}
		}()
	}

	wg.Wait()
	close(stopReaders)
	readerWg.Wait()

	if rb.Count() != 50 {
		t.Fatalf("expected final count 50, got %d", rb.Count())
	}
	finalEntries := rb.Entries()
	if len(finalEntries) != 50 {
		t.Fatalf("expected final entries length 50, got %d", len(finalEntries))
	}
}

func TestLogRingBuffer_Clear(t *testing.T) {
	rb := NewLogRingBuffer(50)
	for i := 0; i < 20; i++ {
		rb.Add(LogEntry{
			Timestamp: time.Now().UTC(),
			Level:     "INFO",
			Message:   fmt.Sprintf("msg %d", i),
		})
	}

	if rb.Count() != 20 {
		t.Fatalf("expected count 20, got %d", rb.Count())
	}

	rb.Clear()

	if rb.Count() != 0 {
		t.Fatalf("expected count 0 after Clear(), got %d", rb.Count())
	}
	entries := rb.Entries()
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after Clear(), got %d", len(entries))
	}
}

func TestLogRingBuffer_WriterInterface(t *testing.T) {
	rb := NewLogRingBuffer(50)
	n, err := rb.Write([]byte("system booting up\n"))
	if err != nil {
		t.Fatalf("unexpected write error: %v", err)
	}
	if n != len("system booting up\n") {
		t.Fatalf("expected %d bytes written, got %d", len("system booting up\n"), n)
	}

	entries := rb.Entries()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Message != "system booting up" {
		t.Fatalf("expected message 'system booting up', got %q", entries[0].Message)
	}
	if entries[0].Level != "INFO" {
		t.Fatalf("expected level 'INFO', got %q", entries[0].Level)
	}
}
